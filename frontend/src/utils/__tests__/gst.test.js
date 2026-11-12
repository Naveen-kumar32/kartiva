import { describe, expect, it } from "vitest";

import { splitGst } from "../gst";

describe("splitGst (GST-inclusive prices)", () => {
  it("splits intra-state tax evenly into CGST + SGST", () => {
    expect(splitGst(1180, 18, false)).toEqual({ cgst: 90, igst: 0, sgst: 90, tax: 180, taxable: 1000 });
  });

  it("puts the whole tax into IGST for inter-state supply", () => {
    expect(splitGst(1180, 18, true)).toEqual({ cgst: 0, igst: 180, sgst: 0, tax: 180, taxable: 1000 });
  });

  it("rounds to paise and keeps cgst + sgst === tax on odd amounts", () => {
    const r = splitGst(101, 18, false);
    expect(r.taxable).toBe(85.59);
    expect(r.tax).toBe(15.41);
    expect(r.cgst + r.sgst).toBeCloseTo(r.tax, 10);
    expect(r.taxable + r.tax).toBeCloseTo(101, 10);
  });

  it("handles a 0% rate", () => {
    expect(splitGst(500, 0, false)).toEqual({ cgst: 0, igst: 0, sgst: 0, tax: 0, taxable: 500 });
  });
});
