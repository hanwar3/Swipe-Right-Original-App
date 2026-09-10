-- Tier 2: merchant offers by forwarded email.
--
-- No aggregator sells targeted issuer offers (Amex Offers, Chase Offers,
-- BofA Deals) at any price, because they are marketing inventory inside the
-- issuer's app rather than transactions. But every issuer emails you when new
-- ones land. The user forwards those to an address we own, and we parse them.
-- No credentials, no scraping, works on a phone.

-- ---------------------------------------------------------------
-- 1. One forwarding address per user.
-- The token is the identity: we trust the address the mail arrived AT, never
-- the From header, which is trivially forged.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offer_inboxes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_received_at TIMESTAMP WITH TIME ZONE,
  received_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_offer_inbox_token ON offer_inboxes(token);

-- ---------------------------------------------------------------
-- 2. Ingest log.
--
-- raw_excerpt exists so a parser that misses can be improved against the mail
-- that beat it. It is a privacy liability, so: only stored when parsing found
-- nothing, capped in length, and purged by the retention job below.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offer_ingests (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  issuer TEXT,
  from_address TEXT,
  subject TEXT,
  parser TEXT NOT NULL DEFAULT 'none',   -- which parser produced the result
  offers_found INTEGER NOT NULL DEFAULT 0,
  offers_written INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',     -- 'ok' | 'unparsed' | 'no_card' | 'rejected'
  raw_excerpt TEXT,
  purge_after DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_ingest_user ON offer_ingests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_ingest_purge ON offer_ingests(purge_after)
  WHERE raw_excerpt IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. Provenance on the offers themselves, so a re-parse can supersede an
-- earlier guess without touching offers the user entered by hand.
-- ---------------------------------------------------------------
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS source_ingest_id BIGINT;
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS confidence REAL;

CREATE INDEX IF NOT EXISTS idx_merchant_offers_source ON merchant_offers(user_id, source);

-- De-duplicate: the same offer forwarded twice must not become two rows.
-- card_id is COALESCEd because an unattributed offer has none, and NULLs do
-- not collide in a unique index, so without this the same held offer would
-- pile up on every re-forward.
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_offers_dedupe
  ON merchant_offers (
    user_id,
    COALESCE(card_id, -1),
    LOWER(merchant_name),
    COALESCE(end_date, DATE '2099-12-31')
  );

-- ---------------------------------------------------------------
-- 4. Attribution.
--
-- One SwipeRight account, but the cards behind it are often registered to
-- different mailboxes, and a wallet can hold two cards from one issuer. The
-- issuer alone therefore cannot say which card an offer belongs to. Three
-- signals, strongest first:
--
--   last_four    issuer offer mail usually says "card ending in 1234"
--   inbox_token  a per-card forwarding address, for people who want it exact
--   card_email   the address the card is registered to, matched against the
--                Delivered-To / X-Forwarded-To header that survives forwarding
-- ---------------------------------------------------------------
ALTER TABLE user_portfolios ADD COLUMN IF NOT EXISTS last_four TEXT;
ALTER TABLE user_portfolios ADD COLUMN IF NOT EXISTS card_email TEXT;
ALTER TABLE user_portfolios ADD COLUMN IF NOT EXISTS inbox_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_inbox_token
  ON user_portfolios(inbox_token) WHERE inbox_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portfolio_last_four
  ON user_portfolios(user_id, last_four) WHERE last_four IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portfolio_card_email
  ON user_portfolios(user_id, LOWER(card_email)) WHERE card_email IS NOT NULL;

-- An offer we could not attribute is held, not dropped. The user assigns it
-- with one tap, and that answer teaches us the last_four for next time.
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS pending_issuer TEXT;
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS pending_last_four TEXT;

CREATE INDEX IF NOT EXISTS idx_merchant_offers_pending
  ON merchant_offers(user_id) WHERE card_id IS NULL;
