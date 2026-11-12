import * as yup from "yup";

// Invite a seller team member. v = EN.VALIDATION
export const createTeamInviteSchema = (v) =>
  yup.object({
    email: yup.string().trim().email(v.EMAIL_INVALID).required(v.REQUIRED),
    name: yup.string().trim().min(2, v.NAME_SHORT).max(80).required(v.REQUIRED),
    role: yup.string().required(v.REQUIRED),
  });
