export type ProductStatus = "In Stock" | "Shortage" | "Out of Stock";

export function computeProductStatus(
  quantity: number,
  thresholdLimit: number | null,
): ProductStatus {
  if (quantity === 0) return "Out of Stock";
  if (thresholdLimit !== null && quantity <= thresholdLimit) return "Shortage";
  return "In Stock";
}
