import { describe, expect, it } from "vitest";
import { computeStockInQuantityDeltas } from "./stock-in-quantity-deltas.js";

describe("computeStockInQuantityDeltas", () => {
  it("returns zero delta when invoice quantities are unchanged", () => {
    const oldEntries = [
      { productId: "p1", quantity: 100, productName: "Milk" },
    ];
    const newEntries = [
      { productId: "p1", quantity: 100, productName: "Milk" },
    ];

    expect(computeStockInQuantityDeltas(oldEntries, newEntries).size).toBe(0);
  });

  it("computes negative delta when quantity is reduced", () => {
    const deltas = computeStockInQuantityDeltas(
      [{ productId: "p1", quantity: 100, productName: "Milk" }],
      [{ productId: "p1", quantity: 80, productName: "Milk" }],
    );

    expect(deltas.get("p1")).toEqual({ delta: -20, productName: "Milk" });
  });

  it("computes positive delta for newly added products", () => {
    const deltas = computeStockInQuantityDeltas(
      [{ productId: "p1", quantity: 10, productName: "Milk" }],
      [
        { productId: "p1", quantity: 10, productName: "Milk" },
        { productId: "p2", quantity: 5, productName: "Cheese" },
      ],
    );

    expect(deltas.get("p2")).toEqual({ delta: 5, productName: "Cheese" });
  });

  it("computes removal delta when a product line is dropped", () => {
    const deltas = computeStockInQuantityDeltas(
      [
        { productId: "p1", quantity: 10, productName: "Milk" },
        { productId: "p2", quantity: 5, productName: "Cheese" },
      ],
      [{ productId: "p1", quantity: 10, productName: "Milk" }],
    );

    expect(deltas.get("p2")).toEqual({ delta: -5, productName: "Cheese" });
  });
});
