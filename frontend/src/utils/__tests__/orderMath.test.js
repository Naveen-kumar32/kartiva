import { describe, expect, it } from "vitest";

import { amountInWords, buildSubOrder, computeLedger, DAY_MS, methodFee, resolveCommissionRate } from "../orderMath";

const categories = [
  { id: 1, parentId: null, slug: "electronics" },
  { id: 2, parentId: 1, slug: "phones" },
  { id: 3, parentId: 2, slug: "smartphones" },
  { id: 4, parentId: null, slug: "fashion" },
];
const rules = [
  { rate: 8, scope: "global" },
  { categorySlug: "electronics", rate: 6, scope: "category" },
  { categorySlug: "phones", isActive: false, rate: 20, scope: "category" },
  { rate: 4, scope: "store", storeSlug: "acme" },
];

describe("resolveCommissionRate", () => {
  it("prefers a store override", () => {
    expect(resolveCommissionRate(rules, { categorySlug: "smartphones", storeSlug: "acme" }, categories)).toBe(4);
  });

  it("walks up category ancestors, skipping inactive rules", () => {
    expect(resolveCommissionRate(rules, { categorySlug: "smartphones", storeSlug: "other" }, categories)).toBe(6);
  });

  it("uses the category's own rule before its ancestors", () => {
    const withLeaf = [...rules, { categorySlug: "smartphones", rate: 7, scope: "category" }];
    expect(resolveCommissionRate(withLeaf, { categorySlug: "smartphones", storeSlug: "other" }, categories)).toBe(7);
  });

  it("falls back to the global rule, then to 10%", () => {
    expect(resolveCommissionRate(rules, { categorySlug: "fashion", storeSlug: "other" }, categories)).toBe(8);
    expect(resolveCommissionRate(rules, { categorySlug: "unknown", storeSlug: "other" }, categories)).toBe(8);
    expect(resolveCommissionRate([], { categorySlug: "fashion", storeSlug: "other" }, categories)).toBe(10);
  });

  it("ignores an inactive store override", () => {
    const off = rules.map((r) => (r.scope === "store" ? { ...r, isActive: false } : r));
    expect(resolveCommissionRate(off, { categorySlug: "smartphones", storeSlug: "acme" }, categories)).toBe(6);
  });
});

describe("methodFee", () => {
  it("is free at or above the threshold", () => {
    const m = { fee: 100, freeAbove: 5000 };
    expect(methodFee(m, 4999)).toBe(100);
    expect(methodFee(m, 5000)).toBe(0);
    expect(methodFee({ fee: 60, freeAbove: null }, 1e6)).toBe(60);
  });
});

describe("buildSubOrder", () => {
  const store = { gstStateCode: "27", name: "Acme Traders", slug: "other" };
  const product = {
    categorySlug: "smartphones", gstRate: 18, hsnCode: "8517", id: 11, isReturnable: true, name: "Phone",
    priceTiers: [{ discountPct: 10, minQty: 10 }], thumbnail: "x.webp",
  };
  const variant = { attributes: { color: "Black", size: "M" }, id: 101, mrp: 1500, price: 1180, sku: "PH-BLK-M" };
  const method = { codAllowed: true, fee: 100, freeAbove: 5000, id: "std", maxDays: 5, minDays: 2, name: "Standard", type: "courier" };
  const build = (buyerStateCode, quantity) =>
    buildSubOrder({ buyerStateCode, categories, lines: [{ product, quantity, variant }], method, number: "KV-1-A", rules, store });

  it("splits CGST + SGST for an intra-state buyer", () => {
    const sub = build("27", 2);
    expect(sub.interstate).toBe(false);
    expect(sub.items[0]).toMatchObject({ cgst: 180, igst: 0, lineTotal: 2360, price: 1180, sgst: 180, taxable: 2000, tierDiscountPct: 0, variantLabel: "Black / M" });
    expect(sub.tax).toEqual({ cgst: 180, igst: 0, sgst: 180, taxable: 2000 });
  });

  it("charges IGST for an inter-state buyer", () => {
    const sub = build("29", 2);
    expect(sub.interstate).toBe(true);
    expect(sub.tax).toEqual({ cgst: 0, igst: 360, sgst: 0, taxable: 2000 });
  });

  it("snapshots the resolved commission rate and amount", () => {
    const sub = build("27", 2);
    expect(sub.items[0].commissionRate).toBe(6);
    expect(sub.items[0].commissionAmount).toBe(141.6);
    expect(sub.commissionAmount).toBe(141.6);
  });

  it("adds the shipping fee below the free threshold", () => {
    const sub = build("27", 2);
    expect(sub).toMatchObject({ fee: 100, status: "confirmed", subtotal: 2360, total: 2460 });
    expect(sub.method).toEqual({ codAllowed: true, id: "std", maxDays: 5, minDays: 2, name: "Standard", type: "courier" });
  });

  it("uses the slab price, so tax, commission and free shipping follow the discounted total", () => {
    const sub = build("29", 10);
    expect(sub.items[0]).toMatchObject({ listPrice: 1180, price: 1062, tierDiscountPct: 10, lineTotal: 10620, igst: 1620, taxable: 9000 });
    expect(sub.commissionAmount).toBe(637.2);
    expect(sub.fee).toBe(0);
    expect(sub.total).toBe(10620);
  });
});

