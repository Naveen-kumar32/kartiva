// Deterministic sample history (orders, returns, refunds, settlements, buyers, audit log) for the demo.
// Built from the catalogue so every page — seller hub, admin, reports, documents — shows consistent numbers.
import { stateCodeOf } from "@/constants/indianStates";
import { buildSubOrder, DAY_MS } from "@/utils/orderMath";

import { CATEGORIES } from "./categories";
import { PLATFORM } from "./platform";
import { PRODUCTS } from "./products";
import { STORES } from "./stores";

export const SEED_NOW = new Date("2026-11-11T12:00:00+05:30").getTime();

export const COMMISSION_RULES = [
  { id: 1, isActive: true, rate: 10, scope: "global" },
  { categorySlug: "fresh-pantry", id: 2, isActive: true, rate: 6, scope: "category" },
  { categorySlug: "fashion", id: 3, isActive: true, rate: 12, scope: "category" },
  { categorySlug: "watches-accessories", id: 4, isActive: true, rate: 12, scope: "category" },
  { id: 5, isActive: true, rate: 8, scope: "store", storeSlug: "technest" },
  { id: 6, isActive: true, rate: 0, scope: "store", storeSlug: "kartiva-essentials" },
];

const CITIES = [
  ["Chennai", "Tamil Nadu", "600040"], ["Bengaluru", "Karnataka", "560034"], ["Mumbai", "Maharashtra", "400050"],
  ["Hyderabad", "Telangana", "500081"], ["Pune", "Maharashtra", "411014"], ["Kochi", "Kerala", "682020"],
  ["New Delhi", "Delhi", "110017"], ["Jaipur", "Rajasthan", "302017"], ["Kolkata", "West Bengal", "700091"],
  ["Lucknow", "Uttar Pradesh", "226010"], ["Coimbatore", "Tamil Nadu", "641004"], ["Ahmedabad", "Gujarat", "380015"],
];
const NAMES = [
  "Priya Raman", "Rahul Sharma", "Ananya Gupta", "Vikram Nair", "Fatima Khan", "Arun Prakash", "Sneha Menon", "Imran Ali",
  "Divya Thomas", "Karthik Venkat", "Neha Joshi", "Rohit Bansal", "Meera Pillai", "Aditya Rao", "Lakshmi Iyer", "Sanjay Patel",
  "Pooja Reddy", "Harish Kumar",
];

export const SEED_BUYERS = NAMES.map((name, i) => {
  const [city, state, pincode] = CITIES[i % CITIES.length];
  const DEMO_EMAILS = ["buyer@kartiva.demo", "rahul@kartiva.demo", "ananya@kartiva.demo", "vikram@kartiva.demo"];
  const email = DEMO_EMAILS[i] ?? `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@example.in`;
  return {
    address: { city, fullName: name, line1: `${10 + i}, ${["MG Road", "Anna Salai", "Park Street", "Linking Road", "Residency Road"][i % 5]}`, line2: "", phone: `98${String(40000000 + i * 1234567).slice(0, 8)}`, pincode, state },
    codBlocked: i === 7, email, id: 100 + i, isActive: i !== 16, joinedAt: new Date(SEED_NOW - (200 - i * 9) * DAY_MS).toISOString(), name,
  };
});

// Small deterministic PRNG so the demo looks the same every time.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms) => new Date(ms).toISOString();

