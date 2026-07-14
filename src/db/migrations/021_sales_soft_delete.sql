ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_sales_deleted_at_null
  ON sales (sale_at DESC)
  WHERE deleted_at IS NULL;
