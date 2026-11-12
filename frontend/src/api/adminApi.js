// Admin API. Every write is audit-logged (docs/SECURITY_GUIDELINES.md T14).
import { API, axiosInstance, IS_MOCK } from "@/config";
import { buildReviews } from "@/data";
import { summarizeProduct } from "@/utils/catalog";
import { mockDelay } from "@/utils/mock";
import { DAY_MS } from "@/utils/orderMath";

import { notify } from "./marketOps";
import { apiError, audit, commit, getDb, nextId, nowIso, resetDemoData } from "./mockDb";
import { findSubOrder, generateSettlementInDb, ledgerFor, markRefundPaidInDb, markSettlementPaidInDb, transitionSubOrder, updateReturnInDb } from "./orderOps";

const run = async (fn, ms = 300) => mockDelay(await Promise.resolve().then(fn), ms);
const remote = async (method, url, body) => (await axiosInstance[method](url, body)).data;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const liveSubs = (orders) => orders.flatMap((o) => o.subOrders.filter((s) => s.status !== "cancelled").map((s) => ({ ...s, createdAt: o.createdAt, order: o })));

export { resetDemoData };

// ---------- Dashboard ----------
export async function getAdminDashboard() {
  if (!IS_MOCK) return remote("get", API.ADMIN_DASHBOARD);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const subs = liveSubs(db.orders);
    const last30 = subs.filter((s) => now - new Date(s.createdAt).getTime() < 30 * DAY_MS);
    const gmv = last30.reduce((t, s) => t + s.total, 0);
    const orders30 = new Set(last30.map((s) => s.order.number)).size;
    const adRevenue = db.ads.reduce((t, a) => t + (a.spend ?? 0), 0);
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = now - (7 - i) * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      const inWeek = subs.filter((s) => { const t = new Date(s.createdAt).getTime(); return t > start && t <= end; });
      const ads = db.ads.reduce((t, a) => {
        if (!a.spend) return t;
        const aStart = new Date(a.startsAt).getTime();
        const aEnd = Math.min(now, new Date(a.endsAt).getTime());
        const overlap = Math.max(0, Math.min(end, aEnd) - Math.max(start, aStart));
        return t + (aEnd > aStart ? (a.spend * overlap) / (aEnd - aStart) : 0);
      }, 0);
      return { ads: Math.round(ads), commission: Math.round(inWeek.reduce((t, s) => t + s.commissionAmount, 0)), label: new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) };
    });
    const methodCounts = db.orders.reduce((acc, o) => ({ ...acc, [o.paymentMethod]: (acc[o.paymentMethod] ?? 0) + 1 }), {});
    const storeGmv = db.stores.map((store) => {
      const own = subs.filter((s) => s.storeSlug === store.slug);
      return { commission: own.reduce((t, s) => t + s.commissionAmount, 0), gmv: own.reduce((t, s) => t + s.total, 0), orders: own.length, store };
    }).sort((a, b) => b.gmv - a.gmv);
    return {
      alerts: {
        codRefunds: db.refunds.filter((r) => r.status === "pending").length,
        escalatedReturns: db.returns.filter((r) => r.escalated).length,
        lowStockVariants: db.products.flatMap((p) => p.variants).filter((v) => v.stock === 0).length,
        pendingAds: db.ads.filter((a) => a.status === "pending_approval").length,
        pendingProducts: db.products.filter((p) => p.status === "pending_review" && !p.deletedAt).length,
        pendingSellers: db.applications.filter((a) => a.status === "pending").length,
        settlementsToPay: db.settlements.filter((s) => s.status === "approved").length,
      },
      kpis: {
        activeSellers: db.stores.filter((s) => s.status === "approved").length, adRevenue, aov: orders30 ? gmv / orders30 : 0,
        buyers: db.buyers.length, commissionRevenue: last30.reduce((t, s) => t + s.commissionAmount, 0), gmv, liveProducts: db.products.filter((p) => p.status === "active" && !p.deletedAt).length, orders: orders30,
      },
      paymentMix: [
        { label: "Online (UPI, cards, net banking, EMI)", share: Math.round(((methodCounts.online ?? 0) / db.orders.length) * 100) },
        { label: "Cash on Delivery", share: Math.round(((methodCounts.cod ?? 0) / db.orders.length) * 100) },
      ],
      recentAudit: db.auditLog.slice(0, 6), revenueByWeek: weeks, topStores: storeGmv.slice(0, 6),
    };
  });
}

