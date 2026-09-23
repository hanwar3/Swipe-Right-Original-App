-- Tier 2b: what the issuer's own portal knows about YOUR card.
--
-- Targeted offers (Chase Offers, Amex Offers) and benefit usage ("$290 of your
-- $300 travel credit") exist nowhere except behind your login. No aggregator
-- sells them. So the data arrives from the portal itself: pasted by the user
-- today, captured by the browser extension later. Both write these columns.

-- ---------------------------------------------------------------
-- 1. Offers: identity, activation and freshness.
--
-- An offer that is not activated pays nothing, so is_activated (already here)
-- is the difference between a real recommendation and a wrong one. last_seen_at
-- and disappeared_at let a later sync retire offers the portal stopped showing
-- without deleting history.
-- ---------------------------------------------------------------
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS disappeared_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE merchant_offers ADD COLUMN IF NOT EXISTS offer_url TEXT;

-- The issuer's own id wins as the dedupe key when a sync provides one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_offers_external
  ON merchant_offers (user_id, card_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_offers_live
  ON merchant_offers (user_id, card_id)
  WHERE disappeared_at IS NULL AND is_used = FALSE;

-- ---------------------------------------------------------------
-- 2. Benefits only one person has.
--
-- card_benefits was a shared catalogue: one row per card, seen by everyone.
-- A portal shows benefits the catalogue never listed, and sometimes a figure
-- that differs per cardholder. A row with user_id set belongs to that person;
-- NULL keeps today's meaning, so the engine's join stays one code path.
-- ---------------------------------------------------------------
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'catalogue';

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_benefits_identity
  ON card_benefits (card_id, COALESCE(user_id, ''), LOWER(name));

CREATE INDEX IF NOT EXISTS idx_card_benefits_user
  ON card_benefits (user_id) WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. Usage: how much is gone, when it resets, and how fresh the number is.
--
-- A tapped "I used $50" and a figure read off the portal are not equally
-- trustworthy, so each usage row now says where it came from and when it was
-- true. The portal wins; a manual tap fills the gap between syncs.
-- ---------------------------------------------------------------
ALTER TABLE user_benefit_usage ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE user_benefit_usage ADD COLUMN IF NOT EXISTS as_of TIMESTAMP WITH TIME ZONE;

-- Issuer credits run on anniversary years, not calendar ones, so the portal's
-- own "Good through 6/15/2027" beats anything computed from a period name.
ALTER TABLE user_benefit_usage ADD COLUMN IF NOT EXISTS ends_on DATE;

-- ---------------------------------------------------------------
-- 4. Sync log: one row per paste or capture.
--
-- The sibling of offer_ingests. It answers "when did this card last tell us
-- anything" in the UI, and "which parser is failing" when a portal changes.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_syncs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id BIGINT REFERENCES cards(id) ON DELETE SET NULL,
  issuer TEXT,
  kind TEXT NOT NULL,                     -- 'offers' | 'benefit' | 'mixed'
  method TEXT NOT NULL DEFAULT 'paste',   -- 'paste' | 'extension'
  parser TEXT NOT NULL DEFAULT 'none',    -- 'deterministic' | 'model' | 'none'
  offers_found INTEGER NOT NULL DEFAULT 0,
  offers_written INTEGER NOT NULL DEFAULT 0,
  offers_retired INTEGER NOT NULL DEFAULT 0,
  benefits_found INTEGER NOT NULL DEFAULT 0,
  benefits_written INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',      -- 'ok' | 'unparsed' | 'rejected'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_syncs_lookup
  ON portal_syncs (user_id, card_id, created_at DESC);

-- The account label the portal shows, e.g. "Sapphire Reserve (...0771)". Paired
-- with last_four it is how a paste finds the right card without being told.
ALTER TABLE user_portfolios ADD COLUMN IF NOT EXISTS portal_account TEXT;
