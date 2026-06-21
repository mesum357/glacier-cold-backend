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
  productionDate: string | null;
  expiryDate: string | null;
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

export type StockInLineInput = {
  productName: string;
  productCategory: string;
  quantity: number;
  buyingPrice: number;
  productionDate: string;
  expiryDate: string;
};

export type CreateStockInBatchInput = {
  supplierId: string;
  receivedAt?: string;
  items: StockInLineInput[];
};

function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

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
    productionDate: row.production_date
      ? formatDateOnly(row.production_date as Date | string)
      : null,
    expiryDate: row.expiry_date
      ? formatDateOnly(row.expiry_date as Date | string)
      : null,
    receivedAt: (row.received_at as Date).toISOString(),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function generateBarcode() {
  return `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function validateStockInBatchInput(input: CreateStockInBatchInput): void {
  if (!input.items.length) {
    throw new Error("At least one product line is required");
  }

  for (const item of input.items) {
    if (item.expiryDate < item.productionDate) {
      throw new Error("Expiry date must be on or after production date");
    }
    if (item.quantity <= 0) {
      throw new Error("Quantity must be greater than zero");
    }
  }
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

export async function createStockInBatch(
  input: CreateStockInBatchInput,
): Promise<{ invoiceNo: number; stockIns: StockIn[] }> {
  validateStockInBatchInput(input);

  const supplier = await getSupplierById(input.supplierId);
  if (!supplier) throw new Error("Supplier not found");

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceNo = await allocateInvoiceNo(client);
    const stockIns: StockIn[] = [];

    for (const item of input.items) {
      const name = item.productName.trim();
      const category = item.productCategory.trim();
      const quantity = item.quantity;
      const buyingPrice = item.buyingPrice;

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
              production_date = $4,
              expiry_date = $5,
              updated_at = NOW()
          WHERE id = $1
          `,
          [productId, quantity, buyingPrice, item.productionDate, item.expiryDate],
        );
      } else {
        const { rows: newRows } = await client.query(
          `
          INSERT INTO products (
            name, category, barcode, buying_price, selling_price, quantity, threshold_limit,
            production_date, expiry_date
          )
          VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6, $7)
          RETURNING id
          `,
          [
            name,
            category,
            generateBarcode(),
            buyingPrice,
            quantity,
            item.productionDate,
            item.expiryDate,
          ],
        );
        productId = newRows[0].id as string;
      }

      const { rows: stockInRows } = await client.query(
        `
        INSERT INTO stock_ins (
          product_id, product_name, product_category, quantity, buying_price,
          supplier_id, supplier_name, received_at, invoice_no, production_date, expiry_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
          item.productionDate,
          item.expiryDate,
        ],
      );
      stockIns.push(mapRow(stockInRows[0]));
    }

    await client.query("COMMIT");
    return { invoiceNo, stockIns };
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