describe("computeLedger", () => {
  const now = Date.parse("2026-11-12T00:00:00Z");
  const platform = { commissionGstRate: 18, tcsRate: 1, tdsRate: 1 };
  const sub = (number, daysAgo, extra = {}) => ({
    commissionAmount: 141.6, deliveredAt: new Date(now - daysAgo * DAY_MS).toISOString(), fee: 100, number, settlementId: null,
    status: "delivered", storeSlug: "acme", subtotal: 2360, tax: { taxable: 2000 }, total: 2460, ...extra,
  });
  const base = { ads: [], now, platform, refunds: [], settlements: [], storeSlug: "acme" };

  it("credits a sale after the return window with negative commission/GST/TCS/TDS", () => {
    const { balance, entries, pending } = computeLedger({ ...base, orders: [{ paymentMethod: "upi", subOrders: [sub("S1", 10)] }] });
    const byType = Object.fromEntries(entries.map((e) => [e.type, e.amount]));
    expect(byType).toEqual({ commission: -141.6, commission_gst: -25.49, sale: 2360, shipping: 100, tcs: -20, tds: -23.6 });
    expect(balance).toBe(2249.31);
    expect(pending).toBe(0);
  });

  it("debits the full total when the seller collected COD cash", () => {
    const { balance, entries } = computeLedger({ ...base, orders: [{ paymentMethod: "cod", subOrders: [sub("S1", 10)] }] });
    expect(entries.find((e) => e.type === "cod_collected_by_seller").amount).toBe(-2460);
    expect(balance).toBe(-210.69);
  });

  it("keeps in-window sales as pending (net of commission) and skips zero fees", () => {
    const { entries, pending } = computeLedger({ ...base, orders: [{ paymentMethod: "upi", subOrders: [sub("S2", 2), sub("S3", 10, { fee: 0 })] }] });
    expect(pending).toBe(2318.4);
    expect(entries.some((e) => e.subOrderNumber === "S2")).toBe(false);
    expect(entries.some((e) => e.type === "shipping")).toBe(false);
  });

  it("ignores other stores and non-delivered sub-orders", () => {
    const orders = [{ paymentMethod: "upi", subOrders: [sub("X1", 10, { storeSlug: "zeta" }), sub("X2", 10, { status: "shipped" })] }];
    expect(computeLedger({ ...base, orders })).toEqual({ balance: 0, entries: [], pending: 0 });
  });

  it("applies refunds, ad spend and payouts; entries sorted newest first", () => {
    const { balance, entries, pending } = computeLedger({
      ...base,
      ads: [{ advertiserType: "seller", headline: "Diwali", spend: 200, startsAt: "2026-11-01", storeSlug: "acme" }, { advertiserType: "brand", spend: 999, startsAt: "2026-11-01", storeSlug: "acme" }],
      orders: [{ paymentMethod: "upi", subOrders: [sub("S1", 10), sub("S2", 2)] }],
      refunds: [
        { amount: 500, processedAt: "2026-11-05T00:00:00Z", status: "processed", storeSlug: "acme", subOrderNumber: "S1" },
        { amount: 300, processedAt: "2026-11-11T00:00:00Z", status: "processed", storeSlug: "acme", subOrderNumber: "S2" },
        { amount: 999, status: "requested", storeSlug: "acme", subOrderNumber: "S1" },
        { amount: 999, processedAt: "2026-11-05T00:00:00Z", status: "processed", storeSlug: "acme", subOrderNumber: "NEVER-DELIVERED" },
      ],
      settlements: [{ id: 9, net: 1000, number: "ST-1", paidAt: "2026-11-10T00:00:00Z", status: "paid", storeSlug: "acme", utr: "UTR1" }, { net: 50, status: "pending", storeSlug: "acme" }],
    });
    expect(entries.filter((e) => e.type === "refund").map((e) => e.amount)).toEqual([-500]);
    expect(entries.filter((e) => e.type === "ad_charge").map((e) => e.amount)).toEqual([-200]);
    expect(entries.filter((e) => e.type === "payout")).toEqual([expect.objectContaining({ amount: -1000, settlementId: 9 })]);
    expect(pending).toBe(2018.4);
    expect(balance).toBe(549.31); // 2249.31 - 500 - 200 - 1000
    const dates = entries.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("amountInWords", () => {
  it("writes rupees and paise in the Indian system", () => {
    expect(amountInWords(110399.5)).toBe("Rupees One Lakh Ten Thousand Three Hundred Ninety Nine and Fifty Paise Only");
    expect(amountInWords(12345678)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
  });

  it("handles zero, round numbers and small paise", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(100)).toBe("Rupees One Hundred Only");
    expect(amountInWords(1000.07)).toBe("Rupees One Thousand and Seven Paise Only");
    expect(amountInWords(20)).toBe("Rupees Twenty Only");
  });

  // BUG: paise are rounded independently of rupees, so a fraction >= .995 becomes "100 paise"
  // and twoDigits(100) yields "undefined". Expected "Rupees Two Only". Flip to `it` once fixed.
  it("rolls over to the next rupee when paise round to 100", () => {
    expect(amountInWords(1.999)).toBe("Rupees Two Only");
  });
});
