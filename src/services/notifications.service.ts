import { pool } from "../db/pool.js";
import { computeProductStatus } from "../lib/product-status.js";

export type StockAlert = {
  id: string;
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  thresholdLimit: number;
  status: "Shortage" | "Out of Stock";
  message: string;
  createdAt: string;
};

export function mapAlertRow(row: Record<string, unknown>): StockAlert {
  const quantity = Number(row.quantity);
  const thresholdLimit = Number(row.threshold_limit);
  const status = computeProductStatus(quantity, thresholdLimit);
  const productName = row.name as string;
  const label = status === "Out of Stock" ? "is out of stock" : "reached shortage level";
  return {
    id: `alert-${row.id}`,
    productId: row.id as string,
    productName,
    category: row.category as string,
    quantity,
    thresholdLimit,
    status: status === "Out of Stock" ? "Out of Stock" : "Shortage",
    message: `${productName} ${label} (${quantity} left, threshold ${thresholdLimit})`,
    createdAt: (row.updated_at as Date).toISOString(),
  };
}

export async function listStockAlerts(): Promise<StockAlert[]> {
  const { rows } = await pool.query(`
    SELECT id, name, category, quantity, threshold_limit, updated_at
    FROM products
    WHERE threshold_limit IS NOT NULL
      AND quantity <= threshold_limit
    ORDER BY quantity ASC, name ASC
  `);
  return rows.map(mapAlertRow);
}
