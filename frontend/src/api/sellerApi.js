// Seller Hub API. Every function is scoped to the seller's own store (storeSlug) — in api mode the
// backend derives the store from the JWT; in mock mode we filter by the demo seller's store.
import { API, axiosInstance, IS_MOCK } from "@/config";
import { buildReviews } from "@/data";
import { summarizeProduct } from "@/utils/catalog";
import { mockDelay } from "@/utils/mock";
import { DAY_MS } from "@/utils/orderMath";

import { refreshCatalog } from "./bootstrap";
import { apiError, audit, commit, getDb, nextId, nowIso } from "./mockDb";
import { assertStoreAccess } from "./session";
import { findSubOrder, ledgerFor, moveStock, transitionSubOrder, updateReturnInDb } from "./orderOps";

const run = async (fn, ms = 350) => mockDelay(await Promise.resolve().then(fn), ms);
const remote = async (method, url, body) => (await axiosInstance[method](url, body)).data;
// Changes that affect the public catalogue / store cards also refresh the in-memory catalogue (api mode).
const remoteAndRefresh = async (method, url, body) => { const data = await remote(method, url, body); await refreshCatalog(); return data; };
const ownStore = (storeSlug) => {
  assertStoreAccess(storeSlug); // the session must own this store
  const store = getDb().stores.find((s) => s.slug === storeSlug);
  if (!store) throw apiError("Store not found.", 404);
  return store;
};
const ownProduct = (storeSlug, id) => {
  const p = getDb().products.find((x) => x.id === Number(id) && x.storeSlug === storeSlug && !x.deletedAt);
  if (!p) throw apiError("Product not found.", 404); // 404, not 403 — don't reveal other sellers' data
  return p;
};
const subOrdersOf = (storeSlug) => getDb().orders.flatMap((order) => order.subOrders.filter((s) => s.storeSlug === storeSlug).map((sub) => ({ ...sub, buyer: order.buyer, createdAt: order.createdAt, orderNumber: order.number, paymentMethod: order.paymentMethod, shippingAddress: order.address })));

// ---------- Dashboard ----------
export async function getSellerDashboard(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_DASHBOARD);
  return run(() => {
    const db = getDb();
    const store = ownStore(storeSlug);
    const subs = subOrdersOf(storeSlug).filter((s) => s.status !== "cancelled");
    const now = Date.now();
    const sumSince = (ms) => subs.filter((s) => now - new Date(s.createdAt).getTime() < ms).reduce((t, s) => t + s.total, 0);
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = now - (7 - i) * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      const inWeek = subs.filter((s) => { const t = new Date(s.createdAt).getTime(); return t > start && t <= end; });
      return { label: new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: inWeek.reduce((t, s) => t + s.total, 0) };
    });
    const products = db.products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt);
    const ledger = ledgerFor(storeSlug);
    const statusCounts = subs.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
    return {
      kpis: {
        balance: ledger.balance, monthSales: sumSince(30 * DAY_MS), openReturns: db.returns.filter((r) => r.storeSlug === storeSlug && ["requested", "approved", "in_transit"].includes(r.status)).length,
        pendingInWindow: ledger.pending, pendingProducts: products.filter((p) => p.status === "pending_review").length,
        rating: store.rating, toShip: (statusCounts.confirmed ?? 0) + (statusCounts.processing ?? 0), todaySales: sumSince(DAY_MS), weekOrders: subs.filter((s) => now - new Date(s.createdAt).getTime() < 7 * DAY_MS).length,
      },
      lowStock: products.flatMap((p) => p.variants.filter((v) => v.stock <= (v.lowStockThreshold ?? 3)).map((v) => ({ product: p, variant: v }))).slice(0, 8),
      recentOrders: subs.slice(0, 6), salesByWeek: weeks, statusCounts, store,
    };
  });
}

// ---------- Products ----------
export async function getSellerProducts(storeSlug) {
  if (!IS_MOCK) return (await remote("get", API.SELLER_PRODUCTS)).results;
  return run(() => getDb().products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt).map((p) => ({ ...p, summary: summarizeProduct(p) })));
}

