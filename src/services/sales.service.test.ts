import { describe, expect, it } from "vitest";
import { aggregateSaleItems, validateSaleQuantity } from "./sales.validation.js";

describe("validateSaleQuantity", () => {
  it("rejects out of stock", () => {
    expect(() => validateSaleQuantity("Milk", 0, 2)).toThrow(/out of stock/i);
  });

  it("rejects quantity greater than available", () => {
    expect(() => validateSaleQuantity("Milk", 5, 6)).toThrow(/insufficient stock/i);
  });

  it("allows valid quantity", () => {
    expect(validateSaleQuantity("Milk", 5, 5)).toBeUndefined();
  });

  it("rejects invalid quantity", () => {
    expect(() => validateSaleQuantity("Milk", 5, 0)).toThrow(/invalid quantity/i);
  });
});

describe("aggregateSaleItems", () => {
  it("sums quantities for duplicate product ids", () => {
    const result = aggregateSaleItems([
      { productId: "p1", quantity: 2 },
      { productId: "p1", quantity: 3 },
      { productId: "p2", quantity: 1 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.productId === "p1")?.quantity).toBe(5);
  });
});
