import * as yup from "yup";

// Admin team invite (Admin → Staff & roles).
export const createStaffInviteSchema = (v) =>
  yup.object({
    email: yup.string().trim().email(v.EMAIL_INVALID).required(v.REQUIRED),
    name: yup.string().trim().min(2, v.NAME_SHORT).max(60).required(v.REQUIRED),
    role: yup.string().required(v.REQUIRED),
  });
