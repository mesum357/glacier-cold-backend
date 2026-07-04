export type QuantityByProduct = Map<string, { quantity: number; productName: string }>;

export function aggregateStockInQuantities(
  entries: Array<{ productId: string; quantity: number; productName: string }>,
): QuantityByProduct {
  const map: QuantityByProduct = new Map();

  for (const entry of entries) {
    const current = map.get(entry.productId);
    map.set(entry.productId, {
      quantity: (current?.quantity ?? 0) + entry.quantity,
      productName: entry.productName,
    });
  }

  return map;
}

export function computeStockInQuantityDeltas(
  oldEntries: Array<{ productId: string; quantity: number; productName: string }>,
  newEntries: Array<{ productId: string; quantity: number; productName: string }>,
): Map<string, { delta: number; productName: string }> {
  const oldByProduct = aggregateStockInQuantities(oldEntries);
  const newByProduct = aggregateStockInQuantities(newEntries);
  const deltas = new Map<string, { delta: number; productName: string }>();

  for (const [productId, old] of oldByProduct) {
    const next = newByProduct.get(productId);
    const delta = (next?.quantity ?? 0) - old.quantity;
    if (delta !== 0) {
      deltas.set(productId, { delta, productName: next?.productName ?? old.productName });
    }
  }

  for (const [productId, next] of newByProduct) {
    if (oldByProduct.has(productId)) continue;
    deltas.set(productId, { delta: next.quantity, productName: next.productName });
  }

  return deltas;
}
