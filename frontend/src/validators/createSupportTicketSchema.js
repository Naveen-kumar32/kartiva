import * as yup from "yup";

// Help & support ticket. v = { ...EN.VALIDATION, ...EN.BUYER_HUB.VALIDATION }.
export const createSupportTicketSchema = (v) =>
  yup.object({
    category: yup.string().required(v.REQUIRED),
    message: yup.string().trim().min(10, v.MESSAGE_SHORT).max(2000).required(v.REQUIRED),
    orderNumber: yup.string(),
    priority: yup.string().required(v.REQUIRED),
    subject: yup.string().trim().min(5, v.TITLE_SHORT).max(120).required(v.REQUIRED),
  });
