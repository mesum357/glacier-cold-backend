import { describe, expect, it } from "vitest";
import { batchItemsMatch } from "./stock-in-batch-utils.js";
import { validateStockInBatchInput } from "./stock-ins.service.js";

describe("validateStockInBatchInput", () => {
  const base = {
    supplierId: "00000000-0000-4000-8000-000000000001",
    items: [
      {
        productName: "Milk",
        productCategory: "Dairy",
        quantity: 10,
        buyingPrice: 50,
        cartonQuantity: 2,
        cartonPrice: 500,
        productionDate: "2026-06-01",
        expiryDate: "2026-07-01",
      },
    ],
  };

  it("accepts valid batch", () => {
    expect(() => validateStockInBatchInput(base)).not.toThrow();
  });

  it("rejects empty items", () => {
    expect(() => validateStockInBatchInput({ ...base, items: [] })).toThrow(/at least one/i);
  });

  it("rejects expiry before production", () => {
    expect(() =>
      validateStockInBatchInput({
        ...base,
        items: [{ ...base.items[0], productionDate: "2026-07-01", expiryDate: "2026-06-01" }],
      }),
    ).toThrow(/expiry/i);
  });

  it("rejects non-positive carton quantity when provided", () => {
    expect(() =>
      validateStockInBatchInput({
        ...base,
        items: [{ ...base.items[0], cartonQuantity: 0 }],
      }),
    ).toThrow(/carton/i);
  });

  it("accepts batch without carton fields", () => {
    const { cartonQuantity: _cq, cartonPrice: _cp, ...item } = base.items[0];
    expect(() =>
      validateStockInBatchInput({
        ...base,
        items: [item],
      }),
    ).not.toThrow();
  });
});

describe("batchItemsMatch", () => {
  it("matches identical line sets regardless of order", () => {
    const existing = [
      {
        id: "1",
        invoiceNo: 2,
        productId: "p1",
        productName: "Milk",
        productCategory: "Dairy",
        quantity: 10,
        buyingPrice: 50,
        supplierId: "s1",
        supplierName: "S",
        productionDate: null,
        expiryDate: null,
        cartonQuantity: 1,
        cartonPrice: 50,
        paymentStatus: "pending" as const,
        advanceAmount: 0,
        lineOrder: 0,
        receivedAt: "2026-06-22T11:00:00.000Z",
        createdAt: "2026-06-22T11:00:00.000Z",
      },
    ];
    const items = [
      {
        productName: "Milk",
        productCategory: "Dairy",
        quantity: 10,
        buyingPrice: 50,
        cartonQuantity: 1,
        cartonPrice: 50,
        productionDate: "2026-06-01",
        expiryDate: "2026-07-01",
      },
    ];
    expect(batchItemsMatch(existing, items)).toBe(true);
  });
});
