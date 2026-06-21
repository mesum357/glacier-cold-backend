-- Renumber all invoices globally: earliest transaction = 1, then 2, 3, …
-- across both sales (stock out) and stock_ins (stock in).

WITH all_invoices AS (
  SELECT 'sale' AS kind, id, sale_at AS tx_at, created_at
  FROM sales
  UNION ALL
  SELECT 'stock_in' AS kind, id, received_at AS tx_at, created_at
  FROM stock_ins
),
numbered AS (
  SELECT kind, id, ROW_NUMBER() OVER (ORDER BY tx_at, created_at, id) AS rn
  FROM all_invoices
)
UPDATE sales s
SET invoice_no = numbered.rn
FROM numbered
WHERE s.id = numbered.id AND numbered.kind = 'sale';

WITH all_invoices AS (
  SELECT 'sale' AS kind, id, sale_at AS tx_at, created_at
  FROM sales
  UNION ALL
  SELECT 'stock_in' AS kind, id, received_at AS tx_at, created_at
  FROM stock_ins
),
numbered AS (
  SELECT kind, id, ROW_NUMBER() OVER (ORDER BY tx_at, created_at, id) AS rn
  FROM all_invoices
)
UPDATE stock_ins si
SET invoice_no = numbered.rn
FROM numbered
WHERE si.id = numbered.id AND numbered.kind = 'stock_in';

SELECT setval(
  'invoice_no_seq',
  GREATEST(
    COALESCE((SELECT MAX(invoice_no) FROM sales), 0),
    COALESCE((SELECT MAX(invoice_no) FROM stock_ins), 0)
  )
);
