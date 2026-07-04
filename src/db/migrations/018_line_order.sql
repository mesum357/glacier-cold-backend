ALTER TABLE stock_ins ADD COLUMN IF NOT EXISTS line_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY invoice_no ORDER BY created_at ASC) - 1 AS ord
  FROM stock_ins
)
UPDATE stock_ins s SET line_order = ranked.ord FROM ranked WHERE s.id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY sale_id ORDER BY id) - 1 AS ord
  FROM sale_items
)
UPDATE sale_items si SET line_order = ranked.ord FROM ranked WHERE si.id = ranked.id;