// ---------- Categories ----------
export async function getAdminCategories() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/categories/")).results;
  return run(() => {
    const db = getDb();
    return db.categories.map((c) => ({ ...c, productCount: db.products.filter((p) => p.categorySlug === c.slug && !p.deletedAt).length }));
  }, 200);
}

export async function saveCategory(category) {
  if (!IS_MOCK) return remote(category.id ? "patch" : "post", `/admin-api/categories/${category.id ? `${category.id}/` : ""}`, category);
  return run(() => {
    const db = getDb();
    const name = category.name.trim();
    const parentId = category.parentId ? Number(category.parentId) : null;
    const parent = parentId ? db.categories.find((c) => c.id === parentId) : null;
    if (parent?.parentId) throw apiError("Categories can be 2 levels deep: category → sub-category.");
    if (db.categories.some((c) => c.id !== category.id && c.parentId === parentId && c.name.toLowerCase() === name.toLowerCase())) throw apiError("A category with this name already exists here.", 409);
    const fields = {
      defaultGstRate: category.defaultGstRate === "" || category.defaultGstRate == null ? null : Number(category.defaultGstRate),
      defaultHsn: category.defaultHsn?.trim() || null, description: category.description?.trim() ?? "", isActive: category.isActive !== false,
      name, parentId, shortName: parentId ? null : category.shortName?.trim() || null, showInNav: parentId ? false : Boolean(category.showInNav), returnWindowDays: category.returnWindowDays === "" || category.returnWindowDays == null ? null : Number(category.returnWindowDays),
    };
    if (category.id) {
      const existing = db.categories.find((c) => c.id === category.id);
      if (parentId === existing.id) throw apiError("A category can't be its own parent.");
      if (parentId && db.categories.some((c) => c.parentId === existing.id)) throw apiError("This category has sub-categories, so it must stay at the top level.");
      Object.assign(existing, fields);
      audit("category.updated", `Category ${existing.name}`, `Updated “${existing.name}”`);
    } else {
      let slug = slugify(name);
      if (db.categories.some((c) => c.slug === slug)) slug = `${slug}-${nextId(db.categories)}`;
      db.categories.push({ ...fields, id: nextId(db.categories), slug, sortOrder: db.categories.length });
      audit("category.created", `Category ${name}`, parent ? `Created sub-category “${name}” under ${parent.name}` : `Created top-level category “${name}”`);
    }
    commit();
    return db.categories;
  });
}

export async function setCategoryActive(id, isActive) {
  if (!IS_MOCK) return remote("patch", `/admin-api/categories/${id}/`, { is_active: isActive });
  return run(() => {
    const db = getDb();
    const cat = db.categories.find((c) => c.id === id);
    cat.isActive = isActive;
    db.categories.filter((c) => c.parentId === id).forEach((c) => { c.isActive = isActive; });
    audit(isActive ? "category.activated" : "category.hidden", `Category ${cat.name}`, `${cat.name} ${isActive ? "shown in" : "hidden from"} the storefront`);
    commit();
    return cat;
  }, 150);
}

export async function moveCategory(id, direction) {
  if (!IS_MOCK) return remote("post", `/admin-api/categories/${id}/move/`, { direction });
  return run(() => {
    const db = getDb();
    const cat = db.categories.find((c) => c.id === id);
    const siblings = db.categories.filter((c) => c.parentId === cat.parentId);
    const idx = siblings.indexOf(cat);
    const swap = siblings[idx + direction];
    if (!swap) return db.categories;
    const a = db.categories.indexOf(cat);
    const b = db.categories.indexOf(swap);
    [db.categories[a], db.categories[b]] = [db.categories[b], db.categories[a]];
    commit();
    return db.categories;
  }, 100);
}

