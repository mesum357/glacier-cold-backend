CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name TEXT NOT NULL,
  sale_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS sales_sale_at_idx ON sales (sale_at DESC);
CREATE INDEX IF NOT EXISTS sales_supplier_idx ON sales (supplier_name);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_name_idx ON sale_items (product_name);
