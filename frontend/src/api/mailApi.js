// Email documents. In mock mode mail is recorded in an Outbox (no real sending);
// in api mode the backend sends via SMTP with the PDF attached (Phase 3+).
import { API, IS_MOCK, axiosInstance } from "@/config";
import { mockDelay } from "@/utils/mock";

import { apiError, audit, commit, getDb, nextId, nowIso } from "./mockDb";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** { to, cc?, subject, message, attachment?: { blob, filename }, sentBy } */
export async function sendEmail({ attachment, cc, message, sentBy = "Kartiva", subject, to }) {
  const recipients = String(to).split(/[,;\s]+/).filter(Boolean);
  if (!recipients.length || recipients.some((r) => !EMAIL_RE.test(r))) throw apiError("Enter valid email address(es).");
  if (!subject?.trim()) throw apiError("Add a subject.");
  if (!IS_MOCK) {
    const form = new FormData();
    form.append("to", recipients.join(","));
    if (cc) form.append("cc", cc);
    form.append("subject", subject);
    form.append("message", message ?? "");
    if (attachment) form.append("attachment", attachment.blob, attachment.filename);
    return (await axiosInstance.post(API.EMAILS, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
  }
  const db = getDb();
  const mail = {
    attachment: attachment ? { filename: attachment.filename, size: attachment.blob.size } : null, cc: cc || null, id: nextId(db.outbox),
    message: message ?? "", sentAt: nowIso(), sentBy, status: "sent", subject: subject.trim(), to: recipients,
  };
  db.outbox.unshift(mail);
  audit("email.sent", recipients.join(", "), `${subject}${attachment ? ` · ${attachment.filename}` : ""}`, sentBy);
  commit();
  return mockDelay(mail, 700);
}

export async function getOutbox() {
  if (!IS_MOCK) return (await axiosInstance.get(API.EMAILS)).data.results;
  return mockDelay(getDb().outbox, 150);
}

export async function getSmsOutbox() {
  if (!IS_MOCK) return (await axiosInstance.get(API.SMS)).data.results;
  return mockDelay(getDb().smsOutbox ?? [], 120);
}

// Data needed to (re)generate an emailed PDF from its recipe { kind, orderNumber, subOrderNumber }.
export async function getAttachmentSource(attachment) {
  if (!IS_MOCK) return (await axiosInstance.get(API.EMAIL_ATTACHMENTS, { params: { kind: attachment.kind, orderNumber: attachment.orderNumber, subOrderNumber: attachment.subOrderNumber } })).data;
  const db = getDb();
  const order = db.orders.find((o) => o.number === attachment.orderNumber);
  if (!order) throw apiError("The order for this attachment no longer exists.", 404);
  const sub = attachment.subOrderNumber ? order.subOrders.find((s) => s.number === attachment.subOrderNumber) : null;
  return {
    order, platform: { ...db.platform }, refunds: db.refunds.filter((r) => r.orderNumber === order.number),
    store: sub ? db.stores.find((st) => st.slug === sub.storeSlug) : null, sub,
  };
}