export async function deleteCategory(id) {
  if (!IS_MOCK) return remote("delete", `/admin-api/categories/${id}/`);
  return run(() => {
    const db = getDb();
    const cat = db.categories.find((c) => c.id === id);
    if (db.categories.some((c) => c.parentId === id)) throw apiError("Delete or move its sub-categories first.", 409);
    if (db.products.some((p) => p.categorySlug === cat.slug && !p.deletedAt)) throw apiError("This category has products. Hide it instead, or move the products first.", 409);
    db.categories.splice(db.categories.indexOf(cat), 1);
    audit("category.deleted", `Category ${cat.name}`, `Deleted “${cat.name}”`);
    commit();
    return db.categories;
  });
}

// ---------- Products ----------
export async function getAdminProducts() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/products/")).results;
  return run(() => getDb().products.filter((p) => !p.deletedAt).map((p) => ({ ...p, summary: summarizeProduct(p) })));
}

export async function moderateProduct(id, action, reason) {
  if (!IS_MOCK) return remote("post", `/admin-api/products/${id}/${action}/`, { reason });
  return run(() => {
    const p = getDb().products.find((x) => x.id === id);
    if (!p) throw apiError("Product not found.", 404);
    if (action === "approve") { p.status = "active"; p.rejectionReason = null; p.publishedAt ??= nowIso(); }
    if (action === "reject") { if (!reason?.trim()) throw apiError("Give the seller a reason."); p.status = "rejected"; p.rejectionReason = reason; }
    if (action === "deactivate") p.status = "inactive";
    if (action === "activate") p.status = "active";
    if (action === "feature") p.isFeatured = !p.isFeatured;
    audit(`product.${action}`, `Product #${p.id}`, `${p.name}${reason ? ` — ${reason}` : ""}`);
    commit();
    return p;
  }, 200);
}

// ---------- Orders ----------
export async function getAdminOrders() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/orders/")).results;
  return run(() => getDb().orders);
}

export async function adminUpdateSubOrder(subOrderNumber, toStatus, details = {}) {
  if (!IS_MOCK) return remote("post", `/admin-api/orders/sub-orders/${subOrderNumber}/status/`, { to_status: toStatus, ...details });
  return run(() => {
    const result = transitionSubOrder(subOrderNumber, toStatus, { actor: "admin", ...details });
    audit(`order.${toStatus}`, `Sub-order ${subOrderNumber}`, details.note ?? `Marked ${toStatus} by admin`);
    commit();
    return result;
  });
}

// ---------- Sellers ----------
export async function getSellerApplications() {
  if (!IS_MOCK) return (await remote("get", API.ADMIN_SELLERS, { params: { status: "pending" } })).results;
  return run(() => getDb().applications);
}

const COLORS = ["#0891b2", "#9333ea", "#16a34a", "#dc2626", "#ca8a04", "#2563eb"];
export async function decideSellerApplication(id, action, reason, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_SELLER_DECISION(id, action), { reason });
  return run(() => {
    const db = getDb();
    const app = db.applications.find((a) => a.id === id);
    app.status = action === "approve" ? "approved" : "rejected";
    app.decisionReason = reason ?? null;
    app.decidedAt = nowIso();
    const ownStore = app.storeSlug && db.stores.find((s) => s.slug === app.storeSlug);
    if (ownStore) {
      // Self-registered seller: their store already exists (pending) — approving makes it live.
      ownStore.status = action === "approve" ? "approved" : "rejected";
      notify({ role: "seller", storeSlug: ownStore.slug }, action === "approve" ? "Your store is live!" : "Seller application not approved", action === "approve" ? `${ownStore.name} is now visible to buyers.` : reason || "Please contact support.", "/seller");
    } else if (action === "approve" && !db.stores.some((s) => s.slug === slugify(app.business))) {
      const color = COLORS[id % COLORS.length];
      const [city, state] = app.city.split(",").map((x) => x.trim());
      db.stores.push({
        banner: `linear-gradient(120deg,#0f172a,${color} 60%,${color}cc)`, city, color, gstStateCode: app.gstin.slice(0, 2), gstin: app.gstin,
        initials: app.business.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), isFeatured: false, name: app.business, rating: 0, ratingCount: 0,
        returnPolicy: "7-day returns on unused items.", shippingMethods: [{ codAllowed: true, fee: 49, freeAbove: 499, id: 900 + id, maxDays: 7, minDays: 3, name: "Standard Delivery", type: "standard" }],
        since: 2026, slug: slugify(app.business), state, status: "approved", tagline: `${app.category} from ${city}`,
      });
    }
    audit(`seller.${app.status}`, `Seller application #${id}`, `${app.business}${reason ? ` — ${reason}` : ""}`, actor);
    commit();
    return app;
  });
}

