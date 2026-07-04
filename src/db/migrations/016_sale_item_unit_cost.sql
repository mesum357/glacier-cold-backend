ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0);

UPDATE sale_items si
SET unit_cost = p.buying_price
FROM products p
WHERE si.product_id = p.id
  AND si.unit_cost IS NULL;

UPDATE sale_items si
SET unit_cost = p.buying_price
FROM products p
WHERE si.product_id IS NULL
  AND si.product_name = p.name
  AND si.unit_cost IS NULL;
