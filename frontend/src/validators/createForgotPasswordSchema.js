import * as yup from "yup";

export const createForgotPasswordSchema = (v) =>
  yup.object({
    email: yup.string().trim().email(v.EMAIL_INVALID).required(v.REQUIRED),
  });
