import { API, axiosInstance, IS_MOCK } from "@/config";
import { PAGE_SIZE } from "@/constants";
import { CATEGORIES, PRODUCTS, STORES, buildReviews, ratingCounts } from "@/data";

import { getDb } from "./mockDb";
import { visibleReviews } from "./reviewApi";
import { categoryTrail, categoryWithDescendants, getStore, isServiceable, mockDelay, priceTiersOf, summarizeProduct } from "@/utils";
import { createSearcher } from "@/utils/smartSearch";

// Storefront only shows active, non-deleted products from approved stores in active categories.
export const isPublicProduct = (p) => {
  const store = getStore(p.storeSlug);
  const category = CATEGORIES.find((c) => c.slug === p.categorySlug);
  return p.status === "active" && !p.deletedAt && store?.status === "approved" && category?.isActive !== false;
};
const publicProducts = () => PRODUCTS.filter(isPublicProduct);

const withSummary = (p) => ({ ...p, summary: summarizeProduct(p), store: getStore(p.storeSlug) });

// Supplier-trust facets (Alibaba / IndiaMART style).
const isVerifiedSupplier = (p) => p.store?.kycStatus === "verified";
const isPremiumSupplier = (p) => p.store?.plan === "gold" || p.store?.plan === "platinum";
const hasBulkPricing = (p) => priceTiersOf(p).length > 0;

const SORTERS = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  popular: (a, b) => b.soldCount - a.soldCount,
  price_asc: (a, b) => a.summary.minPrice - b.summary.minPrice,
  price_desc: (a, b) => b.summary.minPrice - a.summary.minPrice,
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
};

/** "Smartphones Electronics" — the category and its parents, so products are found by category words too. */
export const categoryNames = (slug) => categoryTrail(slug).map((c) => c.name).join(" ");

export async function getCategories() {
  if (!IS_MOCK) return (await axiosInstance.get(API.CATEGORIES)).data;
  return mockDelay(CATEGORIES.filter((c) => c.isActive !== false), 100);
}

