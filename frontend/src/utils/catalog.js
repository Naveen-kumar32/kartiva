import { CATEGORIES, PRODUCTS, STORES } from "@/data";

export const getStore = (slug) => STORES.find((s) => s.slug === slug);
export const getCategory = (slug) => CATEGORIES.find((c) => c.slug === slug);
export const getProductById = (id) => PRODUCTS.find((p) => p.id === id);

export const getDefaultVariant = (product) =>
  product.variants.find((v) => v.isDefault && v.stock > 0) ?? product.variants.find((v) => v.stock > 0) ?? product.variants[0];

export const findVariant = (product, attributes) =>
  product.variants.find((v) => Object.entries(v.attributes).every(([k, val]) => attributes[k] === val));

export const findVariantById = (variantId) => {
  for (const product of PRODUCTS) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
};

export const discountPercent = (price, mrp) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

// Card-level summary: lowest price among variants, total stock.
export function summarizeProduct(product) {
  const prices = product.variants.map((v) => v.price);
  const display = getDefaultVariant(product);
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  return {
    discount: discountPercent(display.price, display.mrp),
    hasRange: Math.min(...prices) !== Math.max(...prices),
    minPrice: Math.min(...prices),
    mrp: display.mrp,
    price: display.price,
    totalStock,
  };
}

// Category slug → itself + all descendant leaf slugs
export function categoryWithDescendants(slug) {
  const result = [slug];
  const walk = (parentSlug) => {
    const parent = getCategory(parentSlug);
    CATEGORIES.filter((c) => c.parentId === parent?.id).forEach((child) => {
      result.push(child.slug);
      walk(child.slug);
    });
  };
  walk(slug);
  return result;
}

export function categoryTrail(slug) {
  const trail = [];
  let current = getCategory(slug);
  while (current) {
    trail.unshift(current);
    current = CATEGORIES.find((c) => c.id === current.parentId);
  }
  return trail;
}

// Pincode serviceability for a shipping method (empty list = all India).
export const isServiceable = (method, pincode) =>
  !method.pincodes?.length || method.pincodes.some((prefix) => pincode.startsWith(prefix));

export const shippingFee = (method, subtotal) => (method.freeAbove != null && subtotal >= method.freeAbove ? 0 : method.fee);
