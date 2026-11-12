import * as yup from "yup";

export const createAdvertiseSchema = (v) =>
  yup.object({
    company: yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED),
    email: yup.string().trim().email(v.EMAIL_INVALID).required(v.REQUIRED),
    phone: yup.string().matches(/^[6-9]\d{9}$/, v.PHONE_INVALID).required(v.REQUIRED),
    slot: yup.string().required(v.REQUIRED),
  });
