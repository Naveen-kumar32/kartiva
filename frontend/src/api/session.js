// Who is signed in, as the SERVER sees it. In api mode the backend reads this from the JWT; the mock API
// reads the persisted session so every mock call enforces the same rules: never trust a user id, email or
// store slug sent by the page — check it against the session (IDOR / tenant isolation, docs/SECURITY_GUIDELINES §3).
import { readJSON, STORAGE_KEYS } from "@/utils/storage";

import { apiError, getDb } from "./mockDb";

export function sessionUser() {
  const user = readJSON(STORAGE_KEYS.AUTH_USER, null);
  if (!user?.email) return null;
  // Role and store always come from the account record, not from what the browser cached.
  const record = getDb().users.find((u) => u.email === user.email);
  return record ? { ...user, role: record.role, storeSlug: record.storeSlug } : user;
}

export function requireSession(...roles) {
  const user = sessionUser();
  if (!user) throw apiError("Please sign in to continue.", 401);
  if (roles.length && !roles.includes(user.role)) throw apiError("You don't have access to this.", 403);
  return user;
}

// Sellers may only touch their own store (admins may act on any). 404 — never reveal other stores' data.
export function assertStoreAccess(storeSlug) {
  const user = sessionUser();
  if (user?.role === "admin") return;
  if (user?.role !== "seller" || user.storeSlug !== storeSlug) throw apiError("Store not found.", 404);
}
