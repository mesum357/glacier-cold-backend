CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  buying_price NUMERIC(12, 2) NOT NULL CHECK (buying_price >= 0),
  selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  threshold_limit INTEGER NOT NULL DEFAULT 0 CHECK (threshold_limit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
