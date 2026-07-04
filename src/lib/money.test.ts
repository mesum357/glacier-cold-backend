import { describe, expect, it } from "vitest";
import { roundMoney, saleLineTotal } from "./money.js";

describe("money helpers", () => {
  it("rounds to two decimal places", () => {
    expect(roundMoney(10.005)).toBe(10.01);
  });

  it("calculates sale line totals", () => {
    expect(saleLineTotal(3, 33.33)).toBe(99.99);
  });
});
