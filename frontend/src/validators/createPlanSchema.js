import * as yup from "yup";

// v = EN.VALIDATION, m = EN.ADMIN_PRO.PLANS.VALIDATION
export const createPlanSchema = (v, m) =>
  yup.object({
    commissionDiscount: yup.number().typeError(m.DISCOUNT_RANGE).min(0, m.DISCOUNT_RANGE).max(10, m.DISCOUNT_RANGE).required(v.REQUIRED),
    features: yup.string().trim().required(v.REQUIRED),
    leadCredits: yup.number().transform((val, orig) => (orig === "" || orig == null ? null : val)).nullable().typeError(m.CREDITS_INVALID).integer(m.CREDITS_INVALID).min(0, m.CREDITS_INVALID),
    name: yup.string().trim().min(2, v.NAME_SHORT).max(40).required(v.REQUIRED),
    priceYearly: yup.number().typeError(m.PRICE_INVALID).min(0, m.PRICE_INVALID).max(1000000, m.PRICE_INVALID).required(v.REQUIRED),
  });
