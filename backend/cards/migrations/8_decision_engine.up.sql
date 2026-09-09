-- Data model for the deterministic decision engine.
-- Three things the old schema could not express:
--   1. spend caps ("3% on gas up to $6,000/yr")
--   2. user-chosen rotating categories ("this quarter my Amex Blue is gas, not groceries")
--   3. benefits that expire if unused ("$50 hotel credit, gone in 12 days")

-- ---------------------------------------------------------------
-- 1. Canonical category keys.
-- The seed data carries Dining AND Restaurants, Gas AND Gas Stations,
-- Groceries AND Supermarkets as separate rows, which silently splits
-- the ranking. category_key collapses them.
-- ---------------------------------------------------------------
ALTER TABLE card_categories ADD COLUMN IF NOT EXISTS category_key TEXT;
ALTER TABLE card_categories ADD COLUMN IF NOT EXISTS cap_amount INTEGER;  -- cents; NULL = uncapped
ALTER TABLE card_categories ADD COLUMN IF NOT EXISTS cap_period TEXT;     -- 'month' | 'quarter' | 'year'

UPDATE card_categories SET category_key = CASE
  WHEN LOWER(category) IN ('dining', 'restaurants')            THEN 'dining'
  WHEN LOWER(category) IN ('gas', 'gas stations')              THEN 'gas'
  WHEN LOWER(category) IN ('groceries', 'supermarkets')        THEN 'groceries'
  WHEN LOWER(category) IN ('travel')                           THEN 'travel'
  WHEN LOWER(category) IN ('flights')                          THEN 'flights'
  WHEN LOWER(category) IN ('hotels')                           THEN 'hotels'
  WHEN LOWER(category) IN ('streaming')                        THEN 'streaming'
  WHEN LOWER(category) IN ('transit')                          THEN 'transit'
  WHEN LOWER(category) IN ('entertainment')                    THEN 'entertainment'
  WHEN LOWER(category) IN ('drugstores')                       THEN 'drugstores'
  WHEN LOWER(category) IN ('online shopping')                  THEN 'online'
  WHEN LOWER(category) IN ('wholesale clubs')                  THEN 'wholesale'
  WHEN LOWER(category) IN ('department stores')                THEN 'department'
  WHEN LOWER(category) IN ('utilities')                        THEN 'utilities'
  WHEN LOWER(category) IN ('rotating categories')              THEN 'rotating'
  WHEN LOWER(category) IN ('all purchases')                    THEN 'all'
  ELSE LOWER(REPLACE(category, ' ', '_'))
END
WHERE category_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_card_categories_key ON card_categories(category_key);

-- Known caps on the seeded cards. Rates above these thresholds fall to 1%.
UPDATE card_categories SET cap_amount = 150000, cap_period = 'quarter'
  WHERE is_rotating = TRUE AND cap_amount IS NULL;

-- ---------------------------------------------------------------
-- 2. User-chosen categories.
-- Cards like Amex Blue Cash and Bank of America Customized Cash let the
-- holder pick which category earns the bonus for a given period.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_category_choices (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id BIGINT REFERENCES cards(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  cashback_rate DECIMAL(5,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, card_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_user_choices_lookup
  ON user_category_choices(user_id, card_id, period_end);

-- ---------------------------------------------------------------
-- 3. Benefits that expire. This is the differentiator: knowing that a
-- lower-cashback card is the better play because credit dies Friday.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_benefits (
  id BIGSERIAL PRIMARY KEY,
  card_id BIGINT REFERENCES cards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  value_amount INTEGER NOT NULL,          -- cents per period
  period TEXT NOT NULL DEFAULT 'year',    -- 'month' | 'quarter' | 'year'
  category_key TEXT,                      -- spend category it applies to; NULL = any
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_benefits_card ON card_benefits(card_id);

CREATE TABLE IF NOT EXISTS user_benefit_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  benefit_id BIGINT REFERENCES card_benefits(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  used_amount INTEGER NOT NULL DEFAULT 0, -- cents
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, benefit_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_user_benefit_lookup
  ON user_benefit_usage(user_id, period_end);

-- ---------------------------------------------------------------
-- 4. Spend against caps, so the engine knows when 5% has become 1%.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_category_spend (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id BIGINT REFERENCES cards(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  spent_amount INTEGER NOT NULL DEFAULT 0, -- cents
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, card_id, category_key, period_start)
);

CREATE INDEX IF NOT EXISTS idx_user_spend_lookup
  ON user_category_spend(user_id, card_id, period_end);

-- ---------------------------------------------------------------
-- 5. Seed the well-known recurring credits on cards already in the DB.
-- ---------------------------------------------------------------
INSERT INTO card_benefits (card_id, name, description, value_amount, period, category_key)
SELECT id, 'Dining credit', 'Monthly statement credit at eligible restaurants and delivery', 1000, 'month', 'dining'
FROM cards WHERE name ILIKE '%American Express%Gold%'
  AND NOT EXISTS (SELECT 1 FROM card_benefits b WHERE b.card_id = cards.id AND b.name = 'Dining credit');

INSERT INTO card_benefits (card_id, name, description, value_amount, period, category_key)
SELECT id, 'Hotel credit', 'Annual statement credit on hotel stays booked through the travel portal', 5000, 'year', 'hotels'
FROM cards WHERE name ILIKE '%Sapphire Preferred%'
  AND NOT EXISTS (SELECT 1 FROM card_benefits b WHERE b.card_id = cards.id AND b.name = 'Hotel credit');

INSERT INTO card_benefits (card_id, name, description, value_amount, period, category_key)
SELECT id, 'Anniversary night', 'Free night award each account anniversary', 15000, 'year', 'hotels'
FROM cards WHERE name ILIKE '%World of Hyatt%'
  AND NOT EXISTS (SELECT 1 FROM card_benefits b WHERE b.card_id = cards.id AND b.name = 'Anniversary night');
