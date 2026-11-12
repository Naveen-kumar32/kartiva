import * as yup from "yup";

// "Get best price" / "Send enquiry" / test ride. v = { ...EN.VALIDATION, ...EN.BUYER_HUB.VALIDATION }.
export const createEnquirySchema = (v) =>
  yup.object({
    city: yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED),
    message: yup.string().trim().min(10, v.MESSAGE_SHORT).max(2000).required(v.REQUIRED),
    name: yup.string().trim().min(2, v.NAME_SHORT).required(v.REQUIRED),
    phone: yup.string().trim().matches(/^[6-9]\d{9}$/, v.PHONE_INVALID).required(v.REQUIRED),
    preferredDate: yup.string().when("wantsTestRide", {
      is: true,
      otherwise: (s) => s.notRequired(),
      then: (s) => s.required(v.REQUIRED).test("future", v.DATE_FUTURE, (val) => !val || val >= new Date().toISOString().slice(0, 10)),
    }),
    quantity: yup.number().typeError(v.QTY_MIN).integer(v.QTY_MIN).min(1, v.QTY_MIN).max(100000, v.QTY_MAX).required(v.REQUIRED),
    unit: yup.string().required(v.REQUIRED),
    wantsTestRide: yup.boolean(),
  });
