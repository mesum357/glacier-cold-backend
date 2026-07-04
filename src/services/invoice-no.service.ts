import type { PoolClient } from "pg";

export async function allocateStockInInvoiceNo(client: PoolClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT nextval('stock_in_invoice_no_seq') AS invoice_no`,
  );
  return Number(rows[0].invoice_no);
}

export async function allocateSalesInvoiceNo(client: PoolClient): Promise<number> {
  const { rows } = await client.query(`SELECT nextval('sales_invoice_no_seq') AS invoice_no`);
  return Number(rows[0].invoice_no);
}
