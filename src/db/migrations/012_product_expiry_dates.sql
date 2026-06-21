ALTER TABLE products
  ADD COLUMN IF NOT EXISTS production_date DATE,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER
    CHECK (expiry_alert_days IS NULL OR expiry_alert_days > 0);

ALTER TABLE stock_ins
  ADD COLUMN IF NOT EXISTS production_date DATE,
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE INDEX IF NOT EXISTS products_expiry_date_idx
  ON products (expiry_date)
  WHERE expiry_date IS NOT NULL;
