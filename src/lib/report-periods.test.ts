import { describe, expect, it } from "vitest";
import { purchaseDateRangeSql, saleDateRangeSql } from "./report-periods.js";

describe("report-periods", () => {
  it("uses explicit week range for this_week", () => {
    expect(saleDateRangeSql("this_week", "2025-06-18")).toContain(
      "date_trunc('week', $2::date)",
    );
    expect(saleDateRangeSql("this_week", "2025-06-18")).toContain("INTERVAL '7 days'");
  });

  it("uses previous calendar month for last_month", () => {
    expect(saleDateRangeSql("last_month", "2025-06-18")).toContain(
      "date_trunc('month', $2::date) - INTERVAL '1 month'",
    );
    expect(saleDateRangeSql("last_month", "2025-06-18")).not.toContain(
      "$2::date - INTERVAL '1 month'",
    );
  });

  it("uses previous calendar week for last_week", () => {
    expect(purchaseDateRangeSql("last_week", "2025-06-18")).toContain(
      "date_trunc('week', $2::date) - INTERVAL '7 days'",
    );
  });
});
