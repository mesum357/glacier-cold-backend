import type { StockIn, StockInLineInput } from "./stock-ins.service.js";

function lineSignature(
  productName: string,
  productCategory: string,
  quantity: number,
  buyingPrice: number,
): string {
  return `${productName.trim().toLowerCase()}|${productCategory.trim().toLowerCase()}|${quantity}|${buyingPrice}`;
}

export function batchItemsMatch(existing: StockIn[], items: StockInLineInput[]): boolean {
  if (existing.length !== items.length) return false;

  const existingSigs = existing
    .map((e) => lineSignature(e.productName, e.productCategory, e.quantity, e.buyingPrice))
    .sort();
  const inputSigs = items
    .map((i) => lineSignature(i.productName, i.productCategory, i.quantity, i.buyingPrice))
    .sort();

  return existingSigs.every((sig, index) => sig === inputSigs[index]);
}

export function batchSignature(batch: StockIn[]): string {
  const first = batch[0];
  const lines = batch
    .map((e) => lineSignature(e.productName, e.productCategory, e.quantity, e.buyingPrice))
    .sort()
    .join(";");
  return `${first.supplierId}|${first.receivedAt}|${lines}`;
}
