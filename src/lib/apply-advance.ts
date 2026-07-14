import { invoiceBalance, roundMoney } from "./money.js";
import type { PaymentStatus } from "./payment-status.js";

export type PendingInvoiceForAdvance = {
  /** Sale id, or stock-in invoice number keyed as string. */
  id: string;
  invoiceNo: number;
  total: number;
  advanceAmount: number;
  paymentStatus: PaymentStatus;
};

export type AdvanceAllocation = {
  id: string;
  invoiceNo: number;
  previousAdvance: number;
  newAdvance: number;
  previousStatus: PaymentStatus;
  newStatus: PaymentStatus;
  applied: number;
  previousBalance: number;
  newBalance: number;
};

export function paymentStatusFromAdvance(total: number, advance: number): PaymentStatus {
  const cappedAdvance = roundMoney(Math.min(Math.max(0, advance), total));
  if (cappedAdvance <= 0) return "pending";
  if (cappedAdvance >= roundMoney(total)) return "paid";
  return "half_paid";
}

/**
 * Apply a payment across unpaid invoices oldest-first.
 * Fully settles each invoice before overflowing into the next.
 */
export function allocateAdvanceFifo(
  invoices: PendingInvoiceForAdvance[],
  amount: number,
): { allocations: AdvanceAllocation[]; remainder: number; appliedTotal: number } {
  let remaining = roundMoney(amount);
  if (remaining <= 0) {
    return { allocations: [], remainder: 0, appliedTotal: 0 };
  }

  const allocations: AdvanceAllocation[] = [];

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    if (invoice.paymentStatus === "paid") continue;

    const previousBalance = invoiceBalance(invoice.total, invoice.advanceAmount);
    if (previousBalance <= 0) continue;

    const applied = roundMoney(Math.min(remaining, previousBalance));
    const newAdvance = roundMoney(invoice.advanceAmount + applied);
    const newStatus = paymentStatusFromAdvance(invoice.total, newAdvance);
    const newBalance = invoiceBalance(invoice.total, newAdvance);

    allocations.push({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      previousAdvance: invoice.advanceAmount,
      newAdvance,
      previousStatus: invoice.paymentStatus,
      newStatus,
      applied,
      previousBalance,
      newBalance,
    });

    remaining = roundMoney(remaining - applied);
  }

  const appliedTotal = roundMoney(amount - remaining);
  return { allocations, remainder: remaining, appliedTotal };
}
