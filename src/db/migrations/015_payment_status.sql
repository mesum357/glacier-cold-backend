ALTER TABLE stock_ins
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'half_paid'));

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'half_paid'));

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'half_paid'));

CREATE INDEX IF NOT EXISTS stock_ins_payment_status_idx ON stock_ins (payment_status);
CREATE INDEX IF NOT EXISTS sales_payment_status_idx ON sales (payment_status);
