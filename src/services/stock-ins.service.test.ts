import { describe, expect, it } from "vitest";
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
});
