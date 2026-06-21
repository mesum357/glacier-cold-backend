import type { PoolClient } from "pg";

export async function allocateInvoiceNo(client: PoolClient): Promise<number> {
  const { rows } = await client.query(`SELECT nextval('invoice_no_seq') AS invoice_no`);
  return Number(rows[0].invoice_no);
}
