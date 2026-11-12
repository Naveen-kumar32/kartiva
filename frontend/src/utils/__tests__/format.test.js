import { describe, expect, it } from "vitest";

import { formatCompactInr, formatCurrency, formatDate, formatPercent, formatRelative } from "../format";

describe("formatCurrency", () => {
  it("uses Indian digit grouping and no decimals by default", () => {
    expect(formatCurrency(1234567)).toBe("₹12,34,567");
    expect(formatCurrency(1234567.6)).toBe("₹12,34,568");
  });

  it("shows two decimals when asked", () => {
    expect(formatCurrency(1234567, { decimals: true })).toBe("₹12,34,567.00");
  });

  it("treats non-numeric input as zero", () => {
    expect(formatCurrency(null)).toBe("₹0");
    expect(formatCurrency("abc")).toBe("₹0");
    expect(formatCurrency("250")).toBe("₹250");
  });
});

describe("formatCompactInr", () => {
  it("uses Cr, L and K suffixes", () => {
    expect(formatCompactInr(18_600_000)).toBe("₹1.86 Cr");
    expect(formatCompactInr(10_000_000)).toBe("₹1.00 Cr");
    expect(formatCompactInr(2_950_000)).toBe("₹29.5 L");
    expect(formatCompactInr(100_000)).toBe("₹1.0 L");
    expect(formatCompactInr(1500)).toBe("₹1.5K");
  });

  it("falls back to full currency below a thousand", () => {
    expect(formatCompactInr(999)).toBe("₹999");
    expect(formatCompactInr(undefined)).toBe("₹0");
  });
});

describe("formatPercent", () => {
  it("formats with the requested digits", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
    expect(formatPercent(5, 0)).toBe("5%");
    expect(formatPercent(null)).toBe("0.0%");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  const MIN = 60_000;

  it("says 'just now' under a minute (and for future timestamps)", () => {
    expect(formatRelative(ago(20_000), now)).toBe("just now");
    expect(formatRelative(ago(-5 * MIN), now)).toBe("just now");
  });

  it("uses minutes, hours and days", () => {
    expect(formatRelative(ago(12 * MIN), now)).toBe("12 min ago");
    expect(formatRelative(ago(3 * 60 * MIN), now)).toBe("3 h ago");
    expect(formatRelative(ago(24 * 60 * MIN), now)).toBe("1 day ago");
    expect(formatRelative(ago(2 * 24 * 60 * MIN), now)).toBe("2 days ago");
  });

  it("falls back to an absolute date after ~30 days", () => {
    const iso = "2026-09-01T06:00:00Z";
    expect(formatRelative(iso, now)).toBe(formatDate(iso));
    expect(formatDate(iso)).toMatch(/^1 Sep\w* 2026$/);
  });
});