// Category directory (Alibaba "All categories"): every active root with its sub-categories, product and supplier counts.
export async function getCategoryDirectory() {
  if (!IS_MOCK) return (await axiosInstance.get(API.CATEGORIES, { params: { directory: 1 } })).data;
  const products = publicProducts();
  const active = CATEGORIES.filter((c) => c.isActive !== false);
  const stats = (slugs) => {
    const list = products.filter((p) => slugs.includes(p.categorySlug));
    return { productCount: list.length, supplierCount: new Set(list.map((p) => p.storeSlug)).size };
  };
  const roots = active.filter((c) => !c.parentId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((root) => {
    const children = active.filter((c) => c.parentId === root.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((c) => ({ ...c, ...stats([c.slug]) }));
    return { ...root, children, ...stats([root.slug, ...children.map((c) => c.slug)]), thumbnail: products.find((p) => children.some((c) => c.slug === p.categorySlug))?.thumbnail ?? null };
  });
  return mockDelay(roots, 120);
}

const SPOTLIGHT_CATEGORY = "printing-xerox"; // the client's own print business — spotlighted under the hero banner
const HOUSE_STORE = "lakshmi-graphics"; // the client's own print shop — first suggestion under every product
// One admin switch (Website content → Home page → Printing & Xerox spotlight) controls every house-shop promotion.
const housePromoOn = () => getDb().platform.homeSections?.printingSpotlight !== false;

/** A varied preview: one product from each sub-category in turn (biggest ranges first), n in all. */
function varied(products, n = 6) {
  const groups = new Map();
  products.forEach((p) => groups.set(p.categorySlug, [...(groups.get(p.categorySlug) ?? []), p]));
  const queues = [...groups.values()].sort((a, b) => b.length - a.length);
  const picks = [];
  while (picks.length < n && queues.some((q) => q.length)) queues.forEach((q) => { if (q.length && picks.length < n) picks.push(q.shift()); });
  return picks;
}

/** Printing & Xerox block for the homepage (Admin → Website content → Home page can switch it off). */
function spotlight(all) {
  if (!housePromoOn()) return null;
  const root = CATEGORIES.find((c) => c.slug === SPOTLIGHT_CATEGORY);
  if (!root || root.isActive === false) return null;
  const slugs = categoryWithDescendants(SPOTLIGHT_CATEGORY);
  const products = all.filter((p) => slugs.includes(p.categorySlug));
  if (!products.length) return null;
  const children = CATEGORIES.filter((c) => c.parentId === root.id && c.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => ({ ...c, productCount: products.filter((p) => p.categorySlug === c.slug).length })).filter((c) => c.productCount);
  return { category: root, children, productCount: products.length, products: varied(products) };
}

export async function getHome() {
  if (!IS_MOCK) return (await axiosInstance.get(API.HOME)).data;
  const all = publicProducts().map(withSummary).filter((p) => p.summary.totalStock > 0);
  return mockDelay({
    spotlight: spotlight(all),
    featuredProducts: all.filter((p) => p.isFeatured).slice(0, 12),
    featuredStores: STORES.filter((s) => s.isFeatured && s.status === "approved"),
    newArrivals: [...all].sort(SORTERS.newest).slice(0, 12),
    showBuyRequestBanner: getDb().platform.homeSections?.buyRequestBanner !== false,
    rootCategories: CATEGORIES.filter((c) => !c.parentId && c.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    topCategories: CATEGORIES.filter((c) => c.parentId && c.isActive !== false),
    trendingProducts: [...all].sort(SORTERS.popular).slice(0, 12),
  });
}

/** params: { q, category, store, brand[], sellers[], businessTypes[], minPrice, maxPrice, minRating, inStock, verified, bulk, premium, attrs{}, sort, page } */
export async function getProducts(params = {}) {
  if (!IS_MOCK) return (await axiosInstance.get(API.PRODUCTS, { params: toQuery(params) })).data;
  const { attrs = {}, brands = [], bulk, businessTypes = [], category, inStock, maxPrice, minPrice, minRating, page = 1, premium, q = "", sellers = [], sort = "relevance", store, verified } = params;
  let list = publicProducts().map(withSummary);
  let search = null;
  if (q.trim()) {
    // Smart search: typos, sound-alikes, Tamil / Tanglish / Hindi words, intent words, related fallback (utils/smartSearch.js)
    const found = createSearcher(list, { categoryNames, customWords: getDb().platform.searchWords }).search(q);
    list = found.results.map(({ p, score }) => ({ ...p, score }));
    search = { corrected: found.corrected, mode: found.mode, query: q.trim(), sortHint: found.sortHint };
  }
  if (category) {
    const slugs = categoryWithDescendants(category);
    list = list.filter((p) => slugs.includes(p.categorySlug));
  }
  if (store) list = list.filter((p) => p.storeSlug === store);

  // Facets are computed before brand/seller/price filters so the panel keeps its options.
  const facets = {
    attributes: {},
    brands: countBy(list, (p) => p.brand),
    bulk: list.filter(hasBulkPricing).length,
    businessTypes: countBy(list.filter((p) => p.store?.businessType), (p) => p.store.businessType),
    premium: list.filter(isPremiumSupplier).length,
    sellers: countBy(list, (p) => p.storeSlug),
    verified: list.filter(isVerifiedSupplier).length,
  };
  list.forEach((p) => p.variantOptions.forEach((o) => {
    if (o.name === "Storage" || o.name === "Configuration") return;
    facets.attributes[o.name] ??= {};
    o.values.forEach((v) => { facets.attributes[o.name][v] = (facets.attributes[o.name][v] ?? 0) + 1; });
  }));

  if (brands.length) list = list.filter((p) => brands.includes(p.brand));
  if (sellers.length) list = list.filter((p) => sellers.includes(p.storeSlug));
  if (businessTypes.length) list = list.filter((p) => businessTypes.includes(p.store?.businessType));
  if (verified) list = list.filter(isVerifiedSupplier);
  if (bulk) list = list.filter(hasBulkPricing);
  if (premium) list = list.filter(isPremiumSupplier);
  if (minPrice) list = list.filter((p) => p.summary.minPrice >= Number(minPrice));
  if (maxPrice) list = list.filter((p) => p.summary.minPrice <= Number(maxPrice));
  if (minRating) list = list.filter((p) => p.rating >= Number(minRating));
  if (inStock) list = list.filter((p) => p.summary.totalStock > 0);
  Object.entries(attrs).forEach(([name, values]) => {
    if (values?.length) list = list.filter((p) => p.variants.some((v) => values.includes(v.attributes[name])));
  });

  // "cheap phone" → lowest price first, "pudhusa watch" → newest first (only while the shopper hasn't picked a sort)
  const order = sort === "relevance" && search?.sortHint ? search.sortHint : sort;
  // Default order: best search match first, then the most recently added products on top.
  if (order === "relevance") list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || SORTERS.newest(a, b));
  else list.sort(SORTERS[order] ?? SORTERS.popular);

  const count = list.length;
  const results = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return mockDelay({ count, facets, page, pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)), results, search });
}

