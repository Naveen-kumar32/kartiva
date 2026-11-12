import * as yup from "yup";

// v = { ...EN.VALIDATION, ...EN.SELLER_HUB.VALIDATION, ...EN.SELLER_PRO.VALIDATION }
export const createProductSchema = (v) =>
  yup.object({
    brand: yup.string().trim().required(v.REQUIRED),
    categorySlug: yup.string().required(v.CATEGORY_REQUIRED),
    description: yup.string().trim().min(20, v.DESCRIPTION_MIN).required(v.REQUIRED),
    enquiryOnly: yup.boolean(),
    gstRate: yup.number().typeError(v.REQUIRED).required(v.REQUIRED),
    hsnCode: yup.string().trim().matches(/^\d{4,8}$/, v.HSN_INVALID).required(v.REQUIRED),
    moq: yup.number().typeError(v.NUMBER).integer(v.MOQ_MIN).min(1, v.MOQ_MIN).required(v.REQUIRED),
    name: yup.string().trim().min(3, v.NAME_SHORT).max(200).required(v.REQUIRED),
    // Wholesale slabs (only when bulkPricing is on): up to 3, strictly increasing quantities, 1–60% off
    priceTiers: yup.array().when("bulkPricing", {
      is: true,
      otherwise: (s) => s.notRequired(),
      then: (s) => s.min(1, v.TIER_REQUIRED).max(3).of(yup.object({
        discountPct: yup.number().typeError(v.NUMBER).min(1, v.TIER_DISCOUNT).max(60, v.TIER_DISCOUNT).required(v.REQUIRED),
        minQty: yup.number().typeError(v.NUMBER).integer(v.TIER_QTY).min(2, v.TIER_QTY).required(v.REQUIRED),
      })).test("increasing", v.TIER_INCREASING, (tiers) => (tiers ?? []).every((t, i) => i === 0 || Number(t.minQty) > Number(tiers[i - 1].minQty))),
    }),
    variants: yup.array().min(1, v.VARIANT_REQUIRED).of(yup.object({
      mrp: yup.number().typeError(v.NUMBER).positive(v.POSITIVE).required(v.REQUIRED),
      price: yup.number().typeError(v.NUMBER).positive(v.POSITIVE).required(v.REQUIRED)
        .test("lte-mrp", v.PRICE_ABOVE_MRP, function lteMrp(price) { return price == null || this.parent.mrp == null || Number(price) <= Number(this.parent.mrp); }),
      sku: yup.string().trim().matches(/^[A-Za-z0-9-_]{3,40}$/, v.SKU_INVALID).required(v.REQUIRED),
      stock: yup.number().typeError(v.NUMBER).integer(v.NUMBER).min(0, v.POSITIVE).required(v.REQUIRED),
    })),
  });
