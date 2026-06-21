CREATE TABLE IF NOT EXISTS shop_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT 'Shop Management',
  contact_email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'PKR',
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shop_settings (
  id, store_name, tagline, contact_email, phone, address, currency, tax_rate, timezone
)
VALUES (
  1,
  'Glacier Cold Storage',
  'Shop Management',
  'hello@glacier.shop',
  '+92 300 1234567',
  'Main Bazaar, Lahore, Punjab, Pakistan',
  'PKR',
  0,
  'Asia/Karachi'
)
ON CONFLICT (id) DO NOTHING;