export async function getAdminStores() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/stores/")).results;
  return run(() => {
    const db = getDb();
    return db.stores.map((store) => {
      const subs = liveSubs(db.orders).filter((s) => s.storeSlug === store.slug);
      const rule = db.commissionRules.find((r) => r.scope === "store" && r.storeSlug === store.slug && r.isActive);
      return { ...store, balance: ledgerFor(store.slug).balance, commissionOverride: rule?.rate ?? null, gmv: subs.reduce((t, s) => t + s.total, 0), orders: subs.length, products: db.products.filter((p) => p.storeSlug === store.slug && !p.deletedAt).length };
    });
  });
}

export async function setStoreStatus(slug, status, reason, actor) {
  if (!IS_MOCK) return remote("post", `/admin-api/stores/${slug}/${status === "suspended" ? "suspend" : "reactivate"}/`, { reason });
  return run(() => {
    const store = getDb().stores.find((s) => s.slug === slug);
    store.status = status;
    store.suspensionReason = status === "suspended" ? reason : null;
    audit(status === "suspended" ? "seller.suspended" : "seller.reactivated", store.name, reason ?? "Reactivated", actor);
    commit();
    return store;
  });
}

export async function toggleStoreFeatured(slug) {
  return run(() => {
    const store = getDb().stores.find((s) => s.slug === slug);
    store.isFeatured = !store.isFeatured;
    audit("store.featured", store.name, store.isFeatured ? "Featured on homepage" : "Removed from homepage");
    commit();
    return store;
  }, 150);
}

// ---------- Buyers ----------
export async function getAdminBuyers() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/buyers/")).results;
  return run(() => {
    const db = getDb();
    return db.buyers.map((b) => {
      const orders = db.orders.filter((o) => o.buyer.email === b.email);
      const refusals = orders.flatMap((o) => o.subOrders).filter((s) => s.status === "undelivered").length;
      return { ...b, lastOrderAt: orders[0]?.createdAt ?? null, orders: orders.length, refusals, spent: orders.reduce((t, o) => t + o.grandTotal, 0) };
    });
  });
}

export async function updateBuyer(email, patch, actor) {
  if (!IS_MOCK) return remote("patch", `/admin-api/buyers/${encodeURIComponent(email)}/`, patch);
  return run(() => {
    const buyer = getDb().buyers.find((b) => b.email === email);
    if (!buyer) throw apiError("Buyer not found.", 404);
    // Only these fields can be changed here (no mass assignment of email, name, etc.).
    ["codBlocked", "isActive"].forEach((k) => { if (typeof patch[k] === "boolean") buyer[k] = patch[k]; });
    audit(patch.codBlocked !== undefined ? (patch.codBlocked ? "buyer.cod_blocked" : "buyer.cod_unblocked") : (patch.isActive ? "buyer.activated" : "buyer.deactivated"), buyer.name, buyer.email, actor);
    commit();
    return buyer;
  }, 150);
}

// ---------- Returns & refunds ----------
export async function getAdminReturns() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/returns/")).results;
  return run(() => getDb().returns);
}

export async function adminActOnReturn(id, action, details) {
  if (!IS_MOCK) return remote("post", `/admin-api/returns/${id}/${action}/`, details);
  return run(() => {
    const ret = updateReturnInDb(id, action, { actor: "admin", ...details });
    audit(`return.${action}`, `Return ${ret.number}`, details?.reason ?? `Admin ${action}`);
    commit();
    return ret;
  });
}

export async function getAdminRefunds() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/refunds/")).results;
  return run(() => getDb().refunds);
}

export async function markRefundPaid(id, utr) {
  if (!IS_MOCK) return remote("post", `/admin-api/refunds/${id}/mark-paid/`, { manual_reference: utr });
  return run(() => { const r = markRefundPaidInDb(id, utr); audit("refund.paid", `Refund #${id}`, `₹${r.amount} to ${r.payoutTo} · UTR ${utr}`); commit(); return r; });
}

