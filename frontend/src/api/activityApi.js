// "What's new" for sellers and admins: last-seen timestamps per page (so new orders get a NEW badge until
// opened) and sidebar counts. In api mode the backend stores last-seen per user.
import { IS_MOCK } from "@/config";

import { commit, getDb, nowIso } from "./mockDb";

export const SEEN_EVENT = "kartiva:seen";
const DEFAULT_LOOKBACK_MS = 24 * 3_600_000; // first visit: anything from the last 24 h counts as new
const keyOf = (user, area) => `${user.role}:${user.storeSlug ?? user.email}:${area}`;
const fallback = () => new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();

// seen[key] = { at, prev } — `prev` lets a repeat call within a few seconds (React StrictMode mounts pages
// twice in development, quick re-renders) return the same "previous visit" instead of "just now".
const REPEAT_MS = 10_000;
const entry = (key) => { const v = getDb().seen[key]; return typeof v === "string" ? { at: v, prev: v } : v ?? null; };

export function getLastSeen(user, area) {
  if (!IS_MOCK || !user) return fallback();
  return entry(keyOf(user, area))?.at ?? fallback();
}

// Returns the PREVIOUS last-seen time (to badge rows newer than it) and records "now".
export async function markSeen(user, area) {
  if (!IS_MOCK || !user) return fallback();
  const key = keyOf(user, area);
  const current = entry(key);
  if (current && Date.now() - new Date(current.at).getTime() < REPEAT_MS) return current.prev;
  const previous = current?.at ?? fallback();
  getDb().seen[key] = { at: nowIso(), prev: previous };
  commit();
  window.dispatchEvent(new Event(SEEN_EVENT)); // sidebars refresh their count bubbles
  return previous;
}

// Sidebar badge counts, keyed by nav path.
export async function getNavCounts(user) {
  if (!IS_MOCK || !user) return {};
  const db = getDb();
  const after = (iso, area) => iso > getLastSeen(user, area);
  if (user.role === "seller") {
    const slug = user.storeSlug;
    const subs = db.orders.flatMap((o) => o.subOrders.filter((s) => s.storeSlug === slug).map((s) => ({ ...s, createdAt: o.createdAt })));
    return {
      "/seller/buy-requests": db.rfqs.filter((r) => r.status === "open" && r.dispatches?.some((d) => d.storeSlug === slug && !d.viewedAt)).length,
      "/seller/leads": db.enquiries.filter((e) => e.storeSlug === slug && e.status === "new").length,
      "/seller/messages": db.threads.filter((t) => t.storeSlug === slug).reduce((n, t) => n + (t.unread?.seller ?? 0), 0),
      "/seller/orders": subs.filter((s) => s.status === "confirmed" && after(s.createdAt, "orders")).length,
      "/seller/returns": db.returns.filter((r) => r.storeSlug === slug && r.status === "requested").length,
    };
  }
  if (user.role === "admin") {
    return {
      "/admin/orders": db.orders.filter((o) => after(o.createdAt, "orders")).length,
      "/admin/product-requests": db.rfqs.filter((r) => r.status === "open" && !(r.dispatches?.length) && !r.quotes.length).length,
      "/admin/returns": db.returns.filter((r) => r.escalated).length,
      "/admin/sellers": db.applications.filter((a) => a.status === "pending").length,
      "/admin/support": db.tickets.filter((t) => ["open", "in_progress"].includes(t.status)).length,
      "/admin/verification": db.kycDocuments.filter((d) => d.status === "pending").length,
    };
  }
  return {};
}
