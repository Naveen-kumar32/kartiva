import * as yup from "yup";

// Seller Hub support ticket. v = { ...EN.VALIDATION, ...EN.SELLER_PRO.VALIDATION }.
// (The buyer Help & support form uses createSupportTicketSchema.)
export const createTicketSchema = (v) =>
  yup.object({
    category: yup.string().required(v.REQUIRED),
    message: yup.string().trim().min(10, v.MESSAGE_SHORT).max(2000, v.TOO_LONG).required(v.REQUIRED),
    priority: yup.string().required(v.REQUIRED),
    subject: yup.string().trim().min(5, v.SUBJECT_SHORT).max(120, v.TOO_LONG).required(v.REQUIRED),
  });
