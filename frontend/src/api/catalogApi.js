import { API, axiosInstance, IS_MOCK } from "@/config";
import { PAGE_SIZE } from "@/constants";
import { CATEGORIES, PRODUCTS, STORES, buildReviews } from "@/data";

import { getDb } from "./mockDb";
import { categoryWithDescendants, getStore, isServiceable, mockDelay, priceTiersOf, summarizeProduct } from "@/utils";

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

function searchScore(p, terms) {
  const hay = { brand: p.brand.toLowerCase(), cat: p.categorySlug, desc: p.description.toLowerCase(), name: p.name.toLowerCase(), store: p.store.name.toLowerCase() };
  let score = 0;
  for (const t of terms) {
    if (hay.name.includes(t)) score += 5;
    else if (hay.brand.includes(t) || hay.store.includes(t) || hay.cat.includes(t)) score += 3;
    else if (hay.desc.includes(t)) score += 1;
    else return 0; // every term must match somewhere
  }
  return score;
}

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

export async function getHome() {
  if (!IS_MOCK) return (await axiosInstance.get(API.HOME)).data;
  const all = publicProducts().map(withSummary).filter((p) => p.summary.totalStock > 0);
  return mockDelay({
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
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) list = list.map((p) => ({ ...p, score: searchScore(p, terms) })).filter((p) => p.score > 0);
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

  // Default order: best search match first, then the most recently added products on top.
  if (sort === "relevance") list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || SORTERS.newest(a, b));
  else list.sort(SORTERS[sort] ?? SORTERS.popular);

  const count = list.length;
  const results = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return mockDelay({ count, facets, page, pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)), results });
}

export async function getProduct(slug) {
  if (!IS_MOCK) return (await axiosInstance.get(API.PRODUCT(slug))).data;
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product || !isPublicProduct(product)) throw Object.assign(new Error("Not found"), { response: { data: { detail: "Product not found." }, status: 404 } });
  const related = publicProducts().filter((p) => p.categorySlug === product.categorySlug && p.id !== product.id).slice(0, 12).map(withSummary);
  const hidden = getDb().hiddenReviews;
  return mockDelay({ ...withSummary(product), related, reviews: buildReviews(product).filter((rv) => !hidden.includes(rv.id)) });
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
