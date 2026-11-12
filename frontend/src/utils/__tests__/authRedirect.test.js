import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/constants";
import { ROUTES } from "@/locales";

import { getDashboardRouteForRole, safeNextPath } from "../authRedirect";

describe("getDashboardRouteForRole", () => {
  it("routes each role to its home", () => {
    expect(getDashboardRouteForRole(USER_ROLES.ADMIN)).toBe(ROUTES.ADMIN.DASHBOARD);
    expect(getDashboardRouteForRole(USER_ROLES.SELLER)).toBe(ROUTES.SELLER.DASHBOARD);
    expect(getDashboardRouteForRole(USER_ROLES.BUYER)).toBe(ROUTES.HOME);
    expect(getDashboardRouteForRole(undefined)).toBe(ROUTES.HOME);
  });
});

describe("safeNextPath", () => {
  it("accepts same-site relative paths", () => {
    expect(safeNextPath("/orders")).toBe("/orders");
    expect(safeNextPath("/products/abc?q=1#reviews")).toBe("/products/abc?q=1#reviews");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["absolute https", "https://evil.com"],
    ["javascript: URL", "javascript:alert(1)"],
    ["data: URL", "data:text/html,hi"],
    ["relative without slash", "evil.com"],
    ["empty string", ""],
  ])("rejects %s", (_label, input) => {
    expect(safeNextPath(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    expect(safeNextPath({ pathname: "/x" })).toBeNull();
  });

  // Browsers normalise a backslash to "/" and strip tab/newline in URLs, so these would resolve to //evil.com
  // (new URL("/\\evil.com", "https://kartiva.in").host === "evil.com").
  it.each([
    ["backslash", "/\\evil.com"],
    ["tab", "/\t/evil.com"],
    ["newline", "/\n/evil.com"],
  ])("rejects %s variants of //", (_label, input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});
