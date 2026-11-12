import * as yup from "yup";

// Seller business profile (Alibaba-style company profile). v = { ...EN.VALIDATION, ...EN.SELLER_PRO.VALIDATION }
export const createBusinessProfileSchema = (v) =>
  yup.object({
    annualTurnover: yup.string().required(v.REQUIRED),
    businessType: yup.string().required(v.REQUIRED),
    contactPerson: yup.string().trim().min(2, v.NAME_SHORT).max(80).required(v.REQUIRED),
    description: yup.string().trim().max(1500, v.TOO_LONG),
    employees: yup.string().required(v.REQUIRED),
    mainMarkets: yup.string().trim().required(v.REQUIRED),
    phone: yup.string().trim().matches(/^\+?[\d\s-]{10,16}$/, v.PHONE_ANY).required(v.REQUIRED),
    yearEstablished: yup.number().typeError(v.YEAR_INVALID).integer(v.YEAR_INVALID).min(1900, v.YEAR_INVALID).max(new Date().getFullYear(), v.YEAR_INVALID).required(v.REQUIRED),
  });
