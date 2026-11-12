import * as yup from "yup";

// Seller quote on a buy request (RFQ). v = { ...EN.VALIDATION, ...EN.SELLER_PRO.VALIDATION }
export const createQuoteSchema = (v) =>
  yup.object({
    leadTimeDays: yup.number().typeError(v.NUMBER).integer(v.LEAD_TIME).min(1, v.LEAD_TIME).max(365, v.LEAD_TIME).required(v.REQUIRED),
    note: yup.string().trim().max(1000, v.TOO_LONG),
    pricePerUnit: yup.number().typeError(v.NUMBER).positive(v.POSITIVE).max(100000000, v.POSITIVE).required(v.REQUIRED),
    validTill: yup.string().required(v.REQUIRED).test("future", v.DATE_FUTURE, (d) => !d || new Date(`${d}T23:59:59`).getTime() > Date.now()),
  });
