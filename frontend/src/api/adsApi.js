import { API, axiosInstance, IS_MOCK } from "@/config";
import { ADS, AD_SLOTS } from "@/data";
import { categoryTrail, categoryWithDescendants, getProductById, getStore, mockDelay, summarizeProduct } from "@/utils";

import { isPublicProduct } from "./catalogApi";

const today = () => new Date().toISOString().slice(0, 10);

// Contextual targeting for product ads: on a category page only products from that category (or its
// sub-categories); on a search page only products matching the query; on a product page products from the
// same top-level category. Banner / house ads (no product) are not filtered.
function matchesContext(product, { categorySlug, excludeProductId, query } = {}) {
  if (!product) return true;
  if (excludeProductId && product.id === excludeProductId) return false;
  if (categorySlug && !categoryWithDescendants(categorySlug).includes(product.categorySlug)) return false;
  if (query) {
    const haystack = `${product.name} ${product.brand} ${categoryTrail(product.categorySlug).map((c) => c.name).join(" ")}`.toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (terms.length && !terms.some((t) => haystack.includes(t))) return false;
  }
  return true;
}

// Returns live ads for one slot, highest priority first, with product data resolved.
// context = { categorySlug?, query?, excludeProductId? } — see matchesContext.
export async function getSlotAds(slotKey, context = {}) {
  if (!IS_MOCK) return (await axiosInstance.get(API.ADS, { params: { slots: slotKey, category: context.categorySlug, q: context.query } })).data[slotKey];
  const slot = AD_SLOTS.find((s) => s.key === slotKey);
  if (slot?.isActive === false) return mockDelay({ items: [], slot }, 50);
  const items = ADS.filter((a) => a.slot === slotKey && a.status === "active" && a.startsAt <= today() && a.endsAt >= today())
    .filter((a) => !a.productId || isPublicProduct(getProductById(a.productId) ?? {}))
    .filter((a) => !a.productId || matchesContext(getProductById(a.productId), context))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, slot?.maxItems ?? 1)
    .map((ad) => {
      const product = ad.productId ? getProductById(ad.productId) : null;
      return {
        ...ad,
        product: product ? { ...product, store: getStore(product.storeSlug), summary: summarizeProduct(product) } : null,
      };
    });
  return mockDelay({ items, slot }, 150);
}

// Impressions are batched and sent with sendBeacon in api mode (docs §3.11).
export function trackImpressions(adIds, page) {
  if (IS_MOCK || !adIds.length) return;
  const body = new Blob([JSON.stringify({ ids: adIds, page })], { type: "application/json" });
  navigator.sendBeacon?.(`${axiosInstance.defaults.baseURL}${API.AD_IMPRESSIONS}`, body);
}
