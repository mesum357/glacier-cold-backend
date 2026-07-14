export type ReportPeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month";

export type PartyReportPeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "year"
  | "all_time"
  | `month-${number}`;

const PARTY_PERIOD_SET = new Set<string>([
  "today",
  "this_week",
  "this_month",
  "year",
  "all_time",
]);

export function isPartyReportPeriod(value: string): value is PartyReportPeriod {
  if (PARTY_PERIOD_SET.has(value)) return true;
  return /^month-\d{1,2}$/.test(value);
}

export function partyPeriodLabel(period: PartyReportPeriod, year?: number): string {
  if (period === "today") return "Daily";
  if (period === "this_week") return "Weekly";
  if (period === "this_month") return "Monthly";
  if (period === "year") return year ? `Year ${year}` : "Yearly";
  if (period === "all_time") return "All time";
  const monthMatch = period.match(/^month-(\d{1,2})$/);
  if (monthMatch) {
    const month = Number(monthMatch[1]);
    const monthName = new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" });
    return year ? `${monthName} ${year}` : monthName;
  }
  return period;
}

export type PeriodBounds = {
  start: string;
  end: string;
  label: string;
};

/** ISO week (Monday–Sunday) date ranges in shop timezone. */
export function saleDateRangeSql(period: ReportPeriod, reportDate?: string): string {
  const anchor = reportDate ? "$2::date" : `(NOW() AT TIME ZONE $1)::date`;
  const saleDate = `(s.sale_at AT TIME ZONE $1)::date`;

  const ranges: Record<ReportPeriod, string> = {
    today: `${saleDate} = ${anchor}`,
    yesterday: `${saleDate} = (${anchor} - INTERVAL '1 day')::date`,
    this_week: `${saleDate} >= date_trunc('week', ${anchor})::date AND ${saleDate} < (date_trunc('week', ${anchor}) + INTERVAL '7 days')::date`,
    last_week: `${saleDate} >= (date_trunc('week', ${anchor}) - INTERVAL '7 days')::date AND ${saleDate} < date_trunc('week', ${anchor})::date`,
    this_month: `${saleDate} >= date_trunc('month', ${anchor})::date AND ${saleDate} < (date_trunc('month', ${anchor}) + INTERVAL '1 month')::date`,
    last_month: `${saleDate} >= (date_trunc('month', ${anchor}) - INTERVAL '1 month')::date AND ${saleDate} < date_trunc('month', ${anchor})::date`,
  };
  return ranges[period];
}

export function purchaseDateRangeSql(period: ReportPeriod, reportDate?: string): string {
  const anchor = reportDate ? "$2::date" : `(NOW() AT TIME ZONE $1)::date`;
  const receivedDate = `(si.received_at AT TIME ZONE $1)::date`;

  const ranges: Record<ReportPeriod, string> = {
    today: `${receivedDate} = ${anchor}`,
    yesterday: `${receivedDate} = (${anchor} - INTERVAL '1 day')::date`,
    this_week: `${receivedDate} >= date_trunc('week', ${anchor})::date AND ${receivedDate} < (date_trunc('week', ${anchor}) + INTERVAL '7 days')::date`,
    last_week: `${receivedDate} >= (date_trunc('week', ${anchor}) - INTERVAL '7 days')::date AND ${receivedDate} < date_trunc('week', ${anchor})::date`,
    this_month: `${receivedDate} >= date_trunc('month', ${anchor})::date AND ${receivedDate} < (date_trunc('month', ${anchor}) + INTERVAL '1 month')::date`,
    last_month: `${receivedDate} >= (date_trunc('month', ${anchor}) - INTERVAL '1 month')::date AND ${receivedDate} < date_trunc('month', ${anchor})::date`,
  };
  return ranges[period];
}

export function periodQueryParams(timezone: string, reportDate?: string) {
  return reportDate ? [timezone, reportDate] : [timezone];
}

export function partySaleDateRangeSql(period: string): string {
  const saleDate = `(s.sale_at AT TIME ZONE $1)::date`;
  const anchor = `$2::date`;

  if (period === "all_time") {
    // No date bound — reference $1 so the timezone param stays used.
    return `(s.sale_at AT TIME ZONE $1) IS NOT NULL`;
  }
  if (period === "today") {
    return `${saleDate} = ${anchor}`;
  }
  if (period === "this_week") {
    return `${saleDate} >= date_trunc('week', ${anchor})::date AND ${saleDate} < (date_trunc('week', ${anchor}) + INTERVAL '7 days')::date`;
  }
  if (period === "this_month") {
    return `${saleDate} >= date_trunc('month', ${anchor})::date AND ${saleDate} < (date_trunc('month', ${anchor}) + INTERVAL '1 month')::date`;
  }
  if (period === "year") {
    return `${saleDate} >= make_date($2::int, 1, 1) AND ${saleDate} < make_date(($2::int + 1), 1, 1)`;
  }
  const monthMatch = period.match(/^month-(\d{1,2})$/);
  if (monthMatch) {
    const month = Number(monthMatch[1]);
    return `${saleDate} >= make_date($2::int, ${month}::int, 1) AND ${saleDate} < (make_date($2::int, ${month}::int, 1) + INTERVAL '1 month')::date`;
  }
  return `${saleDate} = ${anchor}`;
}

export function partyPurchaseDateRangeSql(period: string): string {
  const receivedDate = `(si.received_at AT TIME ZONE $1)::date`;
  const anchor = `$2::date`;

  if (period === "all_time") {
    // No date bound — reference $1 so the timezone param stays used.
    return `(si.received_at AT TIME ZONE $1) IS NOT NULL`;
  }
  if (period === "today") {
    return `${receivedDate} = ${anchor}`;
  }
  if (period === "this_week") {
    return `${receivedDate} >= date_trunc('week', ${anchor})::date AND ${receivedDate} < (date_trunc('week', ${anchor}) + INTERVAL '7 days')::date`;
  }
  if (period === "this_month") {
    return `${receivedDate} >= date_trunc('month', ${anchor})::date AND ${receivedDate} < (date_trunc('month', ${anchor}) + INTERVAL '1 month')::date`;
  }
  if (period === "year") {
    return `${receivedDate} >= make_date($2::int, 1, 1) AND ${receivedDate} < make_date(($2::int + 1), 1, 1)`;
  }
  const monthMatch = period.match(/^month-(\d{1,2})$/);
  if (monthMatch) {
    const month = Number(monthMatch[1]);
    return `${receivedDate} >= make_date($2::int, ${month}::int, 1) AND ${receivedDate} < (make_date($2::int, ${month}::int, 1) + INTERVAL '1 month')::date`;
  }
  return `${receivedDate} = ${anchor}`;
}

export function partyPeriodQueryParams(
  timezone: string,
  period: string,
  reportDate: string,
  year?: number,
  entityValue?: string,
): unknown[] {
  const isMonthOrYear = period === "year" || /^month-\d{1,2}$/.test(period);
  let base: unknown[];
  if (period === "all_time") {
    // all_time SQL only references $1 (timezone).
    base = [timezone];
  } else if (isMonthOrYear && year != null) {
    base = [timezone, year];
  } else {
    base = [timezone, reportDate];
  }
  if (entityValue != null) {
    return [...base, entityValue];
  }
  return base;
}

export function currentPeriodLabel(period: "today" | "this_week" | "this_month"): string {
  const labels = {
    today: "Daily",
    this_week: "Weekly (Mon–Sun)",
    this_month: "Monthly",
  };
  return labels[period];
}
