import { pool } from "../db/pool.js";
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
};

function mapRow(row: Record<string, unknown>): Product {
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
    status,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function listProducts(): Promise<Product[]> {
  const { rows } = await pool.query(
    `SELECT * FROM products ORDER BY created_at DESC`,
  );
  return rows.map(mapRow);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { rows } = await pool.query(
    `
    INSERT INTO products (
      name, category, barcode, buying_price, selling_price, quantity, threshold_limit
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
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
    ],
  );
  return mapRow(rows[0]);
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
    ],
  );
  return rows[0] ? mapRow(rows[0]) : null;
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
  return rows.map(mapRow);
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
  return {
    total: Number(rows[0].total),
    lowStock: Number(rows[0].low_stock),
    outOfStock: Number(rows[0].out_of_stock),
    totalUnits: Number(rows[0].total_units),
    inventoryValue: Number(rows[0].inventory_value),
  };
}
