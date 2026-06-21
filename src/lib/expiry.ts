export const DEFAULT_EXPIRY_ALERT_DAYS = 45;
export const MIN_EXPIRY_ALERT_DAYS = 30;

export function effectiveAlertDays(expiryAlertDays: number | null | undefined): number {
  return expiryAlertDays ?? DEFAULT_EXPIRY_ALERT_DAYS;
}

export function daysUntilExpiry(
  expiryDate: string | Date,
  today: Date = new Date(),
): number {
  const expiry = typeof expiryDate === "string" ? parseDateOnly(expiryDate) : expiryDate;
  const start = startOfDay(today);
  const end = startOfDay(expiry);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function isExpiringSoon(
  expiryDate: string | Date | null | undefined,
  expiryAlertDays: number | null | undefined,
  today: Date = new Date(),
): boolean {
  if (!expiryDate) return false;
  const daysLeft = daysUntilExpiry(expiryDate, today);
  if (daysLeft < 0) return false;
  return daysLeft <= effectiveAlertDays(expiryAlertDays);
}

function parseDateOnly(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
