import * as yup from "yup";

export const createAdSchema = (v) =>
  yup.object({
    advertiser: yup.string().when("advertiserType", { is: "external", otherwise: (s) => s, then: (s) => s.trim().min(2, v.NAME_SHORT).required(v.REQUIRED) }),
    endsAt: yup.string().required(v.REQUIRED),
    startsAt: yup.string().required(v.REQUIRED),
    storeSlug: yup.string().when("advertiserType", { is: "seller", otherwise: (s) => s, then: (s) => s.required(v.REQUIRED) }),
  });
