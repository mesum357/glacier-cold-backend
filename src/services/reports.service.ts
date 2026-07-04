import { pool } from "../db/pool.js";
import { formatDateOnly } from "../lib/date-only.js";
import type { PaymentStatus } from "../lib/payment-status.js";
import {
  isPartyReportPeriod,
  partyPeriodLabel,
  partyPeriodQueryParams,
  partyPurchaseDateRangeSql,
  partySaleDateRangeSql,
  periodQueryParams,
  purchaseDateRangeSql,
  saleDateRangeSql,
  type PartyReportPeriod,
  type PeriodBounds,
  type ReportPeriod,
} from "../lib/report-periods.js";
import { mapProductRow } from "./products.service.js";
import { getShopSettings } from "./settings.service.js";

export type SalesChartPoint = { label: string; value: number };

export type PeriodMetrics = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number | null;
  purchases: number;
  previousRevenue: number;
  previousCogs: number;
  previousGrossProfit: number;
  changePercent: number | null;
  chart: SalesChartPoint[];
};

export type DailySalesLine = {
  saleId: string;
  invoiceNo: number;
  saleAt: string;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  lineCogs: number;
  lineProfit: number;
  itemPaymentStatus: PaymentStatus;
  consumer: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    status: string | null;
  };
};

export type DailyPurchaseLine = {
  id: string;
  invoiceNo: number;
  receivedAt: string;
  productName: string;
  productCategory: string;
  quantity: number;
  buyingPrice: number;
  lineTotal: number;
  productionDate: string | null;
  expiryDate: string | null;
  paymentStatus: PaymentStatus;
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
};

export type StockLeftoverLine = {
  id: string;
  name: string;
  category: string;
  barcode: string;
  quantity: number;
  buyingPrice: number;
  sellingPrice: number | null;
  stockValue: number;
  productionDate: string | null;
  expiryDate: string | null;
  thresholdLimit: number | null;
  status: string;
};

export type ReportsData = {
  reportDate: string;
  timezone: string;
  currency: string;
  weekStartsOn: "monday";
  daily: PeriodMetrics;
  weekly: PeriodMetrics;
  monthly: PeriodMetrics;
  dailySales: DailySalesLine[];
  dailyPurchases: DailyPurchaseLine[];
  stockLeftover: StockLeftoverLine[];
  inventoryHealthPercent: number;
  categoriesNeedingRestock: number;
};

export type PartyReportMetrics = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number | null;
  purchases: number;
  transactionCount: number;
  lineCount: number;
};

export type ConsumerReportData = {
  reportDate: string;
  timezone: string;
  period: PartyReportPeriod;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  consumer: {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    status: string;
  };
  metrics: PartyReportMetrics;
  sales: DailySalesLine[];
};

export type SupplierReportData = {
  reportDate: string;
  timezone: string;
  period: PartyReportPeriod;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  supplier: {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  metrics: PartyReportMetrics;
  purchases: DailyPurchaseLine[];
};

type SalePeriod = ReportPeriod;
type PurchasePeriod = ReportPeriod;

function formatBoundsLabel(period: string, start: string, end: string): string {
  if (period === "today") return start;
  return `${start} – ${end}`;
}

async function resolvePartyPeriodBounds(
  period: PartyReportPeriod,
  reportDate: string,
  year?: number,
): Promise<PeriodBounds> {
  if (period === "year" && year != null) {
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: String(year),
    };
  }

  const monthMatch = period.match(/^month-(\d{1,2})$/);
  if (monthMatch && year != null) {
    const month = Number(monthMatch[1]);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });
    return { start, end, label: `${monthName} ${year}` };
  }

  return resolvePeriodBounds(period, reportDate);
}

