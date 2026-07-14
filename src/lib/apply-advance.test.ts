import { describe, expect, it } from "vitest";
import { allocateAdvanceFifo, paymentStatusFromAdvance } from "./apply-advance.js";

describe("paymentStatusFromAdvance", () => {
  it("maps advance to pending / half_paid / paid", () => {
    expect(paymentStatusFromAdvance(1000, 0)).toBe("pending");
    expect(paymentStatusFromAdvance(1000, 250)).toBe("half_paid");
    expect(paymentStatusFromAdvance(1000, 1000)).toBe("paid");
    expect(paymentStatusFromAdvance(1000, 1200)).toBe("paid");
  });
});

describe("allocateAdvanceFifo", () => {
  const invoices = [
    {
      id: "a",
      invoiceNo: 1,
      total: 500,
      advanceAmount: 0,
      paymentStatus: "pending" as const,
    },
    {
      id: "b",
      invoiceNo: 2,
      total: 800,
      advanceAmount: 200,
      paymentStatus: "half_paid" as const,
    },
    {
      id: "c",
      invoiceNo: 3,
      total: 300,
      advanceAmount: 0,
      paymentStatus: "pending" as const,
    },
  ];

  it("fills the earliest invoice first then cascades", () => {
    const result = allocateAdvanceFifo(invoices, 700);

    expect(result.allocations).toEqual([
      expect.objectContaining({
        id: "a",
        applied: 500,
        newAdvance: 500,
        newStatus: "paid",
        newBalance: 0,
      }),
      expect.objectContaining({
        id: "b",
        applied: 200,
        newAdvance: 400,
        newStatus: "half_paid",
        newBalance: 400,
      }),
    ]);
    expect(result.appliedTotal).toBe(700);
    expect(result.remainder).toBe(0);
  });

  it("marks multiple invoices paid when advance covers them all", () => {
    const result = allocateAdvanceFifo(invoices, 500 + 600 + 300);

    expect(result.allocations.map((a) => a.newStatus)).toEqual(["paid", "paid", "paid"]);
    expect(result.remainder).toBe(0);
  });

  it("returns leftover when advance exceeds all unpaid balances", () => {
    const result = allocateAdvanceFifo(invoices, 5000);
    expect(result.appliedTotal).toBe(500 + 600 + 300);
    expect(result.remainder).toBe(5000 - 1400);
  });

  it("skips fully settled invoices", () => {
    const result = allocateAdvanceFifo(
      [
        {
          id: "paid",
          invoiceNo: 1,
          total: 100,
          advanceAmount: 100,
          paymentStatus: "paid",
        },
        {
          id: "open",
          invoiceNo: 2,
          total: 50,
          advanceAmount: 0,
          paymentStatus: "pending",
        },
      ],
      50,
    );

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].id).toBe("open");
    expect(result.allocations[0].newStatus).toBe("paid");
  });
});
