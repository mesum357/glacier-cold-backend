import { pool } from "../db/pool.js";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "../lib/expiry.js";
import {
  computeProductStatus,
  type ProductStatus,
} from "../lib/product-status.js";

export type { ProductStatus };

export type Product = {
  id: string;
  name: string;
  category: string;
  barcode: string;
  buyingPrice: number;
  sellingPrice: number | null;
  quantity: number;
  thresholdLimit: number | null;
  productionDate: string | null;
  expiryDate: string | null;
  expiryAlertDays: number | null;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  name: string;
  category: string;
  barcode: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  thresholdLimit: number;
  productionDate?: string | null;
  expiryDate?: string | null;
  expiryAlertDays?: number | null;
};

function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function mapProductRow(row: Record<string, unknown>): Product {
  const quantity = Number(row.quantity);
  const thresholdLimit =
    row.threshold_limit === null || row.threshold_limit === undefined
      ? null
      : Number(row.threshold_limit);
  const sellingPrice =
    row.selling_price === null || row.selling_price === undefined
      ? null
      : Number(row.selling_price);

  const status = computeProductStatus(quantity, thresholdLimit);

  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    barcode: row.barcode as string,
    buyingPrice: Number(row.buying_price),
    sellingPrice,
    quantity,
    thresholdLimit,
    productionDate: row.production_date ? formatDateOnly(row.production_date as Date | string) : null,
    expiryDate: row.expiry_date ? formatDateOnly(row.expiry_date as Date | string) : null,
    expiryAlertDays:
      row.expiry_alert_days == null ? null : Number(row.expiry_alert_days),
    status,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function listProducts(): Promise<Product[]> {
  const { rows } = await pool.query(
    `SELECT * FROM products ORDER BY created_at DESC`,
  );
  return rows.map(mapProductRow);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { rows } = await pool.query(
    `
    INSERT INTO products (
      name, category, barcode, buying_price, selling_price, quantity, threshold_limit,
      production_date, expiry_date, expiry_alert_days
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
    `,
    [
      input.name,
      input.category,
      input.barcode,
      input.buyingPrice,
      input.sellingPrice,
      input.quantity,
      input.thresholdLimit,
      input.productionDate ?? null,
      input.expiryDate ?? null,
      input.expiryAlertDays ?? null,
    ],
  );
  return mapProductRow(rows[0]);
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product | null> {
  const { rows } = await pool.query(
    `
    UPDATE products
    SET name = $2,
        category = $3,
        barcode = $4,
        buying_price = $5,
        selling_price = $6,
        quantity = $7,
        threshold_limit = $8,
        production_date = $9,
        expiry_date = $10,
        expiry_alert_days = $11,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      id,
      input.name,
      input.category,
      input.barcode,
      input.buyingPrice,
      input.sellingPrice,
      input.quantity,
      input.thresholdLimit,
      input.productionDate ?? null,
      input.expiryDate ?? null,
      input.expiryAlertDays ?? null,
    ],
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function listLowStockProducts(): Promise<Product[]> {
  const { rows } = await pool.query(`
    SELECT * FROM products
    WHERE threshold_limit IS NOT NULL
      AND quantity <= threshold_limit
    ORDER BY quantity ASC, name ASC
  `);
  return rows.map(mapProductRow);
}

export async function countExpiringSoonProducts(): Promise<number> {
  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM products
    WHERE expiry_date IS NOT NULL
      AND expiry_date >= CURRENT_DATE
      AND (expiry_date - CURRENT_DATE) <= COALESCE(expiry_alert_days, $1)
    `,
    [DEFAULT_EXPIRY_ALERT_DAYS],
  );
  return Number(rows[0].count);
}

export async function listExpiringSoonProducts(): Promise<Product[]> {
  const { rows } = await pool.query(
    `
    SELECT * FROM products
    WHERE expiry_date IS NOT NULL
      AND expiry_date >= CURRENT_DATE
      AND (expiry_date - CURRENT_DATE) <= COALESCE(expiry_alert_days, $1)
    ORDER BY expiry_date ASC, name ASC
    `,
    [DEFAULT_EXPIRY_ALERT_DAYS],
  );
  return rows.map(mapProductRow);
}

export async function getProductStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE threshold_limit IS NOT NULL
          AND quantity > 0
          AND quantity <= threshold_limit
      )::int AS low_stock,
      COUNT(*) FILTER (WHERE quantity = 0)::int AS out_of_stock,
      COALESCE(SUM(quantity), 0)::int AS total_units,
      COALESCE(SUM(buying_price * quantity), 0)::numeric AS inventory_value
    FROM products
  `);
  const expiringSoon = await countExpiringSoonProducts();
  return {
    total: Number(rows[0].total),
    lowStock: Number(rows[0].low_stock),
    outOfStock: Number(rows[0].out_of_stock),
    totalUnits: Number(rows[0].total_units),
    inventoryValue: Number(rows[0].inventory_value),
    expiringSoon,
  };
}
