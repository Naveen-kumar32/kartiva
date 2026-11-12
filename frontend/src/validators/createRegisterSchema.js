import * as yup from "yup";

import { GSTIN_PATTERN, PAN_PATTERN } from "@/constants/business";

// accountType "seller" adds the business fields (Sell on Kartiva). The server re-validates everything.
const forSeller = (schema) => yup.mixed().when("accountType", { is: "seller", otherwise: (s) => s.notRequired(), then: () => schema });

export const createRegisterSchema = (v) =>
  yup.object({
    accountType: yup.string().oneOf(["buyer", "seller"]).required(),
    businessName: forSeller(yup.string().trim().min(3, v.NAME_SHORT).required(v.REQUIRED)),
    businessType: forSeller(yup.string().required(v.REQUIRED)),
    category: forSeller(yup.string().required(v.REQUIRED)),
    city: forSeller(yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED)),
    confirmPassword: yup.string().oneOf([yup.ref("password")], v.PASSWORD_MISMATCH).required(v.REQUIRED),
    email: yup.string().trim().email(v.EMAIL_INVALID).required(v.REQUIRED),
    firstName: yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED),
    gstin: forSeller(yup.string().trim().uppercase().matches(GSTIN_PATTERN, v.GSTIN_INVALID).required(v.REQUIRED)),
    lastName: yup.string().trim(),
    pan: forSeller(yup.string().trim().uppercase().matches(PAN_PATTERN, v.PAN_INVALID).required(v.REQUIRED)),
    password: yup.string().min(8, v.PASSWORD_MIN).matches(/^(?=.*[A-Za-z])(?=.*\d)/, v.PASSWORD_WEAK).required(v.REQUIRED),
    phone: yup.string().matches(/^[6-9]\d{9}$/, v.PHONE_INVALID).required(v.REQUIRED),
    state: forSeller(yup.string().required(v.REQUIRED)),
    terms: forSeller(yup.boolean().oneOf([true], v.TERMS_REQUIRED).required(v.TERMS_REQUIRED)),
    yearEstablished: forSeller(yup.number().typeError(v.YEAR_INVALID).integer(v.YEAR_INVALID).min(1900, v.YEAR_INVALID).max(new Date().getFullYear(), v.YEAR_INVALID).required(v.REQUIRED)),
  });
