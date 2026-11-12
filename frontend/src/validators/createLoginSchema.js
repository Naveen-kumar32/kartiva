import * as yup from "yup";

export const createLoginSchema = (v) =>
  yup.object({
    email: yup.string().trim().email(v.EMAIL_INVALID).required(v.REQUIRED),
    password: yup.string().required(v.REQUIRED),
  });
