import * as yup from "yup";

export const createReportSchema = (v) =>
  yup.object({
    description: yup.string().trim().min(20, v.DESCRIPTION_SHORT).max(2000).required(v.REQUIRED),
    link: yup.string().trim().max(300),
    type: yup.string().oneOf(["violation", "ip", "dispute"]).required(v.REQUIRED),
  });
