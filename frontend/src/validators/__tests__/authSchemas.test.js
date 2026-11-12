import { describe, expect, it } from "vitest";

import { EN } from "@/locales";

import { createLoginSchema } from "../createLoginSchema";
import { createRegisterSchema } from "../createRegisterSchema";

const V = EN.VALIDATION;
const errorsOf = async (schema, values) => {
  try {
    await schema.validate(values, { abortEarly: false });
    return {};
  } catch (err) {
    return Object.fromEntries(err.inner.map((e) => [e.path, e.message]));
  }
};

describe("createLoginSchema", () => {
  const schema = createLoginSchema(V);

  it("accepts a valid email + password (trimming the email)", async () => {
    expect(await schema.isValid({ email: "  buyer@kartiva.in ", password: "x" })).toBe(true);
  });

  it("reports localized messages for missing/invalid fields", async () => {
    expect(await errorsOf(schema, { email: "not-an-email", password: "" })).toEqual({ email: V.EMAIL_INVALID, password: V.REQUIRED });
  });
});

describe("createRegisterSchema", () => {
  const schema = createRegisterSchema(V);
  const buyer = {
    accountType: "buyer", confirmPassword: "secret123", email: "asha@example.com", firstName: "Asha", password: "secret123", phone: "9876543210",
  };
  const seller = {
    ...buyer, accountType: "seller", businessName: "Asha Textiles", businessType: "manufacturer", category: "fashion", city: "Surat",
    gstin: "24AAPFU0939F1ZV", pan: "AAPFU0939F", state: "GJ", terms: true, yearEstablished: 2015,
  };

  it("accepts a buyer without any business fields", async () => {
    expect(await errorsOf(schema, buyer)).toEqual({});
  });

  it("ignores junk business fields for buyers", async () => {
    expect(await schema.isValid({ ...buyer, gstin: "nope", pan: "nope" })).toBe(true);
  });

  it("requires business fields, GSTIN and PAN for sellers", async () => {
    const errors = await errorsOf(schema, { ...buyer, accountType: "seller", terms: false });
    for (const field of ["businessName", "businessType", "category", "city", "gstin", "pan", "state", "yearEstablished"]) {
      expect(errors[field], field).toBe(V.REQUIRED);
    }
    expect(errors.terms).toBe(V.TERMS_REQUIRED);
  });

  // Gap: yup.boolean().oneOf([true]) lets `undefined` through (no .required()), so a seller payload that
  // omits `terms` validates. The Register form seeds terms: false, so the UI is unaffected. Flip once fixed.
  it("rejects a seller that omits the terms flag entirely", async () => {
    const { terms: _omit, ...noTerms } = seller;
    expect(await errorsOf(schema, noTerms)).toEqual({ terms: V.TERMS_REQUIRED });
  });

  it("accepts a complete seller and upper-cases GSTIN/PAN", async () => {
    expect(await errorsOf(schema, seller)).toEqual({});
    const cast = await schema.validate({ ...seller, gstin: " 24aapfu0939f1zv ", pan: "aapfu0939f" });
    expect(cast.gstin).toBe("24AAPFU0939F1ZV");
    expect(cast.pan).toBe("AAPFU0939F");
  });

  it("rejects malformed GSTIN and PAN for sellers", async () => {
    const errors = await errorsOf(schema, { ...seller, gstin: "24AAPFU0939F1XV", pan: "ABCDE12345" });
    expect(errors).toEqual({ gstin: V.GSTIN_INVALID, pan: V.PAN_INVALID });
  });

  it("rejects a future establishment year", async () => {
    const errors = await errorsOf(schema, { ...seller, yearEstablished: new Date().getFullYear() + 1 });
    expect(errors).toEqual({ yearEstablished: V.YEAR_INVALID });
  });

  it("enforces password strength, confirmation and Indian mobile numbers", async () => {
    expect(await errorsOf(schema, { ...buyer, confirmPassword: "abcdefgh", password: "abcdefgh" })).toEqual({ password: V.PASSWORD_WEAK });
    expect(await errorsOf(schema, { ...buyer, confirmPassword: "a1", password: "a1" })).toEqual({ password: V.PASSWORD_MIN });
    expect(await errorsOf(schema, { ...buyer, confirmPassword: "secret124" })).toEqual({ confirmPassword: V.PASSWORD_MISMATCH });
    expect(await errorsOf(schema, { ...buyer, phone: "5876543210" })).toEqual({ phone: V.PHONE_INVALID });
    expect(await errorsOf(schema, { ...buyer, phone: "98765" })).toEqual({ phone: V.PHONE_INVALID });
  });
});