export async function getSellerProduct(storeSlug, id) {
  if (!IS_MOCK) return remote("get", `${API.SELLER_PRODUCTS}${id}/`);
  return run(() => structuredClone(ownProduct(storeSlug, id)), 200);
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** payload: { name, brand, categorySlug, description, hsnCode, gstRate, isReturnable, specifications[], variantOptions[], variants[{id?, attributes, sku, mrp, price, stock}], images[], priceTiers?[{minQty, discountPct}], moq?, enquiryOnly?, submit } */
export async function saveSellerProduct(storeSlug, id, payload) {
  if (!IS_MOCK) return remoteAndRefresh(id ? "patch" : "post", id ? `${API.SELLER_PRODUCTS}${id}/` : API.SELLER_PRODUCTS, payload);
  return run(() => {
    const db = getDb();
    ownStore(storeSlug);
    const category = db.categories.find((c) => c.slug === payload.categorySlug);
    if (!category || !category.parentId) throw apiError("Choose a sub-category (leaf category).");
    if (!payload.variants?.length) throw apiError("Add at least one variant with price and stock.");
    const skus = payload.variants.map((v) => v.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length) throw apiError("Each variant needs a unique SKU.");
    if (payload.variants.some((v) => Number(v.price) > Number(v.mrp))) throw apiError("Price can't be higher than MRP.");
    const clash = db.products.find((p) => p.storeSlug === storeSlug && p.id !== Number(id) && !p.deletedAt && p.variants.some((v) => skus.includes(v.sku.toUpperCase())));
    if (clash) throw apiError(`SKU already used by “${clash.name}”.`, 409);

    const moderation = db.platform.productModerationEnabled !== false;
    const maxVariantId = db.products.flatMap((p) => p.variants).reduce((m, v) => Math.max(m, v.id), 0);
    let vid = maxVariantId;
    const variants = payload.variants.map((v, i) => ({
      attributes: v.attributes ?? {}, id: v.id ?? ++vid, isDefault: i === 0, lowStockThreshold: Number(v.lowStockThreshold ?? 3),
      mrp: Number(v.mrp), price: Number(v.price), sku: v.sku.trim().toUpperCase(), stock: Number(v.stock),
    }));
    const images = (payload.images ?? []).filter(Boolean);
    const common = {
      brand: payload.brand.trim(), categorySlug: payload.categorySlug, description: payload.description.trim(), gstRate: Number(payload.gstRate),
      hsnCode: payload.hsnCode.trim(), images: images.length ? images : ["/placeholder-product.svg"], isReturnable: Boolean(payload.isReturnable),
      name: payload.name.trim(), returnWindowDays: payload.isReturnable ? db.platform.defaultReturnWindowDays : 0,
      specifications: (payload.specifications ?? []).filter((s) => s.name && s.value), thumbnail: images[0] ?? "/placeholder-product.svg",
      variantOptions: payload.variantOptions ?? [], variants,
    };
    // Wholesale / B2B: slab pricing, MOQ and enquiry-only listing (cleared when switched off)
    const tiers = (payload.priceTiers ?? []).map((t) => ({ discountPct: Number(t.discountPct), minQty: Math.round(Number(t.minQty)) })).filter((t) => t.minQty > 1 && t.discountPct > 0);
    if (tiers.length > 3) throw apiError("Up to 3 bulk price slabs are allowed.");
    if (tiers.some((t, i) => t.discountPct > 60 || (i > 0 && t.minQty <= tiers[i - 1].minQty))) throw apiError("Slabs need increasing quantities and 1–60% off.");
    const moq = Math.max(1, Math.round(Number(payload.moq) || 1));
    const b2b = { enquiryOnly: payload.enquiryOnly ? true : undefined, moq: moq > 1 ? moq : undefined, priceTiers: tiers.length ? tiers : undefined };
    const applyB2b = (product) => Object.entries(b2b).forEach(([k, v]) => { if (v === undefined) delete product[k]; else product[k] = v; });
    if (id) {
      const product = ownProduct(storeSlug, id);
      const contentChanged = ["name", "description", "categorySlug"].some((k) => product[k] !== common[k]) || JSON.stringify(product.images) !== JSON.stringify(common.images);
      Object.assign(product, common);
      applyB2b(product);
      if (payload.submit && moderation && contentChanged && product.status === "active") product.status = "pending_review";
      if (payload.submit && product.status === "draft") product.status = moderation ? "pending_review" : "active";
      product.updatedAt = nowIso();
      commit();
      return product;
    }
    const newId = nextId(db.products);
    const product = {
      ...common, createdAt: nowIso(), deletedAt: null, id: newId, isFeatured: false, rating: 0, reviewCount: 0, slug: `${slugify(common.name)}-${newId}`,
      soldCount: 0, status: payload.submit ? (moderation ? "pending_review" : "active") : "draft", storeSlug,
    };
    applyB2b(product);
    db.products.unshift(product);
    variants.forEach((v) => v.stock && db.stockMovements.unshift({ actor: "seller", at: nowIso(), delta: v.stock, id: nextId(db.stockMovements), note: "Opening stock", productId: newId, productName: product.name, reason: "initial", sku: v.sku, stockAfter: v.stock, storeSlug, variantId: v.id }));
    commit();
    return product;
  });
}

export async function setSellerProductStatus(storeSlug, id, status) {
  if (!IS_MOCK) return remoteAndRefresh("post", `${API.SELLER_PRODUCTS}${id}/${status === "inactive" ? "deactivate" : "activate"}/`);
  return run(() => {
    const product = ownProduct(storeSlug, id);
    if (status === "active" && !["inactive"].includes(product.status)) throw apiError("Only inactive products can be re-activated.");
    product.status = status;
    commit();
    return product;
  });
}

export async function deleteSellerProduct(storeSlug, id) {
  if (!IS_MOCK) return remoteAndRefresh("delete", `${API.SELLER_PRODUCTS}${id}/`);
  return run(() => { const p = ownProduct(storeSlug, id); p.deletedAt = nowIso(); commit(); return p; });
}

export async function duplicateSellerProduct(storeSlug, id) {
  const p = await getSellerProduct(storeSlug, id);
  return saveSellerProduct(storeSlug, null, {
    ...p, name: `${p.name} (copy)`, submit: false,
    variants: p.variants.map(({ id: _id, ...v }) => ({ ...v, sku: `${v.sku}-C${Date.now().toString(36).slice(-3).toUpperCase()}`, stock: 0 })),
  });
}

// ---------- Inventory ----------
export async function adjustStock(storeSlug, variantId, { delta, note, setTo }) {
  if (!IS_MOCK) return remoteAndRefresh("post", API.SELLER_VARIANT_STOCK(variantId), { delta, note, setTo });
  return run(() => {
    const product = getDb().products.find((p) => p.storeSlug === storeSlug && p.variants.some((v) => v.id === variantId));
    if (!product) throw apiError("Variant not found.", 404);
    const variant = product.variants.find((v) => v.id === variantId);
    const d = setTo != null ? Number(setTo) - variant.stock : Number(delta);
    if (!d) return variant;
    moveStock({ actor: "seller", delta: d, note: note || "Manual adjustment", reason: "manual_adjustment", variantId });
    commit();
    return variant;
  }, 200);
}

export async function getStockMovements(storeSlug) {
  if (!IS_MOCK) return (await remote("get", API.SELLER_STOCK_MOVEMENTS)).results;
  return run(() => getDb().stockMovements.filter((m) => m.storeSlug === storeSlug).slice(0, 200), 200);
}

// ---------- Orders ----------
export async function getSellerOrders(storeSlug) {
  if (!IS_MOCK) return (await remote("get", API.SELLER_ORDERS)).results;
  return run(() => subOrdersOf(storeSlug));
}

export async function updateSellerOrderStatus(storeSlug, subOrderNumber, toStatus, details) {
  if (!IS_MOCK) return remoteAndRefresh("post", `${API.SELLER_ORDERS}${subOrderNumber}/status/`, { ...details, toStatus });
  return run(() => {
    const { sub } = findSubOrder(subOrderNumber);
    if (sub.storeSlug !== storeSlug) throw apiError("Order not found.", 404);
    return transitionSubOrder(subOrderNumber, toStatus, { actor: "seller", ...details });
  });
}

// ---------- Returns ----------
export async function getSellerReturns(storeSlug) {
  if (!IS_MOCK) return (await remote("get", API.SELLER_RETURNS)).results;
  return run(() => getDb().returns.filter((r) => r.storeSlug === storeSlug));
}

export async function actOnSellerReturn(storeSlug, id, action, details) {
  if (!IS_MOCK) return remoteAndRefresh("post", `${API.SELLER_RETURNS}${id}/${action}/`, details ?? {});
  return run(() => {
    const ret = getDb().returns.find((r) => r.id === id && r.storeSlug === storeSlug);
    if (!ret) throw apiError("Return not found.", 404);
    return updateReturnInDb(id, action, { actor: "seller", ...details });
  });
}

// ---------- Shipping methods ----------
export async function getShippingMethods(storeSlug) {
  if (!IS_MOCK) return (await remote("get", API.SELLER_SHIPPING_METHODS)).results;
  return run(() => ownStore(storeSlug).shippingMethods, 150);
}

export async function saveShippingMethod(storeSlug, method) {
  if (!IS_MOCK) return remoteAndRefresh(method.id ? "patch" : "post", `${API.SELLER_SHIPPING_METHODS}${method.id ? `${method.id}/` : ""}`, method);
  return run(() => {
    const store = ownStore(storeSlug);
    const all = getDb().stores.flatMap((s) => s.shippingMethods);
    const clean = {
      codAllowed: Boolean(method.codAllowed), fee: Number(method.fee), freeAbove: method.freeAbove === "" || method.freeAbove == null ? null : Number(method.freeAbove),
      maxDays: Number(method.maxDays), minDays: Number(method.minDays), name: method.name.trim(),
      pincodes: (Array.isArray(method.pincodes) ? method.pincodes : String(method.pincodes ?? "").split(/[\s,]+/)).filter(Boolean), type: method.type,
    };
    if (clean.maxDays < clean.minDays) throw apiError("Max days can't be less than min days.");
    if (method.id) Object.assign(store.shippingMethods.find((m) => m.id === method.id), clean);
    else store.shippingMethods.push({ ...clean, id: nextId(all) });
    commit();
    return store.shippingMethods;
  });
}

export async function deleteShippingMethod(storeSlug, methodId) {
  if (!IS_MOCK) return remoteAndRefresh("delete", `${API.SELLER_SHIPPING_METHODS}${methodId}/`);
  return run(() => {
    const store = ownStore(storeSlug);
    if (store.shippingMethods.length === 1) throw apiError("Keep at least one delivery method so buyers can order.");
    store.shippingMethods = store.shippingMethods.filter((m) => m.id !== methodId);
    commit();
    return store.shippingMethods;
  });
}

// ---------- Store profile ----------
export async function getSellerStore(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_STORE);
  return run(() => structuredClone(ownStore(storeSlug)), 150);
}

