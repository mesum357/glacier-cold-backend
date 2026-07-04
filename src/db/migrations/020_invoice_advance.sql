ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (advance_amount >= 0);

ALTER TABLE stock_ins
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (advance_amount >= 0);
