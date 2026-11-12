// Pure order / money maths shared by checkout, the mock DB seed, ledgers and documents.
// No data imports here — callers pass everything in (keeps it testable and cycle-free).
import { splitGst } from "./gst";
import { tierFor, unitPriceFor } from "./pricing";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const DAY_MS = 86_400_000;

// store override → category rule (walking up ancestors) → global default
export function resolveCommissionRate(rules, { categorySlug, storeSlug }, categories) {
  const active = rules.filter((r) => r.isActive !== false);
  const storeRule = active.find((r) => r.scope === "store" && r.storeSlug === storeSlug);
  if (storeRule) return storeRule.rate;
  let cat = categories.find((c) => c.slug === categorySlug);
  while (cat) {
    const slug = cat.slug;
    const rule = active.find((r) => r.scope === "category" && r.categorySlug === slug);
    if (rule) return rule.rate;
    cat = categories.find((c) => c.id === cat.parentId);
  }
  return active.find((r) => r.scope === "global")?.rate ?? 10;
}

export const methodFee = (method, subtotal) => (method.freeAbove != null && subtotal >= method.freeAbove ? 0 : method.fee);

/**
 * Builds one seller sub-order with GST split and commission snapshot.
 * lines: [{ product, variant, quantity }] — product/variant come from the catalogue, never the cart.
 * Unit price is the wholesale slab price for the quantity (unitPriceFor), so GST, commission and the
 * seller ledger all flow from the discounted line total.
 */
export function buildSubOrder({ categories, buyerStateCode, lines, method, number, rules, store }) {
  const interstate = store.gstStateCode !== buyerStateCode;
  const items = lines.map(({ product, quantity, variant }) => {
    const price = unitPriceFor(product, variant, quantity);
    const lineTotal = price * quantity;
    const tier = tierFor(product, quantity);
    const tax = splitGst(lineTotal, product.gstRate, interstate);
    const commissionRate = resolveCommissionRate(rules, { categorySlug: product.categorySlug, storeSlug: store.slug }, categories);
    return {
      cgst: tax.cgst, commissionAmount: round2((lineTotal * commissionRate) / 100), commissionRate, gstRate: product.gstRate,
      hsn: product.hsnCode, igst: tax.igst, image: product.thumbnail, isReturnable: product.isReturnable, lineTotal, mrp: variant.mrp,
      listPrice: variant.price, name: product.name, price, productId: product.id, quantity, returnedQuantity: 0, sgst: tax.sgst, sku: variant.sku,
      taxable: tax.taxable, tierDiscountPct: tier?.discountPct ?? 0, variantId: variant.id, variantLabel: Object.values(variant.attributes).join(" / "),
    };
  });
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const fee = methodFee(method, subtotal);
  return {
    carrier: null, commissionAmount: round2(items.reduce((s, i) => s + i.commissionAmount, 0)), deliveredAt: null, fee,
    interstate, invoiceNumber: null, items,
    method: { codAllowed: method.codAllowed, id: method.id, maxDays: method.maxDays, minDays: method.minDays, name: method.name, type: method.type },
    number, refundedAmount: 0, settlementId: null, shippedAt: null, status: "confirmed", storeName: store.name, storeSlug: store.slug,
    subtotal,
    tax: {
      cgst: round2(items.reduce((s, i) => s + i.cgst, 0)), igst: round2(items.reduce((s, i) => s + i.igst, 0)),
      sgst: round2(items.reduce((s, i) => s + i.sgst, 0)), taxable: round2(items.reduce((s, i) => s + i.taxable, 0)),
    },
    timeline: [],
    total: subtotal + fee,
    trackingNumber: null,
  };
}

/**
 * Seller ledger derived from orders, refunds, ads and settlements (docs: DATABASE_SCHEMA §2.22).
 * Returns { entries, balance, pending } — entries sorted newest first. + = platform owes seller.
 */
export function computeLedger({ ads, now = Date.now(), orders, platform, refunds, returnWindowDays = 7, settlements, storeSlug }) {
  const entries = [];
  let pending = 0;
  const credited = new Set(); // sub-orders whose sale is already in the ledger
  const inWindow = new Set(); // delivered, return window still open (not yet credited)
  const add = (date, type, description, amount, ref = {}) => amount && entries.push({ amount: round2(amount), date, description, type, ...ref });

  for (const order of orders) {
    for (const sub of order.subOrders) {
      if (sub.storeSlug !== storeSlug || sub.status !== "delivered") continue;
      const closesAt = new Date(sub.deliveredAt).getTime() + returnWindowDays * DAY_MS;
      if (closesAt > now) { pending += sub.total - sub.commissionAmount; inWindow.add(sub.number); continue; }
      credited.add(sub.number);
      const date = new Date(closesAt).toISOString();
      const ref = { settlementId: sub.settlementId, subOrderNumber: sub.number };
      add(date, "sale", `Sale · ${sub.number}`, sub.subtotal, ref);
      add(date, "shipping", `Delivery fee · ${sub.number}`, sub.fee, ref);
      add(date, "commission", `Commission · ${sub.number}`, -sub.commissionAmount, ref);
      add(date, "commission_gst", `GST ${platform.commissionGstRate}% on commission · ${sub.number}`, -(sub.commissionAmount * platform.commissionGstRate) / 100, ref);
      add(date, "tcs", `TCS ${platform.tcsRate}% · ${sub.number}`, -(sub.tax.taxable * platform.tcsRate) / 100, ref);
      add(date, "tds", `TDS ${platform.tdsRate}% · ${sub.number}`, -(sub.subtotal * platform.tdsRate) / 100, ref);
      if (order.paymentMethod === "cod") add(date, "cod_collected_by_seller", `COD cash collected · ${sub.number}`, -sub.total, ref);
    }
  }
  // Only refunds on sales the seller was credited for reduce the balance. Refunds for
  // shipments cancelled before delivery never reached the seller, so they don't touch the ledger.
  for (const r of refunds) {
    if (r.storeSlug !== storeSlug || r.status !== "processed") continue;
    if (credited.has(r.subOrderNumber)) add(r.processedAt ?? r.createdAt, "refund", `Refund · ${r.subOrderNumber}`, -r.amount, { settlementId: r.settlementId ?? null });
    else if (inWindow.has(r.subOrderNumber)) pending -= r.amount;
  }
  for (const ad of ads) {
    if (ad.advertiserType === "seller" && ad.storeSlug === storeSlug && ad.spend > 0) add(`${ad.startsAt}T00:00:00Z`, "ad_charge", `Ad · ${ad.headline ?? `Sponsored product #${ad.productId}`}`, -ad.spend, { settlementId: ad.settlementId ?? null });
  }
  for (const s of settlements) {
    if (s.storeSlug === storeSlug && s.status === "paid") add(s.paidAt, "payout", `Payout ${s.number} · UTR ${s.utr}`, -s.net, { settlementId: s.id });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return { balance: round2(entries.reduce((s, e) => s + e.amount, 0)), entries, pending: round2(Math.max(0, pending)) };
}

// Indian-format amount in words for invoices: 110399.5 → "Rupees One Lakh Ten Thousand Three Hundred Ninety Nine and Fifty Paise Only"
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
function intToWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) parts.push(`${intToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (n) parts.push(twoDigits(n));
  return parts.join(" ");
}
export function amountInWords(amount) {
  const totalPaise = Math.round(Number(amount) * 100); // round once, so 1.999 → 200 paise → "Two", never "undefined Paise"
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  return `Rupees ${intToWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}
