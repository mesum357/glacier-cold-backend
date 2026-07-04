import { describe, expect, it } from "vitest";
import { aggregatePaymentStatus, isPaymentStatus, parsePaymentStatus } from "./payment-status.js";

describe("payment-status", () => {
  it("validates known statuses", () => {
    expect(isPaymentStatus("pending")).toBe(true);
    expect(isPaymentStatus("paid")).toBe(true);
    expect(isPaymentStatus("half_paid")).toBe(true);
    expect(isPaymentStatus("unpaid")).toBe(false);
  });

  it("parses valid status", () => {
    expect(parsePaymentStatus("half_paid")).toBe("half_paid");
  });

  it("aggregates uniform statuses", () => {
    expect(aggregatePaymentStatus(["paid", "paid"])).toBe("paid");
  });

  it("prefers pending when mixed", () => {
    expect(aggregatePaymentStatus(["paid", "pending"])).toBe("pending");
  });

  it("uses half_paid when no pending in mix", () => {
    expect(aggregatePaymentStatus(["paid", "half_paid"])).toBe("half_paid");
  });
});