async function resolvePeriodBounds(
  period: PartyReportPeriod | "today" | "this_week" | "this_month",
  reportDate: string,
): Promise<PeriodBounds> {
  const { rows } = await pool.query(
    `
    SELECT
      CASE $2
        WHEN 'today' THEN $1::date
        WHEN 'this_week' THEN date_trunc('week', $1::date)::date
        WHEN 'this_month' THEN date_trunc('month', $1::date)::date
      END AS start_date,
      CASE $2
        WHEN 'today' THEN $1::date
        WHEN 'this_week' THEN (date_trunc('week', $1::date) + INTERVAL '6 days')::date
        WHEN 'this_month' THEN (date_trunc('month', $1::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
      END AS end_date
    `,
    [reportDate, period],
  );

  const start = formatDateOnly(rows[0].start_date as Date | string);
  const end = formatDateOnly(rows[0].end_date as Date | string);
  return {
    start,
    end,
    label: formatBoundsLabel(period, start, end),
  };
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function marginPercent(revenue: number, grossProfit: number): number | null {
  if (revenue === 0) return null;
  return Math.round((grossProfit / revenue) * 1000) / 10;
}

const ITEM_COST_SQL = `si.quantity * COALESCE(si.unit_cost, p.buying_price, 0)`;

async function sumSalesMetricsForPeriod(
  timezone: string,
  period: SalePeriod,
  reportDate?: string,
  consumerName?: string,
): Promise<{ revenue: number; cogs: number }> {
  const consumerFilter = consumerName ? `AND s.supplier_name = $${reportDate ? 3 : 2}` : "";
  const params = reportDate
    ? consumerName
      ? [timezone, reportDate, consumerName]
      : periodQueryParams(timezone, reportDate)
    : consumerName
      ? [timezone, consumerName]
      : periodQueryParams(timezone, reportDate);

  const { rows } = await pool.query(
    `
    SELECT
      COALESCE(SUM(si.line_total), 0)::numeric AS revenue,
      COALESCE(SUM(${ITEM_COST_SQL}), 0)::numeric AS cogs
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE ${saleDateRangeSql(period, reportDate)}
    ${consumerFilter}
    `,
    params,
  );
  return {
    revenue: Number(rows[0].revenue),
    cogs: Number(rows[0].cogs),
  };
}

async function sumPurchasesForPeriod(
  timezone: string,
  period: PurchasePeriod,
  reportDate?: string,
  supplierId?: string,
): Promise<number> {
  const supplierFilter = supplierId ? `AND si.supplier_id = $${reportDate ? 3 : 2}` : "";
  const params = reportDate
    ? supplierId
      ? [timezone, reportDate, supplierId]
      : periodQueryParams(timezone, reportDate)
    : supplierId
      ? [timezone, supplierId]
      : periodQueryParams(timezone, reportDate);

  const { rows } = await pool.query(
    `
    SELECT COALESCE(SUM(si.buying_price * si.quantity), 0)::numeric AS total
    FROM stock_ins si
    WHERE ${purchaseDateRangeSql(period, reportDate)}
    ${supplierFilter}
    `,
    params,
  );
  return Number(rows[0].total);
}

async function dailyGrossProfitChart(
  timezone: string,
  reportDate?: string,
): Promise<SalesChartPoint[]> {
  const anchor = reportDate ? `$2::date` : `(NOW() AT TIME ZONE $1)::date`;
  const params = periodQueryParams(timezone, reportDate);

  const { rows } = await pool.query(
    `
    WITH days AS (
      SELECT generate_series(
        ${anchor} - INTERVAL '6 days',
        ${anchor},
        INTERVAL '1 day'
      )::date AS day
    ),
    sales_by_day AS (
      SELECT
        (s.sale_at AT TIME ZONE $1)::date AS day,
        COALESCE(SUM(si.line_total), 0)::numeric AS revenue,
        COALESCE(SUM(${ITEM_COST_SQL}), 0)::numeric AS cogs
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE (s.sale_at AT TIME ZONE $1)::date >= (${anchor} - INTERVAL '6 days')::date
        AND (s.sale_at AT TIME ZONE $1)::date <= ${anchor}::date
      GROUP BY day
    )
    SELECT
      to_char(d.day, 'Dy DD') AS label,
      (COALESCE(s.revenue, 0) - COALESCE(s.cogs, 0))::numeric AS value
    FROM days d
    LEFT JOIN sales_by_day s ON s.day = d.day
    ORDER BY d.day
    `,
    params,
  );
  return rows.map((r) => ({ label: r.label as string, value: Number(r.value) }));
}

async function weeklyGrossProfitChart(
  timezone: string,
  reportDate?: string,
): Promise<SalesChartPoint[]> {
  const anchor = reportDate ? `$2::date` : `(NOW() AT TIME ZONE $1)::date`;
  const params = periodQueryParams(timezone, reportDate);

  const { rows } = await pool.query(
    `
    WITH weeks AS (
      SELECT generate_series(
        (date_trunc('week', ${anchor}) - INTERVAL '6 weeks')::date,
        date_trunc('week', ${anchor})::date,
        INTERVAL '1 week'
      )::date AS week_start
    ),
    sales_by_week AS (
      SELECT
        date_trunc('week', s.sale_at AT TIME ZONE $1)::date AS week_start,
        COALESCE(SUM(si.line_total), 0)::numeric AS revenue,
        COALESCE(SUM(${ITEM_COST_SQL}), 0)::numeric AS cogs
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE (s.sale_at AT TIME ZONE $1)::date >= (date_trunc('week', ${anchor}) - INTERVAL '6 weeks')::date
        AND (s.sale_at AT TIME ZONE $1)::date < (date_trunc('week', ${anchor}) + INTERVAL '7 days')::date
      GROUP BY week_start
    )
    SELECT
      to_char(w.week_start, 'DD Mon') AS label,
      (COALESCE(s.revenue, 0) - COALESCE(s.cogs, 0))::numeric AS value
    FROM weeks w
    LEFT JOIN sales_by_week s ON s.week_start = w.week_start
    ORDER BY w.week_start
    `,
    params,
  );
  return rows.map((r) => ({ label: r.label as string, value: Number(r.value) }));
}

async function monthlyGrossProfitChart(
  timezone: string,
  reportDate?: string,
): Promise<SalesChartPoint[]> {
  const anchor = reportDate ? `$2::date` : `(NOW() AT TIME ZONE $1)::date`;
  const params = periodQueryParams(timezone, reportDate);

  const { rows } = await pool.query(
    `
    WITH months AS (
      SELECT generate_series(
        (date_trunc('month', ${anchor}) - INTERVAL '6 months')::date,
        date_trunc('month', ${anchor})::date,
        INTERVAL '1 month'
      )::date AS month_start
    ),
    sales_by_month AS (
      SELECT
        date_trunc('month', s.sale_at AT TIME ZONE $1)::date AS month_start,
        COALESCE(SUM(si.line_total), 0)::numeric AS revenue,
        COALESCE(SUM(${ITEM_COST_SQL}), 0)::numeric AS cogs
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE (s.sale_at AT TIME ZONE $1)::date >= (date_trunc('month', ${anchor}) - INTERVAL '6 months')::date
        AND (s.sale_at AT TIME ZONE $1)::date < (date_trunc('month', ${anchor}) + INTERVAL '1 month')::date
      GROUP BY month_start
    )
    SELECT
      to_char(m.month_start, 'Mon YY') AS label,
      (COALESCE(s.revenue, 0) - COALESCE(s.cogs, 0))::numeric AS value
    FROM months m
    LEFT JOIN sales_by_month s ON s.month_start = m.month_start
    ORDER BY m.month_start
    `,
    params,
  );
  return rows.map((r) => ({ label: r.label as string, value: Number(r.value) }));
}

async function buildPeriodMetrics(
  timezone: string,
  currentPeriod: "today" | "this_week" | "this_month",
  previousPeriod: "yesterday" | "last_week" | "last_month",
  chartFn: (tz: string, date?: string) => Promise<SalesChartPoint[]>,
  reportDate: string,
): Promise<PeriodMetrics> {
  const [current, previous, purchases, chart, bounds] = await Promise.all([
    sumSalesMetricsForPeriod(timezone, currentPeriod, reportDate),
    sumSalesMetricsForPeriod(timezone, previousPeriod, reportDate),
    sumPurchasesForPeriod(timezone, currentPeriod, reportDate),
    chartFn(timezone, reportDate),
    resolvePeriodBounds(currentPeriod, reportDate),
  ]);

  const grossProfit = current.revenue - current.cogs;
  const previousGrossProfit = previous.revenue - previous.cogs;

  return {
    periodLabel: bounds.label,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    revenue: current.revenue,
    cogs: current.cogs,
    grossProfit,
    marginPercent: marginPercent(current.revenue, grossProfit),
    purchases,
    previousRevenue: previous.revenue,
    previousCogs: previous.cogs,
    previousGrossProfit,
    changePercent: changePercent(grossProfit, previousGrossProfit),
    chart,
  };
}

async function getPartySalesReportLines(
  timezone: string,
  period: PartyReportPeriod,
  reportDate: string,
  year: number | undefined,
  consumerName?: string,
): Promise<DailySalesLine[]> {
  const params = partyPeriodQueryParams(timezone, period, reportDate, year, consumerName);
  const consumerFilter = consumerName ? `AND s.supplier_name = $${params.length}` : "";

  const { rows } = await pool.query(
    `
    SELECT
      s.id AS sale_id,
      s.invoice_no,
      s.sale_at,
      s.payment_status AS sale_payment_status,
      s.total_amount,
      s.supplier_name,
      si.product_name,
      si.quantity,
      si.unit_price,
      si.line_total,
      si.payment_status AS item_payment_status,
      COALESCE(si.unit_cost, p.buying_price, 0)::numeric AS unit_cost,
      c.phone AS consumer_phone,
      c.email AS consumer_email,
      c.address AS consumer_address,
      c.status AS consumer_status
    FROM sales s
    INNER JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN LATERAL (
      SELECT phone, email, address, status
      FROM consumers
      WHERE name = s.supplier_name
      ORDER BY created_at DESC
      LIMIT 1
    ) c ON true
    WHERE ${partySaleDateRangeSql(period)}
    ${consumerFilter}
    ORDER BY s.sale_at DESC, s.invoice_no DESC, si.line_order ASC, si.id ASC
    `,
    params,
  );

  return rows.map((r) => {
    const quantity = Number(r.quantity);
    const unitCost = Number(r.unit_cost);
    const lineCogs = quantity * unitCost;
    const lineTotal = Number(r.line_total);
    return {
      saleId: r.sale_id as string,
      invoiceNo: Number(r.invoice_no),
      saleAt: (r.sale_at as Date).toISOString(),
      paymentStatus: r.sale_payment_status as PaymentStatus,
      totalAmount: Number(r.total_amount),
      productName: r.product_name as string,
      quantity,
      unitPrice: Number(r.unit_price),
      unitCost,
      lineTotal,
      lineCogs,
      lineProfit: lineTotal - lineCogs,
      itemPaymentStatus: r.item_payment_status as PaymentStatus,
      consumer: {
        name: r.supplier_name as string,
        phone: (r.consumer_phone as string) ?? null,
        email: (r.consumer_email as string) ?? null,
        address: (r.consumer_address as string) ?? null,
        status: (r.consumer_status as string) ?? null,
      },
    };
  });
}

async function getPartyPurchaseReportLines(
  timezone: string,
  period: PartyReportPeriod,
  reportDate: string,
  year: number | undefined,
  supplierId?: string,
): Promise<DailyPurchaseLine[]> {
  const params = partyPeriodQueryParams(timezone, period, reportDate, year, supplierId);
  const supplierFilter = supplierId ? `AND si.supplier_id = $${params.length}` : "";

  const { rows } = await pool.query(
    `
    SELECT
      si.id,
      si.invoice_no,
      si.received_at,
      si.product_name,
      si.product_category,
      si.quantity,
      si.buying_price,
      si.production_date,
      si.expiry_date,
      si.payment_status,
      si.supplier_id,
      si.supplier_name,
      sup.phone AS supplier_phone,
      sup.email AS supplier_email,
      sup.address AS supplier_address
    FROM stock_ins si
    LEFT JOIN suppliers sup ON sup.id = si.supplier_id
    WHERE ${partyPurchaseDateRangeSql(period)}
    ${supplierFilter}
    ORDER BY si.received_at DESC, si.invoice_no DESC, si.line_order ASC, si.id ASC
    `,
    params,
  );

  return rows.map((r) => ({
    id: r.id as string,
    invoiceNo: Number(r.invoice_no),
    receivedAt: (r.received_at as Date).toISOString(),
    productName: r.product_name as string,
    productCategory: r.product_category as string,
    quantity: Number(r.quantity),
    buyingPrice: Number(r.buying_price),
    lineTotal: Number(r.buying_price) * Number(r.quantity),
    productionDate: r.production_date
      ? formatDateOnly(r.production_date as Date | string)
      : null,
    expiryDate: r.expiry_date ? formatDateOnly(r.expiry_date as Date | string) : null,
    paymentStatus: r.payment_status as PaymentStatus,
    supplier: {
      id: r.supplier_id as string,
      name: r.supplier_name as string,
      phone: (r.supplier_phone as string) ?? null,
      email: (r.supplier_email as string) ?? null,
      address: (r.supplier_address as string) ?? null,
    },
  }));
}

async function getSalesReportLines(
  timezone: string,
  period: ReportPeriod,
  reportDate: string,
  consumerName?: string,
): Promise<DailySalesLine[]> {
  const consumerFilter = consumerName ? `AND s.supplier_name = $3` : "";
  const params = consumerName ? [timezone, reportDate, consumerName] : [timezone, reportDate];

  const { rows } = await pool.query(
    `
    SELECT
      s.id AS sale_id,
      s.invoice_no,
      s.sale_at,
      s.payment_status AS sale_payment_status,
      s.total_amount,
      s.supplier_name,
      si.product_name,
      si.quantity,
      si.unit_price,
      si.line_total,
      si.payment_status AS item_payment_status,
      COALESCE(si.unit_cost, p.buying_price, 0)::numeric AS unit_cost,
      c.phone AS consumer_phone,
      c.email AS consumer_email,
      c.address AS consumer_address,
      c.status AS consumer_status
    FROM sales s
    INNER JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN LATERAL (
      SELECT phone, email, address, status
      FROM consumers
      WHERE name = s.supplier_name
      ORDER BY created_at DESC
      LIMIT 1
    ) c ON true
    WHERE ${saleDateRangeSql(period, reportDate)}
    ${consumerFilter}
    ORDER BY s.sale_at DESC, s.invoice_no DESC, si.line_order ASC, si.id ASC
    `,
    params,
  );

  return rows.map((r) => {
    const quantity = Number(r.quantity);
    const unitCost = Number(r.unit_cost);
    const lineCogs = quantity * unitCost;
    const lineTotal = Number(r.line_total);
    return {
      saleId: r.sale_id as string,
      invoiceNo: Number(r.invoice_no),
      saleAt: (r.sale_at as Date).toISOString(),
      paymentStatus: r.sale_payment_status as PaymentStatus,
      totalAmount: Number(r.total_amount),
      productName: r.product_name as string,
      quantity,
      unitPrice: Number(r.unit_price),
      unitCost,
      lineTotal,
      lineCogs,
      lineProfit: lineTotal - lineCogs,
      itemPaymentStatus: r.item_payment_status as PaymentStatus,
      consumer: {
        name: r.supplier_name as string,
        phone: (r.consumer_phone as string) ?? null,
        email: (r.consumer_email as string) ?? null,
        address: (r.consumer_address as string) ?? null,
        status: (r.consumer_status as string) ?? null,
      },
    };
  });
}

async function getDailySalesReport(timezone: string, reportDate: string): Promise<DailySalesLine[]> {
  return getSalesReportLines(timezone, "today", reportDate);
}

async function getPurchaseReportLines(
  timezone: string,
  period: ReportPeriod,
  reportDate: string,
  supplierId?: string,
): Promise<DailyPurchaseLine[]> {
  const supplierFilter = supplierId ? `AND si.supplier_id = $3` : "";
  const params = supplierId ? [timezone, reportDate, supplierId] : [timezone, reportDate];

  const { rows } = await pool.query(
    `
    SELECT
      si.id,
      si.invoice_no,
      si.received_at,
      si.product_name,
      si.product_category,
      si.quantity,
      si.buying_price,
      si.production_date,
      si.expiry_date,
      si.payment_status,
      si.supplier_id,
      si.supplier_name,
      sup.phone AS supplier_phone,
      sup.email AS supplier_email,
      sup.address AS supplier_address
    FROM stock_ins si
    LEFT JOIN suppliers sup ON sup.id = si.supplier_id
    WHERE ${purchaseDateRangeSql(period, reportDate)}
    ${supplierFilter}
    ORDER BY si.received_at DESC, si.invoice_no DESC, si.line_order ASC, si.id ASC
    `,
    params,
  );

  return rows.map((r) => ({
    id: r.id as string,
    invoiceNo: Number(r.invoice_no),
    receivedAt: (r.received_at as Date).toISOString(),
    productName: r.product_name as string,
    productCategory: r.product_category as string,
    quantity: Number(r.quantity),
    buyingPrice: Number(r.buying_price),
    lineTotal: Number(r.buying_price) * Number(r.quantity),
    productionDate: r.production_date
      ? formatDateOnly(r.production_date as Date | string)
      : null,
    expiryDate: r.expiry_date ? formatDateOnly(r.expiry_date as Date | string) : null,
    paymentStatus: r.payment_status as PaymentStatus,
    supplier: {
      id: r.supplier_id as string,
      name: r.supplier_name as string,
      phone: (r.supplier_phone as string) ?? null,
      email: (r.supplier_email as string) ?? null,
      address: (r.supplier_address as string) ?? null,
    },
  }));
}

async function getDailyPurchaseReport(
  timezone: string,
  reportDate: string,
): Promise<DailyPurchaseLine[]> {
  return getPurchaseReportLines(timezone, "today", reportDate);
}

async function getStockLeftoverReport(): Promise<StockLeftoverLine[]> {
  const { rows } = await pool.query(
    `SELECT * FROM products ORDER BY quantity DESC, name ASC`,
  );

  return rows.map((r) => {
    const product = mapProductRow(r);
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      quantity: product.quantity,
      buyingPrice: product.buyingPrice,
      sellingPrice: product.sellingPrice,
      stockValue: product.quantity * product.buyingPrice,
      productionDate: product.productionDate,
      expiryDate: product.expiryDate,
      thresholdLimit: product.thresholdLimit,
      status: product.status,
    };
  });
}

