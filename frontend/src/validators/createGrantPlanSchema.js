import * as yup from "yup";

export const createGrantPlanSchema = (v) =>
  yup.object({
    months: yup.number().oneOf([1, 3, 6, 12, 24]).required(v.REQUIRED),
    planCode: yup.string().required(v.REQUIRED),
    storeSlug: yup.string().required(v.REQUIRED),
  });
