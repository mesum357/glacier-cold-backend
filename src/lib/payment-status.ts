export const PAYMENT_STATUSES = ["pending", "paid", "half_paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function parsePaymentStatus(value: string): PaymentStatus {
  if (!isPaymentStatus(value)) {
    throw new Error("Invalid payment status");
  }
  return value;
}

/** Derive sale-level status from line-item statuses. */
export function aggregatePaymentStatus(statuses: PaymentStatus[]): PaymentStatus {
  if (statuses.length === 0) return "pending";
  const unique = new Set(statuses);
  if (unique.size === 1) return statuses[0];
  if (unique.has("pending")) return "pending";
  if (unique.has("half_paid")) return "half_paid";
  return "paid";
}
