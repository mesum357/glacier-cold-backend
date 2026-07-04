export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function saleLineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

export function invoiceBalance(total: number, advance: number): number {
  return roundMoney(Math.max(0, total - advance));
}

export function validateAdvanceAmount(advance: number, total: number): void {
  if (!Number.isFinite(advance) || advance < 0) {
    throw new Error("Advance must be zero or greater");
  }
  if (advance > total) {
    throw new Error("Advance cannot exceed invoice total");
  }
}