export async function updateSellerStore(storeSlug, patch) {
  if (!IS_MOCK) return remoteAndRefresh("patch", API.SELLER_STORE, patch);
  return run(() => {
    const store = ownStore(storeSlug);
    const allowed = ["name", "tagline", "description", "color", "returnPolicy", "supportEmail", "supportPhone", "city"];
    allowed.forEach((k) => { if (patch[k] !== undefined) store[k] = patch[k]; });
    store.initials = store.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    store.banner = `linear-gradient(120deg, #0f172a, ${store.color} 60%, ${store.color}cc)`;
    commit();
    return store;
  });
}

// ---------- Earnings ----------
export async function getSellerEarnings(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_EARNINGS);
  return run(() => ({ ...ledgerFor(storeSlug), settlements: getDb().settlements.filter((s) => s.storeSlug === storeSlug), store: ownStore(storeSlug) }));
}

// ---------- Ads ----------
export async function getSellerAds(storeSlug) {
  if (!IS_MOCK) return (await remote("get", API.SELLER_ADS)).results;
  return run(() => getDb().ads.filter((a) => a.storeSlug === storeSlug && a.advertiserType === "seller"));
}

export async function requestSellerAd(storeSlug, { budget, days, productId, slot }) {
  if (!IS_MOCK) return remoteAndRefresh("post", API.SELLER_ADS, { budget, days, productId, slot });
  return run(() => {
    const db = getDb();
    const store = ownStore(storeSlug);
    const product = ownProduct(storeSlug, productId);
    const slotDef = db.adSlots.find((s) => s.key === slot);
    if (!slotDef || slotDef.format !== "sponsored_products") throw apiError("Choose a sponsored-products slot.");
    const start = new Date();
    const ad = {
      advertiser: store.name, advertiserType: "seller", budget: Number(budget), endsAt: new Date(start.getTime() + Number(days) * DAY_MS).toISOString().slice(0, 10),
      id: nextId(db.ads), impressions: 0, clicks: 0, pricing: "cpc", productId: product.id, rate: slot.startsWith("listing") ? 5 : 4,
      requestedAt: nowIso(), slot, spend: 0, startsAt: start.toISOString().slice(0, 10), status: "pending_approval", storeSlug,
    };
    db.ads.push(ad);
    audit("ad.requested", `Ad #${ad.id}`, `${store.name} requested a sponsored ad for “${product.name}” (budget ₹${budget})`, store.name);
    commit();
    return ad;
  });
}

// ---------- Reviews ----------
export async function getSellerReviews(storeSlug) {
  if (!IS_MOCK) return (await remote("get", API.SELLER_REVIEWS)).results;
  return run(() => {
    const hidden = getDb().hiddenReviews;
    return getDb().products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt).slice(0, 12)
      .flatMap((p) => buildReviews(p, 3).map((r) => ({ ...r, hidden: hidden.includes(r.id), productName: p.name, productSlug: p.slug })));
  });
}