async function resolveReportDate(timezone: string, date?: string): Promise<string> {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const { rows } = await pool.query(
    `SELECT (NOW() AT TIME ZONE $1)::date::text AS today`,
    [timezone],
  );
  return rows[0].today as string;
}

function buildPartyMetricsFromSales(sales: DailySalesLine[]): PartyReportMetrics {
  const revenue = sales.reduce((sum, line) => sum + line.lineTotal, 0);
  const cogs = sales.reduce((sum, line) => sum + line.lineCogs, 0);
  const grossProfit = revenue - cogs;
  const transactionCount = new Set(sales.map((line) => line.saleId)).size;
  return {
    revenue,
    cogs,
    grossProfit,
    marginPercent: marginPercent(revenue, grossProfit),
    purchases: 0,
    transactionCount,
    lineCount: sales.length,
  };
}

function buildPartyMetricsFromPurchases(purchases: DailyPurchaseLine[]): PartyReportMetrics {
  const total = purchases.reduce((sum, line) => sum + line.lineTotal, 0);
  const transactionCount = new Set(purchases.map((line) => line.invoiceNo)).size;
  return {
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    marginPercent: null,
    purchases: total,
    transactionCount,
    lineCount: purchases.length,
  };
}

export async function getConsumerReport(
  consumerId: string,
  period: PartyReportPeriod,
  date?: string,
  year?: number,
): Promise<ConsumerReportData> {
  const settings = await getShopSettings();
  const tz = settings.timezone;
  const reportDate = await resolveReportDate(tz, date);

  const { rows: consumerRows } = await pool.query(
    `SELECT id, name, phone, email, address, status FROM consumers WHERE id = $1`,
    [consumerId],
  );
  const consumer = consumerRows[0];
  if (!consumer) {
    throw new Error("Consumer not found");
  }

  const [sales, bounds] = await Promise.all([
    getPartySalesReportLines(tz, period, reportDate, year, consumer.name as string),
    resolvePartyPeriodBounds(period, reportDate, year),
  ]);

  return {
    reportDate,
    timezone: tz,
    period,
    periodLabel: `${partyPeriodLabel(period, year)} · ${bounds.label}`,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    consumer: {
      id: consumer.id as string,
      name: consumer.name as string,
      phone: consumer.phone as string,
      email: consumer.email as string,
      address: consumer.address as string,
      status: consumer.status as string,
    },
    metrics: buildPartyMetricsFromSales(sales),
    sales,
  };
}

