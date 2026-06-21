import { pool } from "../db/pool.js";
import { countExpiringSoonProducts } from "./products.service.js";
import { getShopSettings } from "./settings.service.js";

export type SalesChartPoint = { label: string; value: number };

export type TopProduct = {
  name: string;
  sold: number;
  revenue: number;
};

export type LowStockProduct = {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
  thresholdLimit: number | null;
};

export type ReportsData = {
  timezone: string;
  currency: string;
  daily: {
    total: number;
    previousTotal: number;
    changePercent: number | null;
    chart: SalesChartPoint[];
  };
  weekly: {
    total: number;
    previousTotal: number;
    changePercent: number | null;
    chart: SalesChartPoint[];
  };
  monthly: {
    total: number;
    previousTotal: number;
    changePercent: number | null;
    chart: SalesChartPoint[];
  };
  topProducts: TopProduct[];
  lowStock: LowStockProduct[];
  lowStockCount: number;
  expiringSoonCount: number;
  inventoryHealthPercent: number;
  categoriesNeedingRestock: number;
};

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

async function sumSalesForPeriod(
  timezone: string,
  period: "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month",
): Promise<number> {
  const conditions: Record<string, string> = {
    today: `(sale_at AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date`,
    yesterday: `(sale_at AT TIME ZONE $1)::date = ((NOW() AT TIME ZONE $1)::date - INTERVAL '1 day')`,
    this_week: `date_trunc('week', sale_at AT TIME ZONE $1) = date_trunc('week', NOW() AT TIME ZONE $1)`,
    last_week: `date_trunc('week', sale_at AT TIME ZONE $1) = date_trunc('week', (NOW() AT TIME ZONE $1) - INTERVAL '1 week')`,
    this_month: `date_trunc('month', sale_at AT TIME ZONE $1) = date_trunc('month', NOW() AT TIME ZONE $1)`,
    last_month: `date_trunc('month', sale_at AT TIME ZONE $1) = date_trunc('month', (NOW() AT TIME ZONE $1) - INTERVAL '1 month')`,
  };
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(total_amount), 0)::numeric AS total FROM sales WHERE ${conditions[period]}`,
    [timezone],
  );
  return Number(rows[0].total);
}

async function dailyChart(timezone: string): Promise<SalesChartPoint[]> {
  const { rows } = await pool.query(
    `
    SELECT
      to_char(date_trunc('day', sale_at AT TIME ZONE $1), 'Dy') AS label,
      COALESCE(SUM(total_amount), 0)::numeric AS value,
      date_trunc('day', sale_at AT TIME ZONE $1) AS day
    FROM sales
    WHERE sale_at >= (NOW() AT TIME ZONE $1) - INTERVAL '6 days'
    GROUP BY day, label
    ORDER BY day
    `,
    [timezone],
  );
  return rows.map((r) => ({ label: r.label as string, value: Number(r.value) }));
}

async function weeklyChart(timezone: string): Promise<SalesChartPoint[]> {
  const { rows } = await pool.query(
    `
    SELECT
      'W' || to_char(date_trunc('week', sale_at AT TIME ZONE $1), 'IW') AS label,
      COALESCE(SUM(total_amount), 0)::numeric AS value,
      date_trunc('week', sale_at AT TIME ZONE $1) AS week
    FROM sales
    WHERE sale_at >= (NOW() AT TIME ZONE $1) - INTERVAL '6 weeks'
    GROUP BY week, label
    ORDER BY week
    `,
    [timezone],
  );
  return rows.map((r) => ({ label: r.label as string, value: Number(r.value) }));
}

async function monthlyChart(timezone: string): Promise<SalesChartPoint[]> {
  const { rows } = await pool.query(
    `
    SELECT
      to_char(date_trunc('month', sale_at AT TIME ZONE $1), 'Mon') AS label,
      COALESCE(SUM(total_amount), 0)::numeric AS value,
      date_trunc('month', sale_at AT TIME ZONE $1) AS month
    FROM sales
    WHERE sale_at >= (NOW() AT TIME ZONE $1) - INTERVAL '6 months'
    GROUP BY month, label
    ORDER BY month
    `,
    [timezone],
  );
  return rows.map((r) => ({ label: r.label as string, value: Number(r.value) }));
}

export async function getReports(): Promise<ReportsData> {
  const settings = await getShopSettings();
  const tz = settings.timezone;

  const dailyTotal = await sumSalesForPeriod(tz, "today");
  const dailyPrevious = await sumSalesForPeriod(tz, "yesterday");

  const weeklyTotal = await sumSalesForPeriod(tz, "this_week");
  const weeklyPrevious = await sumSalesForPeriod(tz, "last_week");

  const monthlyTotal = await sumSalesForPeriod(tz, "this_month");
  const monthlyPrevious = await sumSalesForPeriod(tz, "last_month");

  const { rows: topRows } = await pool.query(
    `
    SELECT
      si.product_name AS name,
      SUM(si.quantity)::int AS sold,
      COALESCE(SUM(si.line_total), 0)::numeric AS revenue
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.sale_id
    WHERE s.sale_at >= NOW() - INTERVAL '30 days'
    GROUP BY si.product_name
    ORDER BY sold DESC
    LIMIT 5
    `,
  );

  const { rows: lowRows } = await pool.query(
    `
    SELECT id, name, barcode, quantity, threshold_limit
    FROM products
    WHERE threshold_limit IS NOT NULL
      AND quantity <= threshold_limit
    ORDER BY quantity ASC, name ASC
    LIMIT 10
    `,
  );

  const { rows: lowCountRows } = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM products
    WHERE threshold_limit IS NOT NULL
      AND quantity <= threshold_limit
  `);

  const { rows: healthRows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE quantity > 0)::int AS in_stock,
      COUNT(DISTINCT category) FILTER (
        WHERE threshold_limit IS NOT NULL
          AND quantity <= threshold_limit
      )::int AS categories_needing_restock
    FROM products
  `);

  const total = Number(healthRows[0].total);
  const inStock = Number(healthRows[0].in_stock);
  const categoriesNeedingRestock = Number(healthRows[0].categories_needing_restock);
  const expiringSoonCount = await countExpiringSoonProducts();

  return {
    timezone: tz,
    currency: settings.currency,
    daily: {
      total: dailyTotal,
      previousTotal: dailyPrevious,
      changePercent: changePercent(dailyTotal, dailyPrevious),
      chart: await dailyChart(tz),
    },
    weekly: {
      total: weeklyTotal,
      previousTotal: weeklyPrevious,
      changePercent: changePercent(weeklyTotal, weeklyPrevious),
      chart: await weeklyChart(tz),
    },
    monthly: {
      total: monthlyTotal,
      previousTotal: monthlyPrevious,
      changePercent: changePercent(monthlyTotal, monthlyPrevious),
      chart: await monthlyChart(tz),
    },
    topProducts: topRows.map((r) => ({
      name: r.name as string,
      sold: Number(r.sold),
      revenue: Number(r.revenue),
    })),
    lowStock: lowRows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      barcode: r.barcode as string,
      quantity: Number(r.quantity),
      thresholdLimit:
        r.threshold_limit === null || r.threshold_limit === undefined
          ? null
          : Number(r.threshold_limit),
    })),
    lowStockCount: Number(lowCountRows[0].count),
    expiringSoonCount,
    inventoryHealthPercent: total === 0 ? 100 : Math.round((inStock / total) * 100),
    categoriesNeedingRestock,
  };
}
