import { describe, expect, it } from "vitest";

import { MAX_PER_LINE } from "@/constants/catalog";

import { BULK_MAX_PER_LINE, maxQtyFor, nextTierFor } from "../cart";

const retail = { moq: 1, priceTiers: [] };
const wholesale = { moq: 1, priceTiers: [{ discountPct: 5, minQty: 10 }, { discountPct: 12, minQty: 100 }] };
const moqOnly = { moq: 20, priceTiers: [] };

describe("maxQtyFor", () => {
  it("caps retail lines at MAX_PER_LINE", () => {
    expect(maxQtyFor(retail, { stock: 1000 })).toBe(MAX_PER_LINE);
  });

  it("allows bulk quantities for slab-priced or MOQ products", () => {
    expect(maxQtyFor(wholesale, { stock: 10_000 })).toBe(BULK_MAX_PER_LINE);
    expect(maxQtyFor(moqOnly, { stock: 10_000 })).toBe(BULK_MAX_PER_LINE);
  });

  it("never exceeds stock and never goes negative", () => {
    expect(maxQtyFor(wholesale, { stock: 42 })).toBe(42);
    expect(maxQtyFor(retail, { stock: -3 })).toBe(0);
    expect(maxQtyFor(retail, undefined)).toBe(MAX_PER_LINE);
  });
});

describe("nextTierFor", () => {
  const variant = { price: 200 };

  it("returns the next cheaper slab with the quantity still needed", () => {
    expect(nextTierFor(wholesale, variant, 4)).toEqual({ addQty: 6, discountPct: 5, minQty: 10, unitPrice: 190 });
    expect(nextTierFor(wholesale, variant, 10)).toEqual({ addQty: 90, discountPct: 12, minQty: 100, unitPrice: 176 });
  });

  it("returns null at the top slab or without slabs", () => {
    expect(nextTierFor(wholesale, variant, 100)).toBeNull();
    expect(nextTierFor(retail, variant, 1)).toBeNull();
  });
});
