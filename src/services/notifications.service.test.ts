import { describe, expect, it } from "vitest";
import { mapAlertRow } from "./notifications.service.js";

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
    expect(alert.status).toBe("Out of Stock");
    expect(alert.message).toContain("out of stock");
  });
});
