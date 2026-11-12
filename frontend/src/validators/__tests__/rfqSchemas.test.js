import { describe, expect, it } from "vitest";

import { EN } from "@/locales";

import { createQuoteSchema } from "../createQuoteSchema";
import { createRfqSchema } from "../createRfqSchema";

const errorsOf = async (schema, values) => {
  try {
    await schema.validate(values, { abortEarly: false });
    return {};
  } catch (err) {
    return Object.fromEntries(err.inner.map((e) => [e.path, e.message]));
  }
};
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// Same message bags the pages pass (SellerRfqs.jsx / PostRequirement.jsx).
const QUOTE_V = { ...EN.VALIDATION, ...EN.SELLER_HUB.VALIDATION, ...EN.SELLER_PRO.VALIDATION };
const RFQ_V = { ...EN.VALIDATION, ...EN.BUYER_HUB.VALIDATION };

describe("message bags", () => {
  it("define every message key the schemas use", () => {
    for (const key of ["DATE_FUTURE", "LEAD_TIME", "NUMBER", "POSITIVE", "REQUIRED", "TOO_LONG"]) expect(QUOTE_V[key], key).toBeTypeOf("string");
    for (const key of ["DATE_FUTURE", "MESSAGE_SHORT", "NAME_SHORT", "PRICE_INVALID", "QTY_MAX", "QTY_MIN", "REQUIRED", "TITLE_SHORT"]) expect(RFQ_V[key], key).toBeTypeOf("string");
  });
});

describe("createQuoteSchema", () => {
  const schema = createQuoteSchema(QUOTE_V);
  const valid = { leadTimeDays: 7, note: "Ex-works Surat", pricePerUnit: 125.5, validTill: daysFromNow(10) };

  it("accepts a valid quote (numbers as form strings too)", async () => {
    expect(await errorsOf(schema, valid)).toEqual({});
    expect(await schema.isValid({ ...valid, leadTimeDays: "7", pricePerUnit: "125.5" })).toBe(true);
  });

  it("rejects bad numbers and lead times", async () => {
    expect(await errorsOf(schema, { ...valid, leadTimeDays: 0, pricePerUnit: -1 })).toEqual({ leadTimeDays: QUOTE_V.LEAD_TIME, pricePerUnit: QUOTE_V.POSITIVE });
    expect(await errorsOf(schema, { ...valid, leadTimeDays: 366 })).toEqual({ leadTimeDays: QUOTE_V.LEAD_TIME });
    expect(await errorsOf(schema, { ...valid, leadTimeDays: 2.5 })).toEqual({ leadTimeDays: QUOTE_V.LEAD_TIME });
    expect(await errorsOf(schema, { ...valid, pricePerUnit: "abc" })).toEqual({ pricePerUnit: QUOTE_V.NUMBER });
  });

  it("requires a future validity date and caps the note", async () => {
    expect(await errorsOf(schema, { ...valid, validTill: "2020-01-01" })).toEqual({ validTill: QUOTE_V.DATE_FUTURE });
    expect(await errorsOf(schema, { ...valid, validTill: "" })).toEqual({ validTill: QUOTE_V.REQUIRED });
    expect(await errorsOf(schema, { ...valid, note: "x".repeat(1001) })).toEqual({ note: QUOTE_V.TOO_LONG });
  });
});

describe("createRfqSchema", () => {
  const schema = createRfqSchema(RFQ_V);
  const valid = {
    categorySlug: "fashion", deliveryCity: "Pune", details: "Cotton kurtas, assorted sizes, 200 GSM", quantity: 500,
    requiredBy: daysFromNow(14), targetPrice: "", title: "500 cotton kurtas", unit: "pieces",
  };

  it("accepts a valid request with an empty optional target price", async () => {
    expect(await errorsOf(schema, valid)).toEqual({});
    expect(await schema.isValid({ ...valid, targetPrice: 250 })).toBe(true);
  });

  it("validates quantity bounds", async () => {
    expect(await errorsOf(schema, { ...valid, quantity: 0 })).toEqual({ quantity: RFQ_V.QTY_MIN });
    expect(await errorsOf(schema, { ...valid, quantity: 1_000_001 })).toEqual({ quantity: RFQ_V.QTY_MAX });
    expect(await errorsOf(schema, { ...valid, quantity: "lots" })).toEqual({ quantity: RFQ_V.QTY_MIN });
  });

  it("rejects short text, a bad target price and a past/today date", async () => {
    expect(await errorsOf(schema, { ...valid, details: "short", targetPrice: 0, title: "abc" })).toEqual({
      details: RFQ_V.MESSAGE_SHORT, targetPrice: RFQ_V.PRICE_INVALID, title: RFQ_V.TITLE_SHORT,
    });
    expect(await errorsOf(schema, { ...valid, requiredBy: new Date().toISOString().slice(0, 10) })).toEqual({ requiredBy: RFQ_V.DATE_FUTURE });
  });
});
