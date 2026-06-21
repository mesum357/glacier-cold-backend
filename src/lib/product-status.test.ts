import { describe, expect, it } from "vitest";
import { computeProductStatus } from "./product-status.js";

describe("computeProductStatus", () => {
  it("returns Out of Stock when quantity is 0", () => {
    expect(computeProductStatus(0, 5)).toBe("Out of Stock");
  });

  it("returns Shortage when quantity is at or below threshold", () => {
    expect(computeProductStatus(5, 5)).toBe("Shortage");
    expect(computeProductStatus(3, 5)).toBe("Shortage");
  });

  it("returns In Stock when above threshold", () => {
    expect(computeProductStatus(6, 5)).toBe("In Stock");
  });

  it("returns In Stock when threshold is null", () => {
    expect(computeProductStatus(1, null)).toBe("In Stock");
  });
});
