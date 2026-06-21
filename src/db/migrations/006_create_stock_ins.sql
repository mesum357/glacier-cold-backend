CREATE TABLE IF NOT EXISTS stock_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  buying_price NUMERIC(12, 2) NOT NULL CHECK (buying_price >= 0),
  supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_ins_received_at_idx ON stock_ins (received_at DESC);
CREATE INDEX IF NOT EXISTS stock_ins_supplier_id_idx ON stock_ins (supplier_id);
CREATE INDEX IF NOT EXISTS stock_ins_product_id_idx ON stock_ins (product_id);
