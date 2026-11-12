import * as yup from "yup";

export const createCategorySchema = (v) =>
  yup.object({
    defaultHsn: yup.string().trim().matches(/^$|^\d{4,8}$/, v.HSN_INVALID),
    description: yup.string().trim().max(300),
    name: yup.string().trim().min(2, v.NAME_SHORT).max(60).required(v.REQUIRED),
    returnWindowDays: yup.number().transform((n, raw) => (raw === "" ? undefined : n)).integer().min(0, v.RETURN_WINDOW_RANGE).max(30, v.RETURN_WINDOW_RANGE),
    shortName: yup.string().trim().max(24),
  });
