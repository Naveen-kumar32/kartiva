import { describe, expect, it } from "vitest";

import { minOrderQty, priceTiersOf, tierFor, tierUnitPrice, unitPriceFor } from "../pricing";

const product = { moq: 1, priceTiers: [{ discountPct: 10, minQty: 50 }, { discountPct: 5, minQty: 10 }] };
const variant = { price: 999 };

describe("priceTiersOf", () => {
  it("sorts tiers by minQty ascending without mutating the product", () => {
    expect(priceTiersOf(product).map((t) => t.minQty)).toEqual([10, 50]);
    expect(product.priceTiers[0].minQty).toBe(50);
  });

  it("returns an empty list for products without tiers", () => {
    expect(priceTiersOf({})).toEqual([]);
    expect(priceTiersOf(null)).toEqual([]);
  });
});

describe("tierFor", () => {
  it("returns null below the first slab", () => {
    expect(tierFor(product, 9)).toBeNull();
  });

  it("picks the highest slab reached (boundaries inclusive)", () => {
    expect(tierFor(product, 10)).toEqual({ discountPct: 5, minQty: 10 });
    expect(tierFor(product, 49).discountPct).toBe(5);
    expect(tierFor(product, 50).discountPct).toBe(10);
    expect(tierFor(product, 5000).discountPct).toBe(10);
  });

  it("returns null when the product has no tiers", () => {
    expect(tierFor({ priceTiers: [] }, 100)).toBeNull();
  });
});

describe("tierUnitPrice / unitPriceFor", () => {
  it("keeps the base price without a tier", () => {
    expect(tierUnitPrice(999, null)).toBe(999);
    expect(unitPriceFor(product, variant, 1)).toBe(999);
  });

  it("applies the slab discount and rounds to whole rupees", () => {
    expect(unitPriceFor(product, variant, 10)).toBe(949); // 949.05
    expect(unitPriceFor(product, variant, 50)).toBe(899); // 899.1
    expect(tierUnitPrice(105, { discountPct: 10 })).toBe(95); // 94.5 rounds up
  });
});

describe("minOrderQty", () => {
  it("defaults to 1 and never goes below 1", () => {
    expect(minOrderQty(undefined)).toBe(1);
    expect(minOrderQty({})).toBe(1);
    expect(minOrderQty({ moq: 0 })).toBe(1);
    expect(minOrderQty({ moq: 25 })).toBe(25);
  });
});