export async function getProduct(slug) {
  if (!IS_MOCK) return (await axiosInstance.get(API.PRODUCT(slug))).data;
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product || !isPublicProduct(product)) throw Object.assign(new Error("Not found"), { response: { data: { detail: "Product not found." }, status: 404 } });
  const all = publicProducts().map(withSummary);
  const related = all.filter((p) => p.categorySlug === product.categorySlug && p.id !== product.id)
    .sort((a, b) => (a.storeSlug !== HOUSE_STORE) - (b.storeSlug !== HOUSE_STORE)).slice(0, 12); // the house print shop first
  return mockDelay({ ...withSummary(product), ratingCounts: ratingCounts(product), related, reviews: visibleReviews(product), shopPicks: shopPicks(all, product, related) });
}

/** First suggestion row under every product: the house print shop's products (varied, not repeating what's on screen). */
function shopPicks(all, product, related) {
  const house = getStore(HOUSE_STORE);
  if (!housePromoOn() || house?.status !== "approved") return null;
  const seen = new Set([product.id, ...related.map((p) => p.id)]);
  const own = all.filter((p) => p.storeSlug === HOUSE_STORE && !seen.has(p.id) && p.summary.totalStock > 0);
  return own.length ? { products: varied(own), sameStore: product.storeSlug === HOUSE_STORE, store: house } : null;
}

export async function checkDelivery(product, pincode) {
  if (!IS_MOCK) return (await axiosInstance.get(API.PRODUCT_DELIVERY(product.slug), { params: { pincode } })).data;
  const store = getStore(product.storeSlug);
  return mockDelay(store.shippingMethods.filter((m) => isServiceable(m, pincode)), 250);
}

export async function getStoreWithProducts(slug) {
  if (!IS_MOCK) return (await axiosInstance.get(API.STORE(slug))).data;
  const store = getStore(slug);
  if (!store || store.status !== "approved") throw Object.assign(new Error("Not found"), { response: { data: { detail: "Store not found." }, status: 404 } });
  const db = getDb();
  const products = publicProducts().filter((p) => p.storeSlug === slug).map(withSummary);
  // Company profile extras: verified KYC document types (never the files) and a sample of product reviews.
  const verifiedDocuments = [...new Set(db.kycDocuments.filter((d) => d.storeSlug === slug && d.status === "verified").map((d) => d.type))];
  const hidden = db.hiddenReviews;
  const reviews = [...products].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 4)
    .flatMap((p) => buildReviews(p, 2).filter((rv) => !hidden.includes(rv.id)).map((rv) => ({ ...rv, productName: p.name, productSlug: p.slug })));
  return mockDelay({ products, reviews, store, verifiedDocuments });
}

// API mode: same query names as the listing page URL (brand=a,b · attr.Colour=Red,Blue · in_stock=1 …).
function toQuery({ attrs = {}, brands = [], bulk, businessTypes = [], category, inStock, maxPrice, minPrice, minRating, page, premium, q, sellers = [], sort, store, verified } = {}) {
  const list = (v) => (v?.length ? v.join(",") : undefined);
  const flag = (v) => (v ? 1 : undefined);
  const query = {
    brand: list(brands), btype: list(businessTypes), bulk: flag(bulk), category: category || undefined, in_stock: flag(inStock), max_price: maxPrice || undefined,
    min_price: minPrice || undefined, min_rating: minRating || undefined, page: page > 1 ? page : undefined, premium: flag(premium), q: q || undefined,
    seller: list(sellers), sort: sort || undefined, store: store || undefined, verified: flag(verified),
  };
  Object.entries(attrs).forEach(([name, values]) => { if (values?.length) query[`attr.${name}`] = values.join(","); });
  return query;
}

function countBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
