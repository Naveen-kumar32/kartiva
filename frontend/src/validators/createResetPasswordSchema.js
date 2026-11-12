import * as yup from "yup";

// Same password rules as registration.
export const createResetPasswordSchema = (v) =>
  yup.object({
    confirmPassword: yup.string().oneOf([yup.ref("password")], v.PASSWORD_MISMATCH).required(v.REQUIRED),
    password: yup.string().min(8, v.PASSWORD_MIN).matches(/^(?=.*[A-Za-z])(?=.*\d)/, v.PASSWORD_WEAK).required(v.REQUIRED),
  });
