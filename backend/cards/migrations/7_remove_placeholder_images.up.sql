-- Remove placeholder image URLs so the frontend uses the premium CSS fallbacks
UPDATE cards
SET image_url = NULL
WHERE image_url LIKE '%via.placeholder.com%'
   OR image_url LIKE '%placeholder%';