export async function getSupplierReport(
  supplierId: string,
  period: PartyReportPeriod,
  date?: string,
  year?: number,
): Promise<SupplierReportData> {
  const settings = await getShopSettings();
  const tz = settings.timezone;
  const reportDate = await resolveReportDate(tz, date);

  const { rows: supplierRows } = await pool.query(
    `SELECT id, name, phone, email, address FROM suppliers WHERE id = $1`,
    [supplierId],
  );
  const supplier = supplierRows[0];
  if (!supplier) {
    throw new Error("Supplier not found");
  }

  const [purchases, bounds] = await Promise.all([
    getPartyPurchaseReportLines(tz, period, reportDate, year, supplierId),
    resolvePartyPeriodBounds(period, reportDate, year),
  ]);

  return {
    reportDate,
    timezone: tz,
    period,
    periodLabel: `${partyPeriodLabel(period, year)} · ${bounds.label}`,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    supplier: {
      id: supplier.id as string,
      name: supplier.name as string,
      phone: supplier.phone as string,
      email: supplier.email as string,
      address: supplier.address as string,
    },
    metrics: buildPartyMetricsFromPurchases(purchases),
    purchases,
  };
}

export async function getReports(date?: string): Promise<ReportsData> {
  const settings = await getShopSettings();
  const tz = settings.timezone;
  const reportDate = await resolveReportDate(tz, date);

  const [daily, weekly, monthly, dailySales, dailyPurchases, stockLeftover, healthRows] =
    await Promise.all([
      buildPeriodMetrics(tz, "today", "yesterday", dailyGrossProfitChart, reportDate),
      buildPeriodMetrics(tz, "this_week", "last_week", weeklyGrossProfitChart, reportDate),
      buildPeriodMetrics(tz, "this_month", "last_month", monthlyGrossProfitChart, reportDate),
      getDailySalesReport(tz, reportDate),
      getDailyPurchaseReport(tz, reportDate),
      getStockLeftoverReport(),
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE quantity > 0)::int AS in_stock,
          COUNT(DISTINCT category) FILTER (
            WHERE threshold_limit IS NOT NULL
              AND quantity <= threshold_limit
          )::int AS categories_needing_restock
        FROM products
      `),
    ]);

  const total = Number(healthRows.rows[0].total);
  const inStock = Number(healthRows.rows[0].in_stock);
  const categoriesNeedingRestock = Number(healthRows.rows[0].categories_needing_restock);

  return {
    reportDate,
    timezone: tz,
    currency: settings.currency,
    weekStartsOn: "monday",
    daily,
    weekly,
    monthly,
    dailySales,
    dailyPurchases,
    stockLeftover,
    inventoryHealthPercent: total === 0 ? 100 : Math.round((inStock / total) * 100),
    categoriesNeedingRestock,
  };
}