// ---------- Commission ----------
export async function getCommissionRules() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/commission-rules/")).results;
  return run(() => getDb().commissionRules, 150);
}

export async function saveCommissionRule(rule) {
  if (!IS_MOCK) return remote(rule.id ? "patch" : "post", `/admin-api/commission-rules/${rule.id ? `${rule.id}/` : ""}`, rule);
  return run(() => {
    const db = getDb();
    const rate = Number(rule.rate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) throw apiError("Rate must be between 0 and 100.");
    const clean = { categorySlug: rule.scope === "category" ? rule.categorySlug : undefined, isActive: rule.isActive !== false, rate, scope: rule.scope, storeSlug: rule.scope === "store" ? rule.storeSlug : undefined };
    const dup = db.commissionRules.find((r) => r.id !== rule.id && r.isActive && r.scope === clean.scope && r.categorySlug === clean.categorySlug && r.storeSlug === clean.storeSlug);
    if (dup) throw apiError("An active rule already exists for this target — edit it instead.", 409);
    if (rule.id) Object.assign(db.commissionRules.find((r) => r.id === rule.id), clean);
    else db.commissionRules.push({ ...clean, id: nextId(db.commissionRules) });
    audit("commission.updated", `Commission ${clean.scope}`, `${clean.storeSlug ?? clean.categorySlug ?? "Global"} → ${rate}% (applies to new orders)`);
    commit();
    return db.commissionRules;
  });
}

export async function deleteCommissionRule(id) {
  return run(() => {
    const db = getDb();
    const rule = db.commissionRules.find((r) => r.id === id);
    if (rule.scope === "global") throw apiError("The global default can't be deleted.");
    db.commissionRules.splice(db.commissionRules.indexOf(rule), 1);
    audit("commission.deleted", `Commission rule #${id}`, `${rule.storeSlug ?? rule.categorySlug} override removed`);
    commit();
    return db.commissionRules;
  });
}

// ---------- Settlements ----------
export async function getAdminSettlements() {
  if (!IS_MOCK) return remote("get", "/admin-api/settlements/");
  return run(() => {
    const db = getDb();
    const stores = db.stores.map((store) => {
      const ledger = ledgerFor(store.slug);
      const open = ledger.entries.filter((e) => !e.settlementId && e.type !== "payout");
      return { openAmount: Math.round(open.reduce((t, e) => t + e.amount, 0) * 100) / 100, openEntries: open.length, pending: ledger.pending, store };
    });
    return { settlements: db.settlements, stores };
  });
}

export async function generateSettlement(storeSlug) {
  if (!IS_MOCK) return remote("post", "/admin-api/settlements/", { store: storeSlug });
  return run(() => { const s = generateSettlementInDb(storeSlug); audit("settlement.created", s.number, `${storeSlug} · net ₹${s.net}`); commit(); return s; });
}

export async function markSettlementPaid(id, utr) {
  if (!IS_MOCK) return remote("post", `/admin-api/settlements/${id}/mark-paid/`, { payment_reference: utr });
  return run(() => { const s = markSettlementPaidInDb(id, utr); audit("settlement.paid", s.number, `UTR ${utr}`); commit(); return s; });
}

export async function getStoreLedger(storeSlug) {
  return run(() => ledgerFor(storeSlug), 150);
}

// ---------- Ads ----------
export async function getAdManager() {
  if (!IS_MOCK) {
    const [slots, ads] = await Promise.all([remote("get", API.ADMIN_AD_SLOTS), remote("get", API.ADMIN_ADS)]);
    return { ads: ads.results, slots: slots.results };
  }
  return run(() => ({ ads: getDb().ads, slots: getDb().adSlots }));
}

