// Wholesale slab pricing (IndiaMART / Alibaba style). product.priceTiers = [{ minQty, discountPct }].
// Pure helpers shared by product page, cart and order maths. The backend recomputes the same way.
export const priceTiersOf = (product) => [...(product?.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty);

export const tierFor = (product, quantity) => priceTiersOf(product).filter((t) => quantity >= t.minQty).at(-1) ?? null;

export const tierUnitPrice = (basePrice, tier) => (tier ? Math.round(basePrice * (1 - tier.discountPct / 100)) : basePrice);

export const unitPriceFor = (product, variant, quantity) => tierUnitPrice(variant.price, tierFor(product, quantity));

export const minOrderQty = (product) => Math.max(1, product?.moq ?? 1);
