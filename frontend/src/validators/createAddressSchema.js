import * as yup from "yup";

export const createAddressSchema = (v) =>
  yup.object({
    city: yup.string().trim().required(v.REQUIRED),
    fullName: yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED),
    gstin: yup.string().trim().matches(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, v.GSTIN_INVALID),
    line1: yup.string().trim().required(v.REQUIRED),
    line2: yup.string().trim(),
    phone: yup.string().matches(/^[6-9]\d{9}$/, v.PHONE_INVALID).required(v.REQUIRED),
    pincode: yup.string().matches(/^[1-9]\d{5}$/, v.PINCODE_INVALID).required(v.REQUIRED),
    state: yup.string().required(v.REQUIRED),
  });
