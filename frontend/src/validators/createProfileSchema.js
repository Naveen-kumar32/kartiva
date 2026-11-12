import * as yup from "yup";

import { GSTIN_PATTERN } from "@/constants/business";

// Buyer profile + optional B2B invoice details. v = EN.VALIDATION.
export const createProfileSchema = (v) =>
  yup.object({
    businessName: yup.string().trim().max(120),
    city: yup.string().trim().max(60),
    firstName: yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED),
    gstin: yup.string().trim().uppercase().test("gstin", v.GSTIN_INVALID, (val) => !val || GSTIN_PATTERN.test(val)),
    lastName: yup.string().trim().max(40),
    phone: yup.string().trim().matches(/^[6-9]\d{9}$/, v.PHONE_INVALID).required(v.REQUIRED),
  });
