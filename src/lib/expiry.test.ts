import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPIRY_ALERT_DAYS,
  daysUntilExpiry,
  isExpiringSoon,
  effectiveAlertDays,
} from "./expiry.js";

describe("expiry helpers", () => {
  it("daysUntilExpiry returns positive days before expiry", () => {
    const today = new Date("2026-06-21T12:00:00.000Z");
    expect(daysUntilExpiry("2026-07-21", today)).toBe(30);
  });

  it("isExpiringSoon uses per-product alert days", () => {
    const today = new Date("2026-06-21T12:00:00.000Z");
    expect(isExpiringSoon("2026-07-10", 30, today)).toBe(true);
    expect(isExpiringSoon("2026-08-21", 30, today)).toBe(false);
  });

  it("effectiveAlertDays falls back to default", () => {
    expect(effectiveAlertDays(null)).toBe(DEFAULT_EXPIRY_ALERT_DAYS);
    expect(effectiveAlertDays(60)).toBe(60);
  });

  it("isExpiringSoon returns false for past expiry", () => {
    const today = new Date("2026-06-21T12:00:00.000Z");
    expect(isExpiringSoon("2026-06-01", 45, today)).toBe(false);
  });
});
