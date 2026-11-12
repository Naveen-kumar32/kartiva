import { MAX_PER_LINE } from "@/constants/catalog";

import { getStore, findVariantById, shippingFee } from "./catalog";
import { minOrderQty, priceTiersOf, tierFor, unitPriceFor } from "./pricing";

// Wholesale products (slab pricing or an MOQ) can be bought in bulk; everything else keeps the retail cap.
export const BULK_MAX_PER_LINE = 500;
export const maxQtyFor = (product, variant) => {
  const cap = priceTiersOf(product).length || minOrderQty(product) > 1 ? BULK_MAX_PER_LINE : MAX_PER_LINE;
  return Math.max(0, Math.min(cap, variant?.stock ?? cap));
};

// Next cheaper slab for a quantity: { minQty, discountPct, unitPrice, addQty } or null.
export function nextTierFor(product, variant, quantity) {
  const next = priceTiersOf(product).find((t) => t.minQty > quantity);
  if (!next) return null;
  return { ...next, addQty: next.minQty - quantity, unitPrice: unitPriceFor(product, variant, next.minQty) };
}

// Builds the seller-grouped cart view from raw cart lines. Totals are recomputed here
// for display only — the backend recomputes everything again at checkout.
export function buildCartView(lines, shippingChoices = {}) {
  const groups = new Map();
  for (const line of lines) {
    const found = findVariantById(line.variantId);
    if (!found) continue;
    const { product, variant } = found;
    const store = getStore(product.storeSlug);
    if (!groups.has(store.slug)) groups.set(store.slug, { items: [], store, subtotal: 0 });
    const group = groups.get(store.slug);
    const quantity = Math.min(line.quantity, Math.max(variant.stock, 0));
    const unitPrice = unitPriceFor(product, variant, line.quantity);
    const moq = minOrderQty(product);
    group.items.push({
      ...line, lineTotal: unitPrice * line.quantity, maxQty: maxQtyFor(product, variant), moq, moqOk: line.quantity >= moq && !product.enquiryOnly,
      nextTier: nextTierFor(product, variant, line.quantity), product, quantity: line.quantity, stockOk: quantity === line.quantity,
      tier: tierFor(product, line.quantity), unitPrice, variant,
    });
    group.subtotal += unitPrice * line.quantity;
  }

  const sellerGroups = [...groups.values()].map((group) => {
    const methods = group.store.shippingMethods;
    const chosen = methods.find((m) => m.id === shippingChoices[group.store.slug])
      ?? [...methods].sort((a, b) => shippingFee(a, group.subtotal) - shippingFee(b, group.subtotal))[0];
    const fee = shippingFee(chosen, group.subtotal);
    const freeGap = chosen.freeAbove != null && fee > 0 ? chosen.freeAbove - group.subtotal : 0;
    return { ...group, fee, freeGap, method: chosen, total: group.subtotal + fee };
  });

  const itemsSubtotal = sellerGroups.reduce((s, g) => s + g.subtotal, 0);
  const shippingTotal = sellerGroups.reduce((s, g) => s + g.fee, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const mrpTotal = sellerGroups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.variant.mrp * i.quantity, 0), 0);
  const hasIssue = sellerGroups.some((g) => g.items.some((i) => !i.stockOk || !i.moqOk));
  return { grandTotal: itemsSubtotal + shippingTotal, groups: sellerGroups, hasIssue, itemCount, itemsSubtotal, savings: mrpTotal - itemsSubtotal, shippingTotal };
}
