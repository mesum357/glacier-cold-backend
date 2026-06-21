CREATE SEQUENCE IF NOT EXISTS invoice_no_seq;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_no INTEGER;
ALTER TABLE stock_ins ADD COLUMN IF NOT EXISTS invoice_no INTEGER;

WITH all_rows AS (
  SELECT id, created_at, 'sale' AS kind
  FROM sales
  WHERE invoice_no IS NULL
  UNION ALL
  SELECT id, created_at, 'stock_in' AS kind
  FROM stock_ins
  WHERE invoice_no IS NULL
),
numbered AS (
  SELECT id, kind, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM all_rows
)
UPDATE sales s
SET invoice_no = numbered.rn
FROM numbered
WHERE s.id = numbered.id AND numbered.kind = 'sale';

WITH all_rows AS (
  SELECT id, created_at, 'sale' AS kind
  FROM sales
  WHERE invoice_no IS NULL
  UNION ALL
  SELECT id, created_at, 'stock_in' AS kind
  FROM stock_ins
  WHERE invoice_no IS NULL
),
numbered AS (
  SELECT id, kind, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM all_rows
)
UPDATE stock_ins si
SET invoice_no = numbered.rn
FROM numbered
WHERE si.id = numbered.id AND numbered.kind = 'stock_in';

SELECT setval(
  'invoice_no_seq',
  GREATEST(
    COALESCE((SELECT MAX(invoice_no) FROM sales), 0),
    COALESCE((SELECT MAX(invoice_no) FROM stock_ins), 0),
    1
  ),
  GREATEST(
    COALESCE((SELECT MAX(invoice_no) FROM sales), 0),
    COALESCE((SELECT MAX(invoice_no) FROM stock_ins), 0)
  ) > 0
);

ALTER TABLE sales
  ALTER COLUMN invoice_no SET DEFAULT nextval('invoice_no_seq'),
  ALTER COLUMN invoice_no SET NOT NULL;

ALTER TABLE stock_ins
  ALTER COLUMN invoice_no SET DEFAULT nextval('invoice_no_seq'),
  ALTER COLUMN invoice_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_no_idx ON sales (invoice_no);
CREATE UNIQUE INDEX IF NOT EXISTS stock_ins_invoice_no_idx ON stock_ins (invoice_no);
