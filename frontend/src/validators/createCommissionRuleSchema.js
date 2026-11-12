import * as yup from "yup";

export const createCommissionRuleSchema = (v) =>
  yup.object({
    rate: yup.number().typeError(v.RATE_RANGE).min(0, v.RATE_RANGE).max(100, v.RATE_RANGE).required(v.REQUIRED),
    target: yup.string().required(v.REQUIRED),
  });
