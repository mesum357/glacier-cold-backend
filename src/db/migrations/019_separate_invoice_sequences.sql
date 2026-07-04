-- Stock-in and sales (stock-out) each use their own invoice number sequence.

CREATE SEQUENCE IF NOT EXISTS stock_in_invoice_no_seq;
CREATE SEQUENCE IF NOT EXISTS sales_invoice_no_seq;

ALTER TABLE sales ALTER COLUMN invoice_no DROP DEFAULT;
ALTER TABLE stock_ins ALTER COLUMN invoice_no DROP DEFAULT;

WITH batches AS (
  SELECT
    invoice_no AS old_no,
    MIN(received_at) AS tx_at,
    MIN(created_at) AS created_at
  FROM stock_ins
  GROUP BY invoice_no
),
numbered AS (
  SELECT
    old_no,
    ROW_NUMBER() OVER (ORDER BY tx_at, created_at, old_no) AS new_no
  FROM batches
)
UPDATE stock_ins si
SET invoice_no = n.new_no
FROM numbered n
WHERE si.invoice_no = n.old_no;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY sale_at, created_at, id) AS new_no
  FROM sales
)
UPDATE sales s
SET invoice_no = n.new_no
FROM numbered n
WHERE s.id = n.id;

SELECT setval(
  'stock_in_invoice_no_seq',
  GREATEST(COALESCE((SELECT MAX(invoice_no) FROM stock_ins), 0), 1),
  COALESCE((SELECT MAX(invoice_no) FROM stock_ins), 0) > 0
);

SELECT setval(
  'sales_invoice_no_seq',
  GREATEST(COALESCE((SELECT MAX(invoice_no) FROM sales), 0), 1),
  COALESCE((SELECT MAX(invoice_no) FROM sales), 0) > 0
);
