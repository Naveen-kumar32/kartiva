// Shared mock-DB operations for marketplace-growth features (messages, notifications).
// Used by buyer, seller and admin APIs so cross-role effects stay consistent.
import { getDb, nextId, nowIso } from "./mockDb";

// audience: { role: "buyer"|"seller"|"admin"|"all", email?, storeSlug? }
export function notify(audience, title, body, link = null) {
  const db = getDb();
  const n = { at: nowIso(), audience, body, id: nextId(db.notifications), link, read: false, title };
  db.notifications.unshift(n);
  return n;
}

export const audienceMatches = (audience, user) => {
  if (!user) return false;
  if (audience.role === "all") return true;
  if (audience.role !== user.role) return false;
  if (audience.email && audience.email !== user.email) return false;
  if (audience.storeSlug && audience.storeSlug !== user.storeSlug) return false;
  return true;
};

// side = "buyer" | "seller" | "admin". Returns the thread (created if needed).
export function openThread({ buyer, context, firstMessage, from = "buyer", storeSlug, subject }) {
  const db = getDb();
  const at = nowIso();
  const thread = {
    buyer: { city: buyer.city ?? "", email: buyer.email, name: buyer.name, phone: buyer.phone ?? "" }, context, id: nextId(db.threads), messages: [],
    storeSlug, subject, unread: { buyer: 0, seller: 0 }, updatedAt: at,
  };
  db.threads.unshift(thread);
  if (firstMessage) appendMessage(thread, from, firstMessage);
  return thread;
}

export function appendMessage(thread, from, body) {
  const db = getDb();
  const at = nowIso();
  const id = db.threads.reduce((m, t) => Math.max(m, ...t.messages.map((x) => x.id)), 0) + 1;
  thread.messages.push({ at, body: body.trim(), from, id });
  thread.updatedAt = at;
  const store = db.stores.find((s) => s.slug === thread.storeSlug);
  if (from === "buyer") {
    thread.unread.seller += 1;
    notify({ role: "seller", storeSlug: thread.storeSlug }, `Message from ${thread.buyer.name}`, body.slice(0, 120), "/seller/messages");
  } else {
    thread.unread.buyer += 1;
    notify({ email: thread.buyer.email, role: "buyer" }, `Message from ${store?.name ?? "seller"}`, body.slice(0, 120), "/account/messages");
  }
  return thread;
}

// KYC: a store is "verified" once GST certificate, PAN and cancelled cheque are all verified.
export const REQUIRED_KYC = ["gst_certificate", "pan_card", "cancelled_cheque"];
export function recomputeKyc(storeSlug) {
  const db = getDb();
  const store = db.stores.find((s) => s.slug === storeSlug);
  if (!store) return null;
  const docs = db.kycDocuments.filter((d) => d.storeSlug === storeSlug);
  const latest = (type) => docs.filter((d) => d.type === type).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  const required = REQUIRED_KYC.map(latest);
  if (required.every((d) => d?.status === "verified")) store.kycStatus = "verified";
  else if (docs.some((d) => d.status === "pending")) store.kycStatus = "pending";
  else if (docs.some((d) => d.status === "rejected")) store.kycStatus = "rejected";
  else store.kycStatus = docs.length ? "pending" : "not_submitted";
  store.gstVerified = latest("gst_certificate")?.status === "verified";
  refreshBadges(store);
  return store;
}

// Badges derive from plan, KYC and rating (admins can also add/remove "trusted" manually via store.badges).
export function refreshBadges(store) {
  const manual = (store.badges ?? []).filter((b) => !["top_rated", "trusted"].includes(b));
  store.badges = [...manual, ...(store.rating >= 4.5 ? ["top_rated"] : []), ...(store.trustedManual === true || (store.trustedManual !== false && store.plan && store.plan !== "free" && store.kycStatus === "verified") ? ["trusted"] : [])];
  return store;
}

// ---------- Product requests (buy requests / RFQs) → sellers ----------
// Sends a request to stores with FULL details (bell notification + email in the outbox) and records each
// delivery in rfq.dispatches [{ storeSlug, at, by: "auto" | admin name, note, viewedAt }].
// by "auto" skips stores that already received it; an admin forward re-sends (with the admin's note).
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
export function dispatchRfq(rfq, storeSlugs, { by = "auto", note = "" } = {}) {
  const db = getDb();
  rfq.dispatches ??= [];
  const category = db.categories.find((c) => c.slug === rfq.categorySlug)?.name ?? rfq.categorySlug;
  const qty = `${Number(rfq.quantity).toLocaleString("en-IN")} ${rfq.unit}`;
  const needBy = new Date(rfq.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const sent = [];
  [...new Set(storeSlugs)].forEach((slug) => {
    const store = db.stores.find((s) => s.slug === slug && s.status === "approved");
    if (!store) return;
    const existing = rfq.dispatches.find((d) => d.storeSlug === slug);
    if (existing && by === "auto") return;
    const at = nowIso();
    if (existing) Object.assign(existing, { at, by, note: note || existing.note });
    else rfq.dispatches.push({ at, by, note, storeSlug: slug, viewedAt: null });
    const fromAdmin = by !== "auto";
    notify(
      { role: "seller", storeSlug: slug },
      fromAdmin ? "Product request sent to you by Kartiva" : "New product request in your category",
      `${rfq.title} — ${qty}${rfq.targetPrice ? ` · target ${inr(rfq.targetPrice)}/${rfq.unit}` : ""} · deliver to ${rfq.deliveryCity} by ${needBy}.${note ? ` Kartiva: “${note}”` : ""} ${rfq.details.slice(0, 140)}`,
      `/seller/buy-requests?rfq=${rfq.id}`,
    );
    const to = store.ownerEmail || db.users.find((u) => u.storeSlug === slug)?.email;
    if (to) {
      db.outbox.unshift({
        attachment: null, cc: null, id: nextId(db.outbox), sentAt: at, sentBy: fromAdmin ? by : "Kartiva (automatic)", status: "sent", to: [to],
        subject: `Product request: ${rfq.title} (${qty}, ${rfq.deliveryCity})`,
        message: [
          `Hello ${store.contactPerson || store.name},`, "",
          fromAdmin ? "The Kartiva team has sent you a product request from a buyer:" : "A buyer has posted a product request in your category:", "",
          `Product / requirement: ${rfq.title}`, `Category: ${category}`, `Quantity: ${qty}`,
          `Target price: ${rfq.targetPrice ? `${inr(rfq.targetPrice)} per ${rfq.unit}` : "Open to offers"}`,
          `Delivery to: ${rfq.deliveryCity}`, `Needed by: ${needBy}`, `Buyer: ${rfq.buyer.name.split(/\s+/)[0]}${rfq.buyer.businessName ? ` (${rfq.buyer.businessName})` : ""}, ${rfq.buyer.city || rfq.deliveryCity}`, "",
          `Details: ${rfq.details}`, ...(note ? ["", `Note from Kartiva: ${note}`] : []), "",
          "Send your quote from Seller Hub → Buy requests before the deadline.", "— Team Kartiva",
        ].join("\n"),
      });
    }
    sent.push(slug);
  });
  return sent;
}
