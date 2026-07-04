ALTER TABLE stock_ins
  ADD COLUMN IF NOT EXISTS carton_quantity INTEGER CHECK (carton_quantity IS NULL OR carton_quantity > 0),
  ADD COLUMN IF NOT EXISTS carton_price NUMERIC(12, 2) CHECK (carton_price IS NULL OR carton_price >= 0);

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS carton_quantity INTEGER CHECK (carton_quantity IS NULL OR carton_quantity > 0),
  ADD COLUMN IF NOT EXISTS carton_price NUMERIC(12, 2) CHECK (carton_price IS NULL OR carton_price >= 0);
