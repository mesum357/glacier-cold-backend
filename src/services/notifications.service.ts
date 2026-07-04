import { pool } from "../db/pool.js";
import { formatDateOnly } from "../lib/date-only.js";
import {
  DEFAULT_EXPIRY_ALERT_DAYS,
  daysUntilExpiry,
  effectiveAlertDays,
} from "../lib/expiry.js";
import { computeProductStatus } from "../lib/product-status.js";

export type StockAlert = {
  id: string;
  type: "stock";
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  thresholdLimit: number;
  status: "Shortage" | "Out of Stock";
  message: string;
  createdAt: string;
};

export type ExpiryAlert = {
  id: string;
  type: "expiry";
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  expiryDate: string;
  daysLeft: number;
  expiryAlertDays: number;
  message: string;
  createdAt: string;
};

export type NotificationAlert = StockAlert | ExpiryAlert;

export function mapAlertRow(row: Record<string, unknown>): StockAlert {
  const quantity = Number(row.quantity);
  const thresholdLimit = Number(row.threshold_limit);
  const status = computeProductStatus(quantity, thresholdLimit);
  const productName = row.name as string;
  const label = status === "Out of Stock" ? "is out of stock" : "reached shortage level";
  return {
    id: `alert-stock-${row.id}`,
    type: "stock",
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

export function mapExpiryAlertRow(
  row: Record<string, unknown>,
  today: Date = new Date(),
): ExpiryAlert {
  const productName = row.name as string;
  const expiryDate = formatDateOnly(row.expiry_date as Date | string);
  const alertDays = effectiveAlertDays(
    row.expiry_alert_days == null ? null : Number(row.expiry_alert_days),
  );
  const daysLeft = daysUntilExpiry(expiryDate, today);

  return {
    id: `alert-expiry-${row.id}`,
    type: "expiry",
    productId: row.id as string,
    productName,
    category: row.category as string,
    quantity: Number(row.quantity),
    expiryDate,
    daysLeft,
    expiryAlertDays: alertDays,
    message: `${productName} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${expiryDate})`,
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

export async function listExpiryAlerts(): Promise<ExpiryAlert[]> {
  const { rows } = await pool.query(
    `
    SELECT id, name, category, quantity, expiry_date, expiry_alert_days, updated_at
    FROM products
    WHERE expiry_date IS NOT NULL
      AND expiry_date >= CURRENT_DATE
      AND (expiry_date - CURRENT_DATE) <= COALESCE(expiry_alert_days, $1)
    ORDER BY expiry_date ASC, name ASC
    `,
    [DEFAULT_EXPIRY_ALERT_DAYS],
  );
  return rows.map((row) => mapExpiryAlertRow(row));
}

export async function listAllAlerts(): Promise<NotificationAlert[]> {
  const [expiryAlerts, stockAlerts] = await Promise.all([
    listExpiryAlerts(),
    listStockAlerts(),
  ]);
  return [...expiryAlerts, ...stockAlerts];
}
