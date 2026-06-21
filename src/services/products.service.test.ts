import { describe, expect, it } from "vitest";
import { mapProductRow } from "./products.service.js";

describe("mapProductRow", () => {
  it("maps expiry fields from DB row", () => {
    const product = mapProductRow({
      id: "p1",
      name: "Milk",
      category: "Dairy",
      barcode: "123",
      buying_price: 100,
      selling_price: 120,
      quantity: 5,
      threshold_limit: 2,
      production_date: "2026-01-01",
      expiry_date: "2026-07-01",
      expiry_alert_days: 30,
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-02"),
    });
    expect(product.productionDate).toBe("2026-01-01");
    expect(product.expiryDate).toBe("2026-07-01");
    expect(product.expiryAlertDays).toBe(30);
  });
});
