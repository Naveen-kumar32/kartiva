import * as yup from "yup";

// Post your requirement (buy request). v = { ...EN.VALIDATION, ...EN.BUYER_HUB.VALIDATION }.
export const createRfqSchema = (v) =>
  yup.object({
    categorySlug: yup.string().required(v.REQUIRED),
    deliveryCity: yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED),
    details: yup.string().trim().min(10, v.MESSAGE_SHORT).max(2000).required(v.REQUIRED),
    quantity: yup.number().typeError(v.QTY_MIN).integer(v.QTY_MIN).min(1, v.QTY_MIN).max(1000000, v.QTY_MAX).required(v.REQUIRED),
    requiredBy: yup.string().required(v.REQUIRED).test("future", v.DATE_FUTURE, (val) => !val || val > new Date().toISOString().slice(0, 10)),
    targetPrice: yup.number().typeError(v.PRICE_INVALID).min(1, v.PRICE_INVALID).notRequired().transform((val, raw) => (raw === "" ? undefined : val)),
    title: yup.string().trim().min(5, v.TITLE_SHORT).max(120).required(v.REQUIRED),
    unit: yup.string().required(v.REQUIRED),
  });
