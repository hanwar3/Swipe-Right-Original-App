-- One catalogue of card credits for everyone, kept current three ways:
--   editorial  an update in the catalogue (internal endpoint or a migration)
--   crowd      when 3+ cardholders' own portals agree on a new value
--   personal   your own portal reading applies to you at once
-- plus each user's manual usage, custom credits and hidden credits, stored
-- server-side so they follow the account instead of one browser.

ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'statement_credit'; -- | 'subscription'
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'usd';              -- | 'count'
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS display_category TEXT;
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS change_note TEXT;
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ;
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

-- Periods: month | quarter | half | year | anniversary | four_years
-- (half = Jan-Jun / Jul-Dec; the last two have no calendar deadline).

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_benefits_slug
  ON card_benefits(card_id, slug) WHERE slug IS NOT NULL AND user_id IS NULL;

CREATE TABLE IF NOT EXISTS benefit_changes (
  id BIGSERIAL PRIMARY KEY,
  benefit_id BIGINT NOT NULL REFERENCES card_benefits(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  old_value_amount INTEGER,
  new_value_amount INTEGER,
  old_period TEXT,
  new_period TEXT,
  source TEXT NOT NULL,          -- 'editorial' | 'crowd'
  reporters INTEGER,
  note TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_benefit_changes_benefit ON benefit_changes(benefit_id, changed_at DESC);

-- What cardholders' own portals say a catalogue credit is worth. The reporter
-- is a one-way hash: enough to count three different people, not to name them.
CREATE TABLE IF NOT EXISTS benefit_observations (
  benefit_id BIGINT NOT NULL REFERENCES card_benefits(id) ON DELETE CASCADE,
  reporter TEXT NOT NULL,
  value_amount INTEGER NOT NULL,
  period TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (benefit_id, reporter)
);

-- Per-user view of a catalogue credit: hidden ("I don't get this"), or the
-- value and period the user's own portal shows when it disagrees.
CREATE TABLE IF NOT EXISTS user_benefit_prefs (
  user_id TEXT NOT NULL,
  benefit_id BIGINT NOT NULL REFERENCES card_benefits(id) ON DELETE CASCADE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  value_override INTEGER,
  period_override TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, benefit_id)
);

-- Existing engine rows join the catalogue under the ids the app already uses,
-- so usage logged on a device before this carries over.
UPDATE card_benefits SET slug = '102_dining', display_category = 'Dining',
       description = 'Statement credit at Grubhub, The Cheesecake Factory, Five Guys and other eligible dining'
WHERE user_id IS NULL AND name = 'Dining credit' AND card_id = (SELECT id FROM cards WHERE name = 'American Express Gold Card');

UPDATE card_benefits SET slug = '101_hotel', display_category = 'Hotels'
WHERE user_id IS NULL AND name = 'Hotel credit' AND card_id IN (SELECT id FROM cards WHERE name ILIKE '%Sapphire Preferred%');

UPDATE card_benefits SET slug = 'hyatt_anniversary_night', display_category = 'Hotels', period = 'anniversary'
WHERE user_id IS NULL AND name = 'Anniversary night';

-- The shipped catalogue, by card. Names carry no dollar figure, so a change
-- in value never leaves a stale number in the title.
INSERT INTO card_benefits (card_id, slug, name, description, value_amount, period, kind, display_category, category_key)
SELECT c.id, v.slug, v.name, v.description, v.value_amount, v.period, v.kind, v.display_category, v.category_key
FROM (VALUES
  ('%Sapphire Preferred%',          '101_dashpass',         'DoorDash DashPass',            'Complimentary DashPass membership covering delivery fees.',              999,  'month',   'subscription',     'Dining',        NULL),
  ('Chase Sapphire Reserve',        '107_travel',           'Travel credit',                'Automatic statement credit for travel purchases.',                       30000, 'year',   'statement_credit', 'Travel',        'travel'),
  ('Chase Sapphire Reserve',        '107_dashpass',         'DoorDash DashPass',            'Complimentary DashPass membership covering delivery fees.',              999,  'month',   'subscription',     'Dining',        NULL),
  ('Chase Sapphire Reserve',        '107_doordash_credit',  'DoorDash credit',              'Monthly DoorDash promo added to your DoorDash account.',                  1500, 'month',   'statement_credit', 'Dining',        'dining'),
  ('American Express Gold Card',    '102_uber',             'Uber Cash',                    'Monthly Uber Cash for U.S. rides or Uber Eats.',                         1000, 'month',   'statement_credit', 'Rides',         NULL),
  ('American Express Gold Card',    '102_dunkin',           'Dunkin'' credit',              'Monthly statement credit at U.S. Dunkin'' locations.',                    700,  'month',   'statement_credit', 'Dining',        'dining'),
  ('American Express Gold Card',    '102_resy',             'Resy credit',                  'Statement credit at U.S. Resy restaurants, twice a year.',               5000, 'half',    'statement_credit', 'Dining',        'dining'),
  ('American Express Platinum Card','110_hotel',            'Fine Hotels + Resorts credit', 'Prepaid FHR or Hotel Collection stays booked through Amex Travel.',     20000, 'year',   'statement_credit', 'Hotels',        'hotels'),
  ('American Express Platinum Card','110_airline',          'Airline fee credit',           'Incidental fees with your selected airline.',                           20000, 'year',   'statement_credit', 'Travel',        'travel'),
  ('American Express Platinum Card','110_uber',             'Uber Cash',                    'Monthly Uber Cash for U.S. rides and Uber Eats ($35 in December).',     1500, 'month',   'statement_credit', 'Rides',         NULL),
  ('American Express Platinum Card','110_digital',          'Digital entertainment credit', 'Disney+, Peacock, The New York Times and other eligible subscriptions.', 2000, 'month',   'statement_credit', 'Streaming',     'streaming'),
  ('American Express Platinum Card','110_clear',            'CLEAR Plus credit',            'Statement credit for a CLEAR Plus membership.',                         18900, 'year',   'statement_credit', 'Travel',        'travel'),
  ('American Express Platinum Card','110_walmart',          'Walmart+ membership',          'Statement credit covering a monthly Walmart+ membership.',               1295, 'month',   'subscription',     'Shopping',      NULL),
  ('American Express Platinum Card','110_saks',             'Saks credit',                  'Statement credit at Saks Fifth Avenue, twice a year.',                  5000, 'half',    'statement_credit', 'Shopping',      NULL),
  ('Capital One Venture X',         '106_travel',           'Travel credit',                'Statement credit for bookings through Capital One Travel.',             30000, 'year',   'statement_credit', 'Travel',        'travel'),
  ('Capital One Venture X',         '106_anniversary',      'Anniversary miles',            '10,000 bonus miles each account anniversary, about $100 in travel.',    10000, 'anniversary', 'statement_credit', 'Travel',   'travel'),
  ('American Express Blue Cash Preferred', '104_disney',    'Disney Bundle credit',         'Monthly statement credit toward a Disney Bundle subscription.',          700,  'month',   'statement_credit', 'Streaming',     'streaming'),
  ('American Express Blue Cash Preferred', '104_equinox',   'Equinox credit',               'Monthly statement credit for Equinox+ or club membership.',             1000, 'month',   'statement_credit', 'Wellness',      NULL),
  ('%Savor%',                       '108_uber_one',         'Uber One membership',          'Monthly Uber One membership fee covered by statement credit.',            999,  'month',   'subscription',     'Rides',         NULL)
) AS v(card_pattern, slug, name, description, value_amount, period, kind, display_category, category_key)
JOIN cards c ON c.name ILIKE v.card_pattern
WHERE NOT EXISTS (
  SELECT 1 FROM card_benefits b WHERE b.card_id = c.id AND b.slug = v.slug AND b.user_id IS NULL
);

-- DoorDash on Sapphire Reserve went from $5 to $15 a month. Recorded as a
-- change so cardholders see what moved instead of a silent new number.
UPDATE card_benefits SET version = 2, changed_at = NOW(),
       change_note = 'Now $15 a month (was $5).'
WHERE slug = '107_doordash_credit' AND user_id IS NULL;

INSERT INTO benefit_changes (benefit_id, version, old_value_amount, new_value_amount, old_period, new_period, source, note)
SELECT id, 2, 500, 1500, 'month', 'month', 'editorial', 'Chase raised the monthly DoorDash credit from $5 to $15.'
FROM card_benefits WHERE slug = '107_doordash_credit' AND user_id IS NULL;
