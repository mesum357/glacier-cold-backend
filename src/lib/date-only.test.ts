import { describe, expect, it } from "vitest";
import { formatDateOnly } from "./date-only.js";

describe("formatDateOnly", () => {
  it("returns date strings unchanged", () => {
    expect(formatDateOnly("2026-06-09")).toBe("2026-06-09");
  });

  it("uses local calendar parts for Date values", () => {
    const value = new Date(2026, 5, 9);
    expect(formatDateOnly(value)).toBe("2026-06-09");
  });
});
