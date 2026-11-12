// In-browser "database" for VITE_DATA_MODE=mock. Seeds from src/data, persists every change to
// localStorage, and mutates the exported catalogue arrays IN PLACE so every module that imported
// CATEGORIES / PRODUCTS / STORES / ADS sees admin & seller edits immediately (e.g. a new category
// appears in the storefront menu). Replaced by Django in Phase 3+ — pages only talk to src/api/*.
import { ADS, AD_SLOTS, buildMarketSeed, buildSeed, CATEGORIES, DEMO_USERS, PLATFORM, PRODUCTS, SELLER_APPLICATIONS, STORES } from "@/data";
import { readJSON, writeJSON } from "@/utils/storage";

const KEY = "kartiva.mockDb.v11";
const LIVE = { adSlots: AD_SLOTS, ads: ADS, applications: SELLER_APPLICATIONS, categories: CATEGORIES, products: PRODUCTS, stores: STORES };

let state = null;

const replaceInPlace = (target, items) => { target.splice(0, target.length, ...items); };

function normalize() {
  CATEGORIES.forEach((c, i) => { c.isActive ??= true; c.sortOrder ??= i; });
  state.outbox ??= [];
  state.smsOutbox ??= []; // SMS / WhatsApp messages (sent by the SMS gateway once the backend is live)
  state.security ??= { attempts: {}, resetTokens: [] }; // login lockout + password-reset tokens (hashed)
  state.seen ??= {};
  // Wording update for data saved before "buy request" became "quote request" on the customer side.
  if (state.announcement?.text?.includes("post a buy request")) state.announcement.text = "New: request quotes for bulk or custom needs — verified suppliers reply within hours.";
  const how = state.cmsPages?.find((pg) => pg.slug === "buy-requests");
  if (how?.title === "How buy requests work") how.title = "How quote requests work"; // per-user "last seen" timestamps (new-order badges)
  state.sellerHub ??= {}; // private per-store seller data (CRM notes, bulk-upload history) keyed by storeSlug
  state.users ??= [];
  // Add any demo account that isn't in this browser's data yet (keeps existing demo data when logins are added).
  DEMO_USERS.filter((u) => !state.users.some((x) => x.email === u.email)).forEach((u) => state.users.push({ ...u, createdAt: "2026-01-15T10:00:00Z", isActive: true }));
  Object.entries(buildMarketSeed()).forEach(([k, v]) => { state[k] ??= v; });
  // Every demo seller is listed as their store's owner in Seller Hub → Team.
  DEMO_USERS.filter((u) => u.role === "seller").forEach((u) => {
    if (!state.sellerStaff.some((m) => m.storeSlug === u.storeSlug && m.role === "owner")) {
      state.sellerStaff.push({ email: u.email, id: state.sellerStaff.reduce((m, x) => Math.max(m, x.id), 0) + 1, lastActiveAt: null, name: `${u.firstName} ${u.lastName}`, role: "owner", status: "active", storeSlug: u.storeSlug });
    }
  });
  PRODUCTS.forEach((p) => { p.status ??= "active"; p.deletedAt ??= null; });
  STORES.forEach((s) => { s.status ??= "approved"; });
  AD_SLOTS.forEach((s) => { s.isActive ??= true; });
}

function load() {
  if (state) return state;
  const saved = readJSON(KEY, null);
  if (saved) {
    Object.entries(LIVE).forEach(([k, arr]) => saved[k] && replaceInPlace(arr, saved[k]));
    if (saved.platform) Object.assign(PLATFORM, saved.platform);
    state = saved.rest;
  } else {
    state = { ...buildSeed(), adRequests: [], hiddenReviews: [], stockMovements: [] };
  }
  normalize();
  return state;
}

export function getDb() {
  const s = load();
  return { ...LIVE, ...s, platform: PLATFORM };
}

export function commit() {
  load();
  writeJSON(KEY, { ...Object.fromEntries(Object.entries(LIVE).map(([k, v]) => [k, v])), platform: PLATFORM, rest: state });
}

export const nextId = (list) => list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;

export function audit(action, target, details, actor = "Kavya Iyer") {
  const db = getDb();
  db.auditLog.unshift({ action, actor, at: new Date().toISOString(), details, id: nextId(db.auditLog), target });
}

export function resetDemoData() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.location.reload();
}

// Errors shaped like the backend's { detail } responses so getErrorMessage() works the same.
export const apiError = (detail, status = 400) => Object.assign(new Error(detail), { response: { data: { detail }, status } });

export const nowIso = () => new Date().toISOString();

// Eagerly load at import so live arrays are hydrated before the first render.
load();
