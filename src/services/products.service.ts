import { pool } from "../db/pool.js";
import { formatDateOnly } from "../lib/date-only.js";
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
  lastCartonQuantity: number | null;
  lastCartonPrice: number | null;
  lastSaleCartonQuantity: number | null;
  lastSaleCartonPrice: number | null;
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
  thresholdLimit: number | null;
  productionDate?: string | null;
  expiryDate?: string | null;
  expiryAlertDays?: number | null;
};

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
    lastCartonQuantity:
      row.last_carton_quantity === null || row.last_carton_quantity === undefined
        ? null
        : Number(row.last_carton_quantity),
    lastCartonPrice:
      row.last_carton_price === null || row.last_carton_price === undefined
        ? null
        : Number(row.last_carton_price),
    lastSaleCartonQuantity:
      row.last_sale_carton_quantity === null || row.last_sale_carton_quantity === undefined
        ? null
        : Number(row.last_sale_carton_quantity),
    lastSaleCartonPrice:
      row.last_sale_carton_price === null || row.last_sale_carton_price === undefined
        ? null
        : Number(row.last_sale_carton_price),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function listProducts(): Promise<Product[]> {
  const { rows } = await pool.query(
    `
    SELECT
      p.*,
      latest_si.carton_quantity AS last_carton_quantity,
      latest_si.carton_price AS last_carton_price,
      latest_sale.carton_quantity AS last_sale_carton_quantity,
      latest_sale.carton_price AS last_sale_carton_price
    FROM products p
    LEFT JOIN LATERAL (
      SELECT carton_quantity, carton_price
      FROM stock_ins
      WHERE product_id = p.id
      ORDER BY received_at DESC, created_at DESC
      LIMIT 1
    ) latest_si ON true
    LEFT JOIN LATERAL (
      SELECT si.carton_quantity, si.carton_price
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE si.product_id = p.id
        AND s.deleted_at IS NULL
      ORDER BY s.sale_at DESC, si.line_order ASC, si.id ASC
      LIMIT 1
    ) latest_sale ON true
    ORDER BY p.created_at DESC
    `,
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
      input.thresholdLimit ?? null,
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
      input.thresholdLimit ?? null,
      input.productionDate ?? null,
      input.expiryDate ?? null,
      input.expiryAlertDays ?? null,
    ],
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

export async function deleteProduct(id: string): Promise<void> {
  const { rows: stockInRows } = await pool.query(
    `SELECT 1 FROM stock_ins WHERE product_id = $1 LIMIT 1`,
    [id],
  );
  if (stockInRows.length > 0) {
    throw new Error("Cannot delete product with stock-in history");
  }

  const { rowCount } = await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
  if ((rowCount ?? 0) === 0) {
    throw new Error("Product not found");
  }
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

export type InventoryReconcileAdjustment = {
  id: string;
  name: string;
  barcode: string;
  previousQuantity: number;
  newQuantity: number;
  totalStockIn: number;
  totalStockOut: number;
  drift: number;
};

export async function reconcileInventory(): Promise<InventoryReconcileAdjustment[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(`
      SELECT
        p.id,
        p.name,
        p.barcode,
        p.quantity AS stored,
        COALESCE(si.total_in, 0)  AS total_in,
        COALESCE(so.total_out, 0) AS total_out,
        COALESCE(si.total_in, 0) - COALESCE(so.total_out, 0) AS expected
      FROM products p
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_in
        FROM stock_ins GROUP BY product_id
      ) si ON si.product_id = p.id
      LEFT JOIN (
        SELECT si.product_id, SUM(si.quantity) AS total_out
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE si.product_id IS NOT NULL
          AND s.deleted_at IS NULL
        GROUP BY si.product_id
      ) so ON so.product_id = p.id
      WHERE p.quantity <> COALESCE(si.total_in, 0) - COALESCE(so.total_out, 0)
      ORDER BY ABS(p.quantity - (COALESCE(si.total_in, 0) - COALESCE(so.total_out, 0))) DESC
      FOR UPDATE OF p
    `);

    const adjustments: InventoryReconcileAdjustment[] = [];
    for (const row of rows) {
      const stored = Number(row.stored);
      const expected = Number(row.expected);
      await client.query(
        `UPDATE products SET quantity = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, expected],
      );
      adjustments.push({
        id: row.id as string,
        name: row.name as string,
        barcode: row.barcode as string,
        previousQuantity: stored,
        newQuantity: expected,
        totalStockIn: Number(row.total_in),
        totalStockOut: Number(row.total_out),
        drift: stored - expected,
      });
    }

    await client.query("COMMIT");
    return adjustments;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
