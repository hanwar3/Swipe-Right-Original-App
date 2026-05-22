-- Migration to add debit card support and popular debit cards
ALTER TABLE cards ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'credit';

-- Insert popular debit cards
INSERT INTO cards (name, issuer, image_url, annual_fee, network, type, features, welcome_bonus, credit_range, is_popular, rating, review_count) VALUES
('Discover Cashback Debit', 'Discover', 'https://www.discover.com/content/dam/discover/en_us/online-banking/images/debit/debit-card-art.png', 0, 'Discover', 'debit', 
 '["1% cash back on up to $3,000 in debit card purchases each month", "No monthly fees", "Access to over 60,000 fee-free ATMs", "No fee for insufficient funds"]', 
 'None', 'No Credit Check', TRUE, 4.7, 1054),

('Chase Debit Card', 'Chase', 'https://creditcards.chase.com/K-Marketplace/images/cardart/freedom_rise_card.png', 0, 'Visa', 'debit',
 '["Seamless access to Chase ATMs", "Zero Liability Protection", "Contactless Payments", "24/7 fraud monitoring via Chase Mobile app"]',
 'None', 'No Credit Check', FALSE, 4.1, 432),

('Wells Fargo Debit Card', 'Wells Fargo', 'https://www.wellsfargo.com/assets/images/personal/credit-cards/product-art/active-cash-card.png', 0, 'Visa', 'debit',
 '["Access to Wells Fargo ATMs", "Contactless Payments", "24/7 fraud monitoring", "Mobile Wallet support"]',
 'None', 'No Credit Check', FALSE, 4.0, 312),

('Bank of America Debit Card', 'Bank of America', 'https://www.bankofamerica.com/content/images/ContextualSiteGraphics/CreditCardArt/en_US/Approved/cash_rewards_card_v1.png', 0, 'Visa', 'debit',
 '["Access to Bank of America ATMs", "Mobile Wallet support with Apple Pay & Google Pay", "Total Security Protection", "Secured by Visa Zero Liability"]',
 'None', 'No Credit Check', FALSE, 4.2, 511);

-- Insert card categories and cashback rates for the debit cards
-- Discover Cashback Debit: 1% cash back on all purchases up to $3000/month
INSERT INTO card_categories (card_id, category, cashback_rate, is_rotating)
VALUES ((SELECT id FROM cards WHERE name = 'Discover Cashback Debit' LIMIT 1), 'All Purchases', 1.0, FALSE);

-- Standard debit cards offer 0% cashback but are essential for portfolio mapping
INSERT INTO card_categories (card_id, category, cashback_rate, is_rotating)
VALUES ((SELECT id FROM cards WHERE name = 'Chase Debit Card' LIMIT 1), 'All Purchases', 0.0, FALSE);

INSERT INTO card_categories (card_id, category, cashback_rate, is_rotating)
VALUES ((SELECT id FROM cards WHERE name = 'Wells Fargo Debit Card' LIMIT 1), 'All Purchases', 0.0, FALSE);

INSERT INTO card_categories (card_id, category, cashback_rate, is_rotating)
VALUES ((SELECT id FROM cards WHERE name = 'Bank of America Debit Card' LIMIT 1), 'All Purchases', 0.0, FALSE);
