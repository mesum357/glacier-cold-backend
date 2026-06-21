CREATE TABLE IF NOT EXISTS consumers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('VIP', 'regular', 'New')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consumers_name_idx ON consumers (name);
CREATE INDEX IF NOT EXISTS consumers_status_idx ON consumers (status);
