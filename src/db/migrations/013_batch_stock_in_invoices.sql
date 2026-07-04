-- Batch stock-in shares one invoice_no across multiple line items.
-- The unique index from migration 010 only allows one stock_ins row per invoice.
DROP INDEX IF EXISTS stock_ins_invoice_no_idx;
CREATE INDEX IF NOT EXISTS stock_ins_invoice_no_idx ON stock_ins (invoice_no);

-- Backfill product dates from the latest stock-in line that has dates.
UPDATE products p
SET production_date = si.production_date,
    expiry_date = si.expiry_date,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (product_id)
    product_id,
    production_date,
    expiry_date
  FROM stock_ins
  WHERE production_date IS NOT NULL
    AND expiry_date IS NOT NULL
  ORDER BY product_id, received_at DESC
) si
WHERE p.id = si.product_id
  AND (p.production_date IS NULL OR p.expiry_date IS NULL);
