import { USER_ROLES } from "@/constants";
import { ROUTES } from "@/locales";

export function getDashboardRouteForRole(role) {
  if (role === USER_ROLES.ADMIN) return ROUTES.ADMIN.DASHBOARD;
  if (role === USER_ROLES.SELLER) return ROUTES.SELLER.DASHBOARD;
  return ROUTES.HOME;
}

// Only same-site paths: "/account" ok; "//evil.com", "/\\evil.com", "https://…", "javascript:…" or control characters → null (open-redirect guard).
const hasUnsafeChar = (s) => [...s].some((ch) => ch === "\\" || ch.charCodeAt(0) < 32);
export const safeNextPath = (next) => (typeof next === "string" && /^\/(?!\/)/.test(next) && !hasUnsafeChar(next) ? next : null);
