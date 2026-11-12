import * as yup from "yup";

export const createPasswordChangeSchema = (v) =>
  yup.object({
    confirmPassword: yup.string().oneOf([yup.ref("newPassword")], v.PASSWORD_MISMATCH).required(v.REQUIRED),
    currentPassword: yup.string().required(v.REQUIRED),
    newPassword: yup.string().min(8, v.PASSWORD_MIN).matches(/^(?=.*[A-Za-z])(?=.*\d)/, v.PASSWORD_WEAK).required(v.REQUIRED),
  });
