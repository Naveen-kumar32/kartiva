import * as yup from "yup";

// v = EN.VALIDATION, m = EN.ADMIN_PRO.BROADCASTS.VALIDATION
export const createBroadcastSchema = (v, m) =>
  yup.object({
    audience: yup.string().oneOf(["sellers", "buyers", "everyone", "store", "plan"]).required(v.REQUIRED),
    body: yup.string().trim().min(10, m.BODY_SHORT).max(500).required(v.REQUIRED),
    channels: yup.array().of(yup.string()).min(1, m.CHANNEL_REQUIRED),
    link: yup.string().trim().matches(/^(\/(?!\/)|https:\/\/)/, { excludeEmptyString: true, message: m.LINK_FORMAT }),
    planCode: yup.string().when("audience", { is: "plan", otherwise: (s) => s, then: (s) => s.required(v.REQUIRED) }),
    storeSlug: yup.string().when("audience", { is: "store", otherwise: (s) => s, then: (s) => s.required(v.REQUIRED) }),
    title: yup.string().trim().min(3, v.NAME_SHORT).max(80).required(v.REQUIRED),
  });
