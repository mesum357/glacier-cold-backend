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

function mergeCartonQuantity(
  existing: number | null | undefined,
  added: number | null | undefined,
): number | null {
  const left = existing ?? null;
  const right = added ?? null;
  if (left == null && right == null) return null;
  if (left == null) return right;
  if (right == null) return left;
  return left + right;
}

function mergeUnitPrice(
  existingQty: number,
  existingPrice: number | undefined,
  addedQty: number,
  addedPrice: number | undefined,
): number | undefined {
  if (existingPrice == null && addedPrice == null) return undefined;
  if (existingPrice == null) return addedPrice;
  if (addedPrice == null) return existingPrice;
  if (existingPrice === addedPrice) return existingPrice;

  const totalQty = existingQty + addedQty;
  if (totalQty <= 0) return existingPrice;
  return Math.round(((existingPrice * existingQty + addedPrice * addedQty) / totalQty) * 100) / 100;
}

export function aggregateSaleItems<
  T extends {
    productId: string;
    quantity: number;
    cartonQuantity?: number | null;
    cartonPrice?: number | null;
    unitPrice?: number;
  },
>(items: T[]): T[] {
  const byProduct = new Map<string, T>();
  for (const item of items) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      byProduct.set(item.productId, {
        ...existing,
        quantity: existing.quantity + item.quantity,
        unitPrice: mergeUnitPrice(
          existing.quantity,
          existing.unitPrice,
          item.quantity,
          item.unitPrice,
        ),
        cartonQuantity: mergeCartonQuantity(existing.cartonQuantity, item.cartonQuantity),
        cartonPrice: existing.cartonPrice ?? item.cartonPrice ?? null,
      });
    } else {
      byProduct.set(item.productId, {
        ...item,
        cartonQuantity: item.cartonQuantity ?? null,
        cartonPrice: item.cartonPrice ?? null,
      });
    }
  }
  return [...byProduct.values()];
}
