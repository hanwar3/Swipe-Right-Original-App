-- Most credits only pay at named merchants: the Equinox credit is useless at a
-- restaurant, the Dunkin' credit at any other coffee shop. The engine nudges
-- toward a card for an expiring credit only when the purchase is at one of
-- these merchants. A credit with no merchants follows its spend category
-- (the Sapphire Reserve travel credit covers any travel); with neither, it
-- never steers a purchase.
ALTER TABLE card_benefits ADD COLUMN IF NOT EXISTS merchants TEXT[];

UPDATE card_benefits SET category_key = NULL, merchants = v.merchants
FROM (VALUES
  ('102_dining',              ARRAY['grubhub', 'cheesecake factory', 'five guys', 'goldbelly', 'wine.com']),
  ('102_uber',                ARRAY['uber', 'uber eats']),
  ('110_uber',                ARRAY['uber', 'uber eats']),
  ('102_dunkin',              ARRAY['dunkin', 'dunkin''', 'dunkin donuts']),
  ('102_resy',                ARRAY['resy']),
  ('107_doordash_credit',     ARRAY['doordash', 'door dash']),
  ('101_hotel',               ARRAY['chase travel']),
  ('110_hotel',               ARRAY['amex travel', 'fine hotels', 'hotel collection']),
  ('110_airline',             ARRAY['airline fee', 'bag fee', 'baggage fee', 'seat upgrade']),
  ('110_digital',             ARRAY['disney+', 'disney plus', 'hulu', 'espn', 'peacock', 'new york times', 'nytimes', 'wall street journal']),
  ('110_clear',               ARRAY['clear plus', 'clearme']),
  ('110_saks',                ARRAY['saks', 'saks fifth avenue']),
  ('106_travel',              ARRAY['capital one travel']),
  ('104_disney',              ARRAY['disney+', 'disney plus', 'disney bundle', 'hulu', 'espn']),
  ('104_equinox',             ARRAY['equinox']),
  ('hyatt_anniversary_night', ARRAY['hyatt'])
) AS v(slug, merchants)
WHERE card_benefits.slug = v.slug AND card_benefits.user_id IS NULL;
