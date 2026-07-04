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
      { productId: "p1", quantity: 2, cartonQuantity: 1, cartonPrice: 100 },
      { productId: "p1", quantity: 3, cartonQuantity: 2, cartonPrice: 100 },
      { productId: "p2", quantity: 1, cartonQuantity: 1, cartonPrice: 50 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.productId === "p1")?.quantity).toBe(5);
    expect(result.find((i) => i.productId === "p1")?.cartonQuantity).toBe(3);
  });

  it("preserves entry order for distinct products", () => {
    const result = aggregateSaleItems([
      { productId: "p-z", quantity: 1, cartonQuantity: 1, cartonPrice: 100 },
      { productId: "p-a", quantity: 1, cartonQuantity: 1, cartonPrice: 50 },
    ]);
    expect(result.map((i) => i.productId)).toEqual(["p-z", "p-a"]);
  });

  it("keeps carton fields null when omitted", () => {
    const result = aggregateSaleItems([
      { productId: "p1", quantity: 2, cartonQuantity: null, cartonPrice: null },
      { productId: "p1", quantity: 1, cartonQuantity: null, cartonPrice: null },
    ]);
    expect(result[0].cartonQuantity).toBeNull();
    expect(result[0].cartonPrice).toBeNull();
  });

  it("uses weighted average unit price when merging duplicate products", () => {
    const result = aggregateSaleItems([
      { productId: "p1", quantity: 2, unitPrice: 100 },
      { productId: "p1", quantity: 3, unitPrice: 150 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
    expect(result[0].unitPrice).toBe(130);
  });
});
