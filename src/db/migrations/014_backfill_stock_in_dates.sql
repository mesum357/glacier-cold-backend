-- Backfill missing stock-in line dates from the linked product record.
UPDATE stock_ins si
SET production_date = p.production_date,
    expiry_date = p.expiry_date
FROM products p
WHERE p.id = si.product_id
  AND si.production_date IS NULL
  AND si.expiry_date IS NULL
  AND p.production_date IS NOT NULL
  AND p.expiry_date IS NOT NULL;
