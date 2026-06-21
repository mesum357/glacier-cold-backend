import { describe, expect, it } from "vitest";
import { mapAlertRow, mapExpiryAlertRow } from "./notifications.service.js";

describe("mapAlertRow", () => {
  it("maps a shortage row", () => {
    const alert = mapAlertRow({
      id: "p1",
      name: "Milk",
      quantity: 3,
      threshold_limit: 5,
      category: "Dairy",
      updated_at: new Date("2026-06-21T10:00:00.000Z"),
    });
    expect(alert.type).toBe("stock");
    expect(alert.status).toBe("Shortage");
    expect(alert.message).toContain("Milk");
  });

  it("maps an out of stock row", () => {
    const alert = mapAlertRow({
      id: "p2",
      name: "Bread",
      quantity: 0,
      threshold_limit: 5,
      category: "Bakery",
      updated_at: new Date("2026-06-21T10:00:00.000Z"),
    });
    expect(alert.type).toBe("stock");
    expect(alert.status).toBe("Out of Stock");
    expect(alert.message).toContain("out of stock");
  });
});

describe("mapExpiryAlertRow", () => {
  it("builds expiry alert", () => {
    const alert = mapExpiryAlertRow(
      {
        id: "prod-1",
        name: "Yogurt",
        category: "Dairy",
        quantity: 12,
        expiry_date: "2026-07-15",
        expiry_alert_days: 30,
        updated_at: new Date("2026-06-21"),
      },
      new Date("2026-06-21T12:00:00.000Z"),
    );
    expect(alert.type).toBe("expiry");
    expect(alert.productName).toBe("Yogurt");
    expect(alert.daysLeft).toBe(24);
  });
});
