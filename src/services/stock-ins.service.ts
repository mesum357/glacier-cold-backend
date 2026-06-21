import { pool } from "../db/pool.js";
import { allocateInvoiceNo } from "./invoice-no.service.js";
import { getSupplierById } from "./suppliers.service.js";
export type StockIn = {
  id: string;
  invoiceNo: number;
  productId: string;
  productName: string;
  productCategory: string;
  quantity: number;
  buyingPrice: number;
  supplierId: string;
  supplierName: string;
  receivedAt: string;
  createdAt: string;
};

export type CreateStockInInput = {
  productName: string;
  productCategory: string;
  quantity: number;
  buyingPrice: number;
  supplierId: string;
  receivedAt?: string;
};

function mapRow(row: Record<string, unknown>): StockIn {
  return {
    id: row.id as string,
    invoiceNo: Number(row.invoice_no),
    productId: row.product_id as string,
    productName: row.product_name as string,
    productCategory: row.product_category as string,
    quantity: Number(row.quantity),
    buyingPrice: Number(row.buying_price),
    supplierId: row.supplier_id as string,
    supplierName: row.supplier_name as string,
    receivedAt: (row.received_at as Date).toISOString(),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function generateBarcode() {
  return `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function createStockIn(input: CreateStockInInput): Promise<StockIn> {
  const supplier = await getSupplierById(input.supplierId);
  if (!supplier) throw new Error("Supplier not found");

  const name = input.productName.trim();
  const category = input.productCategory.trim();
  const quantity = input.quantity;
  const buyingPrice = input.buyingPrice;
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

  if (quantity <= 0) throw new Error("Quantity must be greater than zero");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query(
      `
      SELECT * FROM products
      WHERE LOWER(name) = LOWER($1) AND LOWER(category) = LOWER($2)
      FOR UPDATE
      `,
      [name, category],
    );

    let productId: string;

    if (existingRows[0]) {
      productId = existingRows[0].id as string;
      await client.query(
        `
        UPDATE products
        SET quantity = quantity + $2,
            buying_price = $3,
            updated_at = NOW()
        WHERE id = $1
        `,
        [productId, quantity, buyingPrice],
      );
    } else {
      const { rows: newRows } = await client.query(
        `
        INSERT INTO products (
          name, category, barcode, buying_price, selling_price, quantity, threshold_limit
        )
        VALUES ($1, $2, $3, $4, NULL, $5, NULL)
        RETURNING id
        `,
        [name, category, generateBarcode(), buyingPrice, quantity],
      );
      productId = newRows[0].id as string;
    }

    const invoiceNo = await allocateInvoiceNo(client);

    const { rows: stockInRows } = await client.query(
      `
      INSERT INTO stock_ins (
        product_id, product_name, product_category, quantity, buying_price,
        supplier_id, supplier_name, received_at, invoice_no
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        productId,
        name,
        category,
        quantity,
        buyingPrice,
        supplier.id,
        supplier.name,
        receivedAt,
        invoiceNo,
      ],
    );
    await client.query("COMMIT");
    return mapRow(stockInRows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listStockIns(limit?: number): Promise<StockIn[]> {
  const sql = limit
    ? `SELECT * FROM stock_ins ORDER BY received_at DESC LIMIT $1`
    : `SELECT * FROM stock_ins ORDER BY received_at DESC`;
  const { rows } = await pool.query(sql, limit ? [limit] : []);
  return rows.map(mapRow);
}

export async function listRecentStockIns(limit = 20): Promise<StockIn[]> {
  return listStockIns(limit);
}
