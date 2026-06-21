export function validateSaleQuantity(
  productName: string,
  available: number,
  requested: number,
): void {
  if (requested <= 0 || !Number.isInteger(requested)) {
    throw new Error(`Invalid quantity for ${productName}`);
  }
  if (available === 0) {
    throw new Error(`${productName} is out of stock and cannot be sold`);
  }
  if (requested > available) {
    throw new Error(`Insufficient stock for ${productName}. Only ${available} available`);
  }
}

export function aggregateSaleItems<T extends { productId: string; quantity: number }>(
  items: T[],
): T[] {
  const byProduct = new Map<string, T>();
  for (const item of items) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      byProduct.set(item.productId, {
        ...existing,
        quantity: existing.quantity + item.quantity,
      });
    } else {
      byProduct.set(item.productId, { ...item });
    }
  }
  return [...byProduct.values()];
}