export function buildSeed() {
  const rand = rng(2026);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const storeBySlug = Object.fromEntries(STORES.map((s) => [s.slug, s]));
  const byStore = {};
  PRODUCTS.filter((p) => !p.enquiryOnly).forEach((p) => (byStore[p.storeSlug] ??= []).push(p));
  // TechNest (the main demo seller) gets extra orders so its hub is busy. Enquiry-only dealers get leads, not orders.
  const storeWeights = STORES.filter((s) => byStore[s.slug]).flatMap((s) => Array(s.slug === "technest" ? 4 : 2).fill(s.slug));

  const orders = [];
  const counters = {};
  for (let i = 0; i < 90; i++) {
    const fresh = i < 4; // a few brand-new TechNest orders waiting to be processed
    const ageDays = fresh ? i * 0.15 + 0.05 : Math.pow(rand(), 1.6) * 56; // more recent orders
    const createdMs = SEED_NOW - ageDays * DAY_MS - rand() * 6 * 3_600_000;
    const buyer = i < 3 ? SEED_BUYERS[0] : pick(SEED_BUYERS);
    const paymentMethod = rand() < 0.27 ? "cod" : "online";
    const storeSlugs = fresh ? ["technest", ...(i === 1 ? ["spice-route"] : [])] : [...new Set([pick(storeWeights), ...(rand() < 0.35 ? [pick(storeWeights)] : [])])];
    const d = new Date(createdMs);
    const key = `${String(d.getFullYear()).slice(2)}${d.getMonth() + 1}${d.getDate()}`;
    counters[key] = (counters[key] ?? 0) + 1;
    const number = `KTV-${key}-${(i * 7919 + 104729).toString(36).toUpperCase().slice(-6).padStart(6, "Q")}`;
    const buyerState = stateCodeOf(buyer.address.state);

    const subOrders = storeSlugs.map((slug, si) => {
      const store = storeBySlug[slug];
      const pool = byStore[slug];
      const lines = [];
      const count = rand() < 0.3 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const product = pick(pool);
        const variant = pick(product.variants);
        if (!lines.some((l) => l.variant.id === variant.id)) lines.push({ product, quantity: rand() < 0.2 ? 2 : 1, variant });
      }
      const method = store.shippingMethods.find((m) => m.type === "standard") ?? store.shippingMethods[0];
      const sub = buildSubOrder({ buyerStateCode: buyerState, categories: CATEGORIES, lines, method, number: `${number}-${si + 1}`, rules: COMMISSION_RULES, store });
      // Status by age
      const r = rand();
      const t = (days) => iso(createdMs + days * DAY_MS);
      sub.timeline.push({ at: iso(createdMs), note: paymentMethod === "cod" ? "Order placed (COD)" : "Payment captured", status: "confirmed" });
      if (ageDays > 1.2 && r > 0.06) sub.timeline.push({ at: t(0.6), status: "processing" });
      if (ageDays > 2.5 && r > 0.06) {
        sub.carrier = pick(["Delhivery", "Blue Dart", "Ekart", "DTDC", "India Post"]);
        sub.trackingNumber = `${sub.carrier.slice(0, 2).toUpperCase()}${Math.floor(rand() * 9e9 + 1e9)}`;
        sub.shippedAt = t(1.2);
        sub.timeline.push({ at: sub.shippedAt, note: `${sub.carrier} · ${sub.trackingNumber}`, status: "shipped" });
      }
      if (ageDays > 6 && r > 0.06) {
        sub.deliveredAt = t(Math.min(ageDays - 0.5, 4 + rand() * 2));
        sub.timeline.push({ at: sub.deliveredAt, note: paymentMethod === "cod" ? "Delivered · cash collected" : "Delivered", status: "delivered" });
      }
      if (r <= 0.06) {
        sub.timeline.push({ at: t(0.3), note: "Cancelled by buyer — ordered by mistake", status: "cancelled" });
        sub.cancelReason = "Ordered by mistake";
      }
      sub.status = sub.timeline.at(-1).status;
      return sub;
    });

    const grandTotal = subOrders.reduce((s, x) => s + x.total, 0);
    orders.push({
      address: buyer.address, buyer: { email: buyer.email, name: buyer.name, phone: buyer.address.phone }, createdAt: iso(createdMs),
      gstin: "", grandTotal, number, paymentMethod,
      paymentStatus: paymentMethod === "cod" ? (subOrders.every((s) => s.status === "delivered") ? "cod_collected" : "cod_pending") : "paid",
      subOrders,
    });
  }
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Invoice numbers for shipped sub-orders (gap-free per store per FY).
  const invoiceSeq = {};
  [...orders].reverse().forEach((o) => o.subOrders.forEach((s) => {
    if (!s.shippedAt) return;
    invoiceSeq[s.storeSlug] = (invoiceSeq[s.storeSlug] ?? 0) + 1;
    s.invoiceNumber = `${storeBySlug[s.storeSlug].initials}/26-27/${String(invoiceSeq[s.storeSlug]).padStart(5, "0")}`;
  }));

  // Refunds for cancelled online sub-orders
  const refunds = [];
  orders.forEach((o) => o.subOrders.filter((s) => s.status === "cancelled" && o.paymentMethod === "online").forEach((s) => {
    refunds.push({ amount: s.total, createdAt: s.timeline.at(-1).at, id: refunds.length + 1, method: "gateway", orderNumber: o.number, processedAt: s.timeline.at(-1).at, reason: "buyer_cancelled", status: "processed", storeSlug: s.storeSlug, subOrderNumber: s.number, utr: `rfnd_${(o.number.length * 7919 + refunds.length).toString(36)}` });
    s.refundedAmount = s.total;
  }));

  // Returns on some delivered sub-orders
  const delivered = orders.flatMap((o) => o.subOrders.filter((s) => s.status === "delivered").map((s) => ({ order: o, sub: s })));
  const technestDelivered = delivered.filter((d) => d.sub.storeSlug === "technest");
  const others = delivered.filter((d) => d.sub.storeSlug !== "technest");
  const returnPlan = [
    [technestDelivered[0], "requested", "defective", "Phone heats up a lot while charging and the battery drains in 4 hours."],
    [technestDelivered[1], "approved", "not_as_described", "Colour is different from what was shown on the product page."],
    [technestDelivered[2], "received", "damaged", "Box arrived crushed and the screen has a crack in the corner."],
    [others[0], "rejected", "changed_mind", "Don't need it anymore.", true],
    [others[1], "refunded", "wrong_item", "Received a different size than ordered."],
    [others[2], "requested", "size_fit", "Too small, would like to return."],
  ].filter(([d]) => d);
  const returns = returnPlan.map(([{ order, sub }, status, reasonCode, description, escalated], i) => {
    const item = sub.items[0];
    const createdAt = iso(new Date(sub.deliveredAt).getTime() + 2 * DAY_MS);
    const ret = {
      buyer: order.buyer, createdAt, description, escalated: Boolean(escalated), id: i + 1, items: [{ name: item.name, quantity: 1, variantId: item.variantId, variantLabel: item.variantLabel }],
      number: `RET-${sub.number.slice(4)}`, orderNumber: order.number, paymentMethod: order.paymentMethod, reasonCode,
      refundAmount: item.price, rejectionReason: status === "rejected" ? "Change of mind is not covered for opened electronics." : null, status, storeSlug: sub.storeSlug, subOrderNumber: sub.number,
      timeline: [{ at: createdAt, status: "requested" }],
    };
    if (["approved", "received", "refunded"].includes(status)) ret.timeline.push({ at: iso(new Date(createdAt).getTime() + DAY_MS), status: "approved" });
    if (["received", "refunded"].includes(status)) ret.timeline.push({ at: iso(new Date(createdAt).getTime() + 3 * DAY_MS), status: "received" });
    if (status === "rejected") ret.timeline.push({ at: iso(new Date(createdAt).getTime() + DAY_MS), note: ret.rejectionReason, status: "rejected" });
    if (status === "refunded") {
      ret.timeline.push({ at: iso(new Date(createdAt).getTime() + 4 * DAY_MS), status: "refunded" });
      item.returnedQuantity = 1;
      refunds.push({ amount: item.price, createdAt: ret.timeline.at(-1).at, id: refunds.length + 1, method: order.paymentMethod === "cod" ? "bank_transfer" : "gateway", orderNumber: order.number, processedAt: ret.timeline.at(-1).at, reason: "return", returnId: ret.id, status: "processed", storeSlug: sub.storeSlug, subOrderNumber: sub.number, utr: order.paymentMethod === "cod" ? "UTR8842019" : "rfnd_ret01" });
    }
    return ret;
  });

  // Pending COD refunds queue (bank transfer to buyer)
  orders.filter((o) => o.paymentMethod === "cod").flatMap((o) => o.subOrders.filter((s) => s.status === "delivered").map((s) => ({ o, s }))).slice(3, 6).forEach(({ o, s }) => {
    refunds.push({ amount: Math.round(s.subtotal * 0.5), createdAt: iso(SEED_NOW - 2 * DAY_MS), id: refunds.length + 1, method: "bank_transfer", orderNumber: o.number, payoutTo: `${o.buyer.name.split(" ")[0].toLowerCase()}@okaxis`, processedAt: null, reason: "return", status: "pending", storeSlug: s.storeSlug, subOrderNumber: s.number });
  });

  // One paid settlement per store covering sub-orders whose window closed before 25 Oct
  const cutoff = new Date("2026-10-25T00:00:00+05:30").getTime();
  const settlements = [];
  STORES.forEach((store, i) => {
    const subs = orders.flatMap((o) => o.subOrders.filter((s) => s.storeSlug === store.slug && s.status === "delivered" && new Date(s.deliveredAt).getTime() + 7 * DAY_MS < cutoff).map((s) => ({ o, s })));
    if (!subs.length) return;
    const id = i + 1;
    let net = 0;
    subs.forEach(({ o, s }) => {
      s.settlementId = id;
      const comm = s.commissionAmount;
      net += s.subtotal + s.fee - comm - (comm * PLATFORM.commissionGstRate) / 100 - (s.tax.taxable * PLATFORM.tcsRate) / 100 - (s.subtotal * PLATFORM.tdsRate) / 100 - (o.paymentMethod === "cod" ? s.total : 0);
    });
    settlements.push({
      createdAt: iso(cutoff + DAY_MS), id, net: Math.round(net * 100) / 100, number: `STL-${String(40 + id).padStart(4, "0")}`, paidAt: iso(cutoff + 2 * DAY_MS),
      periodEnd: "2026-10-24", status: net > 0 ? "paid" : "carried_forward", storeSlug: store.slug, subOrderNumbers: subs.map(({ s }) => s.number),
      utr: net > 0 ? `HDFC${String(918273 + id * 1111).padStart(10, "0")}` : null,
    });
  });

  const auditLog = [
    { action: "settings.updated", actor: "Kavya Iyer", at: iso(SEED_NOW - 9 * DAY_MS), details: "COD max order value ₹8,000 → ₹10,000", target: "Platform settings" },
    { action: "seller.approved", actor: "Kavya Iyer", at: iso(SEED_NOW - 9 * DAY_MS), details: "Bamboo Basket Co. approved", target: "Seller application #104" },
    { action: "commission.updated", actor: "Kavya Iyer", at: iso(SEED_NOW - 12 * DAY_MS), details: "TechNest India store rate set to 8%", target: "Commission rule #5" },
    { action: "settlement.paid", actor: "Kavya Iyer", at: iso(cutoff + 2 * DAY_MS), details: "Weekly settlements paid for 9 stores", target: "Settlements" },
    { action: "ad.created", actor: "Kavya Iyer", at: iso(SEED_NOW - 11 * DAY_MS), details: "Hero carousel slide for Zenvo Audio (external)", target: "Ad #6" },
  ].map((e, i) => ({ ...e, id: i + 1 }));

  return { auditLog, buyers: SEED_BUYERS, commissionRules: COMMISSION_RULES, orders, refunds, returns, settlements };
}