export async function saveAd(ad) {
  if (!IS_MOCK) return remote(ad.id ? "patch" : "post", `${API.ADMIN_ADS}${ad.id ? `${ad.id}/` : ""}`, ad);
  return run(() => {
    const db = getDb();
    const slot = db.adSlots.find((s) => s.key === ad.slot);
    if (!slot) throw apiError("Choose an ad slot.");
    if (slot.format === "sponsored_products" && !ad.productId) throw apiError("Sponsored slots need a product.");
    if (slot.format !== "sponsored_products" && !ad.headline?.trim()) throw apiError("Banner and carousel ads need a headline.");
    if (ad.link && !/^\/(?![/\\])|^https:\/\//.test(ad.link)) throw apiError("Link must be an internal path (/...) or an https:// URL.");
    if (ad.endsAt < ad.startsAt) throw apiError("End date must be after the start date.");
    // Whitelisted fields only — stats (impressions, clicks, spend) and settlement links can't be set from the form.
    const FIELDS = ["advertiser", "advertiserType", "cta", "endsAt", "eyebrow", "headline", "id", "link", "pricing", "slot", "startsAt", "status", "storeSlug", "subtext", "theme"];
    const clean = { ...Object.fromEntries(FIELDS.filter((k) => ad[k] !== undefined).map((k) => [k, ad[k]])), productId: ad.productId ? Number(ad.productId) : undefined, rate: Number(ad.rate ?? 0), priority: Number(ad.priority ?? 0) };
    const today = nowIso().slice(0, 10);
    clean.status = ad.status === "paused" ? "paused" : clean.startsAt > today ? "scheduled" : "active";
    if (ad.id) Object.assign(db.ads.find((a) => a.id === ad.id), clean);
    else db.ads.push({ ...clean, clicks: 0, id: nextId(db.ads), impressions: 0, spend: clean.pricing === "fixed" ? clean.rate : 0 });
    audit(ad.id ? "ad.updated" : "ad.created", `Ad · ${slot.name}`, `${clean.advertiser}: ${clean.headline ?? `product #${clean.productId}`}`);
    commit();
    return db.ads;
  });
}

export async function setAdStatus(id, status) {
  if (!IS_MOCK) return remote("post", `${API.ADMIN_ADS}${id}/${status}/`);
  return run(() => {
    const ad = getDb().ads.find((a) => a.id === id);
    ad.status = status;
    audit(`ad.${status}`, `Ad #${id}`, ad.advertiser);
    commit();
    return ad;
  }, 150);
}

export async function setSlotActive(key, isActive) {
  return run(() => {
    const slot = getDb().adSlots.find((s) => s.key === key);
    slot.isActive = isActive;
    audit(isActive ? "adslot.enabled" : "adslot.disabled", slot.name, isActive ? "Slot enabled" : "Slot disabled — nothing renders there");
    commit();
    return slot;
  }, 150);
}

export async function updateSlotRate(key, rateLabel) {
  return run(() => { const slot = getDb().adSlots.find((s) => s.key === key); slot.rateLabel = rateLabel; audit("adslot.rate", slot.name, rateLabel); commit(); return slot; }, 150);
}

// ---------- Reports ----------
export async function getReports({ from, to }) {
  if (!IS_MOCK) return remote("get", "/admin-api/reports/", { params: { from, to } });
  return run(() => {
    const db = getDb();
    const inRange = (iso) => (!from || iso.slice(0, 10) >= from) && (!to || iso.slice(0, 10) <= to);
    const subs = liveSubs(db.orders).filter((s) => inRange(s.createdAt));
    const group = (keyFn) => Object.values(subs.reduce((acc, s) => {
      const key = keyFn(s);
      acc[key] ??= { commission: 0, gmv: 0, items: 0, key, orders: 0, tax: 0 };
      Object.assign(acc[key], { commission: acc[key].commission + s.commissionAmount, gmv: acc[key].gmv + s.total, items: acc[key].items + s.items.reduce((t, i) => t + i.quantity, 0), orders: acc[key].orders + 1, tax: acc[key].tax + s.tax.cgst + s.tax.sgst + s.tax.igst });
      return acc;
    }, {})).sort((a, b) => (a.key < b.key ? 1 : -1));
    const catName = (slug) => db.categories.find((c) => c.slug === slug)?.name ?? slug;
    const byCategory = Object.values(subs.flatMap((s) => s.items).reduce((acc, it) => {
      const slug = db.products.find((p) => p.id === it.productId)?.categorySlug;
      acc[slug] ??= { gmv: 0, items: 0, key: catName(slug) };
      acc[slug].gmv += it.lineTotal; acc[slug].items += it.quantity;
      return acc;
    }, {})).sort((a, b) => b.gmv - a.gmv);
    const gst = Object.values(subs.reduce((acc, s) => {
      const state = s.order.address.state;
      acc[state] ??= { cgst: 0, igst: 0, key: state, sgst: 0, taxable: 0 };
      Object.assign(acc[state], { cgst: acc[state].cgst + s.tax.cgst, igst: acc[state].igst + s.tax.igst, sgst: acc[state].sgst + s.tax.sgst, taxable: acc[state].taxable + s.tax.taxable });
      return acc;
    }, {})).sort((a, b) => b.taxable - a.taxable);
    const tcsTds = db.stores.map((store) => {
      const own = subs.filter((s) => s.storeSlug === store.slug);
      const gross = own.reduce((t, s) => t + s.subtotal, 0);
      const taxable = own.reduce((t, s) => t + s.tax.taxable, 0);
      return { gross, gstin: store.gstin, key: store.name, taxable, tcs: (taxable * db.platform.tcsRate) / 100, tds: (gross * db.platform.tdsRate) / 100 };
    }).filter((r) => r.gross > 0);
    return {
      byCategory, byDay: group((s) => s.createdAt.slice(0, 10)), byPayment: group((s) => (s.order.paymentMethod === "cod" ? "Cash on Delivery" : "Online")),
      byStore: group((s) => s.storeName), gst, tcsTds,
      totals: { commission: subs.reduce((t, s) => t + s.commissionAmount, 0), gmv: subs.reduce((t, s) => t + s.total, 0), orders: new Set(subs.map((s) => s.order.number)).size, tax: subs.reduce((t, s) => t + s.tax.cgst + s.tax.sgst + s.tax.igst, 0) },
    };
  }, 400);
}

// ---------- Reviews ----------
export async function getAdminReviews() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/reviews/")).results;
  return run(() => {
    const db = getDb();
    return db.products.filter((p) => !p.deletedAt).slice(0, 30).flatMap((p) => buildReviews(p, 3).map((r) => ({ ...r, hidden: db.hiddenReviews.includes(r.id), productName: p.name, productSlug: p.slug, storeSlug: p.storeSlug })));
  });
}

export async function setReviewHidden(id, hidden) {
  if (!IS_MOCK) return remote("patch", `/admin-api/reviews/${id}/`, { status: hidden ? "hidden" : "published" });
  return run(() => {
    const list = getDb().hiddenReviews; // mutate in place so the change persists
    const i = list.indexOf(id);
    if (hidden && i < 0) list.push(id);
    if (!hidden && i >= 0) list.splice(i, 1);
    audit(hidden ? "review.hidden" : "review.restored", `Review ${id}`, hidden ? "Hidden from storefront" : "Restored");
    commit();
    return id;
  }, 150);
}

// ---------- Audit & settings ----------
export async function getAuditLog() {
  if (!IS_MOCK) return (await remote("get", "/admin-api/audit-logs/")).results;
  return run(() => getDb().auditLog, 200);
}

export async function getPlatformSettings() {
  if (!IS_MOCK) return remote("get", API.ADMIN_SETTINGS);
  return run(() => ({ ...getDb().platform }), 150);
}

export async function savePlatformSettings(patch) {
  if (!IS_MOCK) return remote("patch", API.ADMIN_SETTINGS, patch);
  return run(() => {
    const p = getDb().platform;
    // Whitelist: only known settings keys can be written; internal keys (idempotency, homeSections …) are not editable here.
    const EDITABLE = new Set(["address", "cin", "codEnabled", "codFee", "codMaxOrderValue", "commissionGstRate", "defaultCommissionRate", "defaultReturnWindowDays", "gstin", "gstRateChoices", "legalName", "lowStockThreshold", "orderPaymentTimeoutMinutes", "productModerationEnabled", "supportEmail", "supportPhone", "tcsRate", "tdsRate", "website"]);
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => EDITABLE.has(k)));
    const changed = Object.keys(clean).filter((k) => JSON.stringify(p[k]) !== JSON.stringify(clean[k]));
    Object.assign(p, clean);
    audit("settings.updated", "Platform settings", changed.length ? `Changed: ${changed.join(", ")}` : "No changes");
    commit();
    return p;
  });
}

export async function getAllSubOrder(subOrderNumber) {
  return run(() => findSubOrder(subOrderNumber), 100);
}
