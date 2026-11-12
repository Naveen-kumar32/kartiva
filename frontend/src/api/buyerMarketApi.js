// Buyer-side marketplace API (IndiaMART / Alibaba / JustDial style): enquiries ("Get best price"),
// buy requests (RFQs) and quotes, wishlist, profile & addresses, support tickets, CMS pages and the
// announcement bar. Buyers only ever see their own data (matched by email); 404 for anything else.
import { axiosInstance, IS_MOCK } from "@/config";
import { GSTIN_PATTERN } from "@/constants";
import { CATEGORIES, DEMO_ADDRESS } from "@/data";
import { categoryTrail, categoryWithDescendants, summarizeProduct } from "@/utils/catalog";
import { mockDelay } from "@/utils/mock";

import { isPublicProduct } from "./catalogApi";
import { dispatchRfq, notify, openThread } from "./marketOps";
import { apiError, commit, getDb, nextId, nowIso } from "./mockDb";
import { sessionUser } from "./session";

const run = async (fn, ms = 350) => mockDelay(await Promise.resolve().then(fn), ms);
const remote = async (method, url, body) => (await axiosInstance[method](url, body)).data;

const HOUR = 3_600_000;
const SLA_HOURS = { high: 8, low: 72, medium: 24, urgent: 4 };
const TICKET_CATEGORIES = ["orders", "refunds", "payments", "account", "privacy", "dispute", "ip", "violation", "other"];
const RFQ_UNITS = ["pcs", "kg", "litre", "set", "box", "project", "unit"];

// ---------- helpers ----------
const requireUser = (user) => {
  const session = sessionUser();
  if (!user?.email || !session) throw apiError("Please sign in to continue.", 401);
  // The page passes `user` for convenience; the session decides who it really is.
  if (session.email !== user.email) throw apiError("Your session changed — please sign in again.", 401);
  return user;
};
const requireBuyer = (user) => {
  requireUser(user);
  if (user.role !== "buyer") throw apiError("Please sign in with a buyer account to do this.", 403);
  return user;
};
const dbUser = (user) => {
  const record = getDb().users.find((u) => u.email === user.email);
  if (!record) throw apiError("Account not found.", 404);
  return record;
};
const publicUser = ({ password: _password, ...rest }) => rest;
const fullName = (u) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.name || u.email;
const defaultAddress = (u) => (u.addresses ?? []).find((a) => a.isDefault) ?? u.addresses?.[0] ?? null;
const localPhone = (phone = "") => String(phone).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
const buyerCard = (user) => {
  const record = getDb().users.find((u) => u.email === user.email) ?? user;
  const card = { city: record.city || defaultAddress(record)?.city || "", email: record.email, name: fullName(record), phone: record.phone ?? "" };
  if (record.businessName) card.businessName = record.businessName;
  return card;
};
const storeLite = (store) => store && ({
  badges: store.badges, city: store.city, color: store.color, gstVerified: store.gstVerified, initials: store.initials, kycStatus: store.kycStatus,
  name: store.name, plan: store.plan, rating: store.rating, responseHours: store.responseHours, responseRate: store.responseRate, slug: store.slug,
});
const productLite = (product) => product && ({ enquiryOnly: Boolean(product.enquiryOnly), id: product.id, name: product.name, slug: product.slug, thumbnail: product.thumbnail });
const findStore = (slug) => getDb().stores.find((s) => s.slug === slug && s.status === "approved");
const findProduct = (id) => getDb().products.find((p) => p.id === Number(id));
const clean = (value, max = 2000) => String(value ?? "").trim().slice(0, max);

// ---------- Enquiries ("Get best price" / "Send enquiry" / test ride) ----------
// payload: { productId|null, storeSlug, quantity, unit, message, name, phone, city, wantsTestRide?, preferredDate? }
export async function sendEnquiry(user, payload) {
  if (!IS_MOCK) return remote("post", "/enquiries/", payload);
  return run(() => {
    requireBuyer(user);
    const db = getDb();
    const product = payload.productId ? findProduct(payload.productId) : null;
    if (payload.productId && (!product || !isPublicProduct(product))) throw apiError("Product not found.", 404);
    const storeSlug = product?.storeSlug ?? payload.storeSlug;
    const store = findStore(storeSlug);
    if (!store) throw apiError("Supplier not found.", 404);
    const quantity = Math.max(1, Math.floor(Number(payload.quantity) || 1));
    const message = clean(payload.message);
    if (message.length < 10) throw apiError("Please describe your requirement (10+ characters).");
    const at = nowIso();
    const record = buyerCard(user);
    const buyer = { ...record, city: clean(payload.city, 60) || record.city, name: clean(payload.name, 80) || record.name, phone: clean(payload.phone, 20) || record.phone };
    const enquiry = {
      assignedTo: null, buyer, createdAt: at, id: nextId(db.enquiries), message, notes: [], productId: product?.id ?? null, quantity,
      requirementType: quantity >= 10 ? "bulk" : "retail", source: product ? "product" : "store", status: "new", storeSlug, threadId: null,
      unit: clean(payload.unit, 20) || "unit", updatedAt: at,
    };
    if (payload.wantsTestRide) Object.assign(enquiry, { preferredDate: payload.preferredDate || null, wantsTestRide: true });
    db.enquiries.unshift(enquiry);
    const subject = product ? `${product.name}${payload.wantsTestRide ? " — test ride" : " — best price"}` : `Enquiry for ${store.name}`;
    const firstMessage = payload.wantsTestRide && payload.preferredDate ? `${message}\n\nPreferred test ride date: ${payload.preferredDate}` : message;
    const thread = openThread({ buyer, context: { id: enquiry.id, type: "enquiry" }, firstMessage, from: "buyer", storeSlug, subject });
    enquiry.threadId = thread.id;
    const what = product ? product.name : store.name;
    notify({ role: "seller", storeSlug }, "New enquiry", `${buyer.name} (${buyer.city || "—"}) asked about ${what} — ${quantity} ${enquiry.unit}${enquiry.wantsTestRide ? " (test ride requested)" : ""}.`, "/seller/leads");
    commit();
    return enquiry;
  }, 500);
}

export async function getMyEnquiries(user) {
  if (!IS_MOCK) return remote("get", "/enquiries/mine/");
  return run(() => {
    requireUser(user);
    const db = getDb();
    return db.enquiries
      .filter((e) => e.buyer.email === user.email)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({ ...e, product: productLite(e.productId ? findProduct(e.productId) : null), store: storeLite(db.stores.find((s) => s.slug === e.storeSlug)) }));
  }, 250);
}

// Opens (or creates) the conversation for one of the buyer's enquiries. Returns the thread id.
export async function openEnquiryChat(user, enquiryId) {
  if (!IS_MOCK) return remote("post", `/enquiries/${enquiryId}/thread/`);
  return run(() => {
    requireUser(user);
    const db = getDb();
    const enquiry = db.enquiries.find((e) => e.id === Number(enquiryId) && e.buyer.email === user.email);
    if (!enquiry) throw apiError("Enquiry not found.", 404);
    const existing = enquiry.threadId && db.threads.find((t) => t.id === enquiry.threadId);
    if (existing) return existing.id;
    const product = enquiry.productId ? findProduct(enquiry.productId) : null;
    const store = db.stores.find((s) => s.slug === enquiry.storeSlug);
    const thread = openThread({ buyer: enquiry.buyer, context: { id: enquiry.id, type: "enquiry" }, storeSlug: enquiry.storeSlug, subject: product ? product.name : `Enquiry for ${store?.name ?? enquiry.storeSlug}` });
    enquiry.threadId = thread.id;
    commit();
    return thread.id;
  }, 150);
}

// ---------- Buy requests (RFQs) ----------
const leafCategories = () => CATEGORIES.filter((c) => c.parentId && c.isActive !== false && !CATEGORIES.some((x) => x.parentId === c.id));
const firstNameOf = (name = "") => name.split(/\s+/).find((w) => w.replace(/\./g, "").length > 1) ?? name;

// Stores that should hear about a buy request: approved stores selling in that category or anywhere under its root.
function storesForCategory(categorySlug) {
  const root = categoryTrail(categorySlug)[0]?.slug ?? categorySlug;
  const slugs = new Set([categorySlug, ...categoryWithDescendants(root)]);
  const db = getDb();
  const storeSlugs = new Set(db.products.filter((p) => slugs.has(p.categorySlug) && !p.deletedAt).map((p) => p.storeSlug));
  return db.stores.filter((s) => s.status === "approved" && storeSlugs.has(s.slug));
}

// payload: { title, categorySlug, quantity, unit, targetPrice?, deliveryCity, requiredBy (YYYY-MM-DD), details }
export async function postRfq(user, payload) {
  if (!IS_MOCK) return remote("post", "/rfqs/", payload);
  return run(() => {
    requireBuyer(user);
    const db = getDb();
    const category = leafCategories().find((c) => c.slug === payload.categorySlug);
    if (!category) throw apiError("Please choose a category.", 400);
    const quantity = Math.floor(Number(payload.quantity));
    if (!(quantity > 0)) throw apiError("Enter a quantity.");
    const title = clean(payload.title, 120);
    if (title.length < 5) throw apiError("Tell suppliers what you need (5+ characters).");
    const deadline = new Date(`${payload.requiredBy}T23:59:59+05:30`);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() < Date.now()) throw apiError("The required-by date must be in the future.");
    const target = Number(payload.targetPrice);
    const rfq = {
      buyer: buyerCard(user), categorySlug: category.slug, createdAt: nowIso(), deadline: deadline.toISOString(), deliveryCity: clean(payload.deliveryCity, 60),
      details: clean(payload.details), id: nextId(db.rfqs), quantity, quotes: [], status: "open", targetPrice: target > 0 ? target : null, title,
      unit: RFQ_UNITS.includes(payload.unit) ? payload.unit : "unit",
    };
    db.rfqs.unshift(rfq);
    const stores = storesForCategory(category.slug);
    dispatchRfq(rfq, stores.map((s) => s.slug));
    // Admin sees every new RFQ; flagged when no supplier matches so the team can source one manually.
    notify(
      { role: "admin" },
      stores.length ? "New buy request" : "Buy request with no matching suppliers",
      `${rfq.buyer.name} (${rfq.deliveryCity}): ${rfq.title} — ${quantity} ${rfq.unit}. ${stores.length ? `${stores.length} supplier${stores.length === 1 ? "" : "s"} notified.` : "No seller lists this category yet — invite or notify suppliers."}`,
      "/admin/product-requests",
    );
    notify({ email: user.email, role: "buyer" }, "Quote request posted", stores.length ? `${stores.length} verified supplier${stores.length === 1 ? "" : "s"} notified. Quotes will appear in My quote requests.` : "We're finding suppliers for this category — you'll be notified when quotes arrive.", "/account/enquiries");
    commit();
    return { ...rfq, notifiedSuppliers: stores.length };
  }, 600);
}

// Public social proof: latest open buy requests (buyer first name + city only — no contact details).
export async function getRecentRfqs(limit = 6) {
  if (!IS_MOCK) return remote("get", "/rfqs/recent/");
  return run(() => getDb().rfqs
    .filter((r) => r.status === "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((r) => ({
      buyerFirstName: firstNameOf(r.buyer.name), categoryName: CATEGORIES.find((c) => c.slug === r.categorySlug)?.name ?? "", city: r.deliveryCity || r.buyer.city,
      createdAt: r.createdAt, id: r.id, quantity: r.quantity, quoteCount: r.quotes.length, title: r.title, unit: r.unit,
    })), 200);
}

export async function getMyRfqs(user) {
  if (!IS_MOCK) return remote("get", "/rfqs/mine/");
  return run(() => {
    requireUser(user);
    const db = getDb();
    return db.rfqs
      .filter((r) => r.buyer.email === user.email)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        ...r,
        categoryName: CATEGORIES.find((c) => c.slug === r.categorySlug)?.name ?? r.categorySlug,
        quotes: [...r.quotes].sort((a, b) => a.pricePerUnit - b.pricePerUnit).map((q) => ({ ...q, store: storeLite(db.stores.find((s) => s.slug === q.storeSlug)), total: q.pricePerUnit * r.quantity })),
      }));
  }, 250);
}

const ownRfq = (user, id) => {
  requireUser(user);
  const rfq = getDb().rfqs.find((r) => r.id === Number(id) && r.buyer.email === user.email);
  if (!rfq) throw apiError("Buy request not found.", 404);
  return rfq;
};

export async function acceptQuote(user, rfqId, quoteId) {
  if (!IS_MOCK) return remote("post", `/rfqs/${rfqId}/quotes/${quoteId}/accept/`);
  return run(() => {
    const rfq = ownRfq(user, rfqId);
    if (rfq.status !== "open") throw apiError("This buy request is no longer open.", 409);
    const quote = rfq.quotes.find((q) => q.id === Number(quoteId));
    if (!quote || quote.status !== "submitted") throw apiError("Quote not found.", 404);
    const at = nowIso();
    rfq.quotes.forEach((q) => {
      if (q.id === quote.id) q.status = "accepted";
      else if (q.status === "submitted") q.status = "rejected";
      q.decidedAt = at;
    });
    Object.assign(rfq, { awardedAt: at, awardedQuoteId: quote.id, status: "awarded", updatedAt: at });
    rfq.quotes.forEach((q) => {
      const won = q.id === quote.id;
      notify({ role: "seller", storeSlug: q.storeSlug }, won ? "Your quote was accepted" : "Quote not selected",
        won ? `${rfq.buyer.name} accepted your quote of ₹${q.pricePerUnit} / ${rfq.unit} for "${rfq.title}". Start a chat to confirm the order.` : `${rfq.buyer.name} chose another supplier for "${rfq.title}".`,
        "/seller/buy-requests");
    });
    commit();
    return rfq;
  });
}

export async function closeRfq(user, rfqId) {
  if (!IS_MOCK) return remote("post", `/rfqs/${rfqId}/close/`);
  return run(() => {
    const rfq = ownRfq(user, rfqId);
    if (rfq.status !== "open") throw apiError("This buy request is no longer open.", 409);
    const at = nowIso();
    Object.assign(rfq, { closedAt: at, status: "closed", updatedAt: at });
    rfq.quotes.forEach((q) => {
      if (q.status === "submitted") q.status = "rejected";
      notify({ role: "seller", storeSlug: q.storeSlug }, "Buy request closed", `${rfq.buyer.name} closed "${rfq.title}" without selecting a quote.`, "/seller/buy-requests");
    });
    commit();
    return rfq;
  });
}

// Finds or opens the conversation with one quoting supplier. Returns the thread id.
export async function openRfqChat(user, rfqId, storeSlug) {
  if (!IS_MOCK) return remote("post", `/rfqs/${rfqId}/thread/`, { storeSlug });
  return run(() => {
    const rfq = ownRfq(user, rfqId);
    if (!rfq.quotes.some((q) => q.storeSlug === storeSlug)) throw apiError("Quote not found.", 404);
    const db = getDb();
    const existing = db.threads.find((t) => t.context?.type === "rfq" && t.context.id === rfq.id && t.storeSlug === storeSlug && t.buyer.email === user.email);
    if (existing) return existing.id;
    const thread = openThread({ buyer: rfq.buyer, context: { id: rfq.id, type: "rfq" }, storeSlug, subject: `RFQ: ${rfq.title}` });
    commit();
    return thread.id;
  }, 150);
}

// ---------- Wishlist ----------
const SAMPLE_SIGNALS = (p) => {
  const stock = p.variants.reduce((s, v) => s + v.stock, 0);
  if (stock > 0 && p.id % 4 === 1) return "back_in_stock";
  if (p.id % 3 === 0) return "price_drop";
  return null;
};

export async function getWishlistIds(user) {
  if (!IS_MOCK) return remote("get", "/wishlist/ids/");
  if (!user?.email) return [];
  return [...(getDb().wishlists[user.email] ?? [])];
}

export async function getWishlist(user) {
  if (!IS_MOCK) return remote("get", "/wishlist/");
  return run(() => {
    requireUser(user);
    const db = getDb();
    return (db.wishlists[user.email] ?? [])
      .map((id) => findProduct(id))
      .filter((p) => p && isPublicProduct(p))
      .map((p) => ({ ...p, signal: SAMPLE_SIGNALS(p), store: db.stores.find((s) => s.slug === p.storeSlug), summary: summarizeProduct(p) }));
  }, 250);
}

export async function toggleWishlist(user, productId) {
  if (!IS_MOCK) return remote("post", "/wishlist/toggle/", { productId });
  return run(() => {
    requireUser(user);
    const db = getDb();
    const product = findProduct(productId);
    if (!product || !isPublicProduct(product)) throw apiError("Product not found.", 404);
    const ids = db.wishlists[user.email] ?? [];
    const added = !ids.includes(product.id);
    db.wishlists[user.email] = added ? [product.id, ...ids].slice(0, 200) : ids.filter((id) => id !== product.id);
    commit();
    return { added, ids: [...db.wishlists[user.email]] };
  }, 120);
}

// ---------- Profile, addresses, password, privacy ----------
const ensureAddresses = (record) => {
  if (!record.addresses) {
    record.addresses = record.email === "buyer@kartiva.demo" ? [{ ...DEMO_ADDRESS, id: 1, isDefault: true, label: "Home" }] : [];
    commit();
  }
  return record;
};

export async function getMyProfile(user) {
  if (!IS_MOCK) return remote("get", "/me/");
  return run(() => publicUser(ensureAddresses(dbUser(requireUser(user)))), 200);
}

// How the customer wants order updates: { email, sms, whatsapp } booleans (bell notifications are always on).
export async function saveNotificationPrefs(user, prefs) {
  if (!IS_MOCK) return remote("patch", "/me/notification-prefs/", prefs);
  return run(() => {
    const record = dbUser(requireUser(user));
    record.notificationPrefs = { email: Boolean(prefs.email), sms: Boolean(prefs.sms), whatsapp: Boolean(prefs.whatsapp) };
    commit();
    return publicUser(record);
  }, 200);
}

// values: { firstName, lastName, phone (10 digits), city, businessName, gstin }
export async function updateProfile(user, values) {
  if (!IS_MOCK) return remote("patch", "/me/", values);
  return run(() => {
    const record = dbUser(requireUser(user));
    const gstin = clean(values.gstin, 15).toUpperCase();
    if (gstin && !GSTIN_PATTERN.test(gstin)) throw apiError("Enter a valid 15-character GSTIN.");
    const phone = localPhone(values.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) throw apiError("Enter a valid 10-digit Indian mobile number.");
    const firstName = clean(values.firstName, 40);
    if (firstName.length < 2) throw apiError("Enter your first name.");
    Object.assign(record, { businessName: clean(values.businessName, 120), city: clean(values.city, 60), firstName, gstin, lastName: clean(values.lastName, 40), phone: `+91${phone}` });
    commit();
    return publicUser(record);
  });
}

// address: { id?, label, fullName, phone, line1, line2, city, state, pincode, isDefault }
export async function saveAddress(user, address) {
  if (!IS_MOCK) return remote("post", "/me/addresses/", address);
  return run(() => {
    const record = ensureAddresses(dbUser(requireUser(user)));
    const fields = ["city", "fullName", "label", "line1", "line2", "phone", "pincode", "state"];
    const value = Object.fromEntries(fields.map((k) => [k, clean(address[k], 160)]));
    if (!/^[1-9]\d{5}$/.test(value.pincode)) throw apiError("Enter a valid 6-digit PIN code.");
    const list = record.addresses;
    const existing = address.id && list.find((a) => a.id === Number(address.id));
    if (address.id && !existing) throw apiError("Address not found.", 404);
    if (!existing && list.length >= 10) throw apiError("You can save up to 10 addresses.");
    const saved = existing ? Object.assign(existing, value) : { ...value, id: nextId(list), isDefault: false };
    if (!existing) list.push(saved);
    if (address.isDefault || list.length === 1) list.forEach((a) => { a.isDefault = a.id === saved.id; });
    commit();
    return publicUser(record);
  });
}

export async function deleteAddress(user, id) {
  if (!IS_MOCK) return remote("delete", `/me/addresses/${id}/`);
  return run(() => {
    const record = ensureAddresses(dbUser(requireUser(user)));
    const target = record.addresses.find((a) => a.id === Number(id));
    if (!target) throw apiError("Address not found.", 404);
    record.addresses = record.addresses.filter((a) => a.id !== target.id);
    if (target.isDefault && record.addresses[0]) record.addresses[0].isDefault = true;
    commit();
    return publicUser(record);
  });
}

export async function setDefaultAddress(user, id) {
  if (!IS_MOCK) return remote("post", `/me/addresses/${id}/default/`);
  return run(() => {
    const record = ensureAddresses(dbUser(requireUser(user)));
    if (!record.addresses.some((a) => a.id === Number(id))) throw apiError("Address not found.", 404);
    record.addresses.forEach((a) => { a.isDefault = a.id === Number(id); });
    commit();
    return publicUser(record);
  }, 200);
}

export async function changePassword(user, { currentPassword, newPassword }) {
  if (!IS_MOCK) return remote("post", "/me/password/", { currentPassword, newPassword });
  return run(() => {
    const record = dbUser(requireUser(user));
    if (record.password !== currentPassword) throw apiError("Your current password is incorrect.", 400);
    if (!newPassword || newPassword.length < 8) throw apiError("Password must be at least 8 characters.");
    if (newPassword === currentPassword) throw apiError("Choose a password you haven't used here before.");
    record.password = newPassword;
    commit();
    return { ok: true };
  }, 500);
}

// DPDP Act: give the buyer a copy of what we hold about them.
export async function exportMyData(user) {
  if (!IS_MOCK) return remote("get", "/me/export/");
  return run(() => {
    const db = getDb();
    const record = ensureAddresses(dbUser(requireUser(user)));
    const mine = (b) => b?.email === user.email;
    return {
      enquiries: db.enquiries.filter((e) => mine(e.buyer)), exportedAt: nowIso(), orders: db.orders.filter((o) => mine(o.buyer)),
      profile: publicUser(record), returns: db.returns.filter((r) => mine(r.buyer)), rfqs: db.rfqs.filter((r) => mine(r.buyer)),
      supportTickets: db.tickets.filter((t) => t.raisedBy.email === user.email), wishlist: db.wishlists[user.email] ?? [],
    };
  }, 500);
}

export async function requestAccountDeletion(user, reason) {
  if (!IS_MOCK) return remote("post", "/me/delete-request/", { reason });
  return createTicketInDb(user, {
    category: "privacy", message: `Please delete my Kartiva account and personal data (DPDP request).${reason ? `\n\nReason: ${clean(reason, 500)}` : ""}`,
    orderNumber: "", priority: "high", subject: "Account deletion request",
  });
}

// ---------- Support tickets ----------
const nextTicketMessageId = () => getDb().tickets.reduce((m, t) => Math.max(m, ...t.messages.map((x) => x.id)), 0) + 1;

function createTicketInDb(user, payload) {
  return run(() => {
    requireUser(user);
    const db = getDb();
    const subject = clean(payload.subject, 120);
    const message = clean(payload.message);
    if (subject.length < 5) throw apiError("Add a short subject (5+ characters).");
    if (message.length < 10) throw apiError("Describe the issue (10+ characters).");
    const priority = SLA_HOURS[payload.priority] ? payload.priority : "medium";
    const category = TICKET_CATEGORIES.includes(payload.category) ? payload.category : "other";
    const orderNumber = payload.orderNumber && db.orders.some((o) => o.number === payload.orderNumber && o.buyer.email === user.email) ? payload.orderNumber : null;
    const at = nowIso();
    const id = nextId(db.tickets);
    const ticket = {
      assignee: null, category, createdAt: at, id, messages: [{ at, body: message, from: user.role === "seller" ? "seller" : "buyer", id: nextTicketMessageId() }],
      number: `TKT-${1040 + id}`, orderNumber, priority, raisedBy: { email: user.email, name: fullName(dbUser(user)), role: user.role },
      slaDueAt: new Date(Date.now() + SLA_HOURS[priority] * HOUR).toISOString(), status: "open", subject, updatedAt: at,
    };
    db.tickets.unshift(ticket);
    notify({ role: "admin" }, priority === "urgent" ? "Urgent ticket" : "New support ticket", `${ticket.number}: ${subject} (${ticket.raisedBy.name}).`, "/admin/support");
    commit();
    return ticket;
  }, 450);
}

// payload: { subject, category, orderNumber, priority, message }
export async function createTicket(user, payload) {
  if (!IS_MOCK) return remote("post", "/support/tickets/", payload);
  return createTicketInDb(user, payload);
}

export async function getMyTickets(user) {
  if (!IS_MOCK) return remote("get", "/support/tickets/");
  return run(() => {
    requireUser(user);
    return getDb().tickets.filter((t) => t.raisedBy.email === user.email).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, 250);
}

const ownTicket = (user, id) => {
  requireUser(user);
  const ticket = getDb().tickets.find((t) => t.id === Number(id) && t.raisedBy.email === user.email);
  if (!ticket) throw apiError("Ticket not found.", 404);
  return ticket;
};

export async function replyToTicket(user, id, body) {
  if (!IS_MOCK) return remote("post", `/support/tickets/${id}/reply/`, { body });
  return run(() => {
    const ticket = ownTicket(user, id);
    const text = clean(body);
    if (!text) throw apiError("Type a message first.");
    const at = nowIso();
    ticket.messages.push({ at, body: text, from: user.role === "seller" ? "seller" : "buyer", id: nextTicketMessageId() });
    if (ticket.status === "resolved" || ticket.status === "closed") ticket.status = "open";
    ticket.updatedAt = at;
    notify({ role: "admin" }, `Reply on ${ticket.number}`, `${ticket.raisedBy.name}: ${text.slice(0, 100)}`, "/admin/support");
    commit();
    return ticket;
  }, 300);
}

export async function resolveMyTicket(user, id) {
  if (!IS_MOCK) return remote("post", `/support/tickets/${id}/resolve/`);
  return run(() => {
    const ticket = ownTicket(user, id);
    if (ticket.status === "resolved" || ticket.status === "closed") throw apiError("This ticket is already resolved.", 409);
    const at = nowIso();
    Object.assign(ticket, { resolvedAt: at, status: "resolved", updatedAt: at });
    commit();
    return ticket;
  }, 250);
}

// ---------- CMS pages + announcement bar ----------
export async function getCmsPage(slug) {
  if (!IS_MOCK) return remote("get", `/pages/${slug}/`);
  return run(() => {
    const page = getDb().cmsPages.find((p) => p.slug === slug && p.published);
    if (!page) throw apiError("Page not found.", 404);
    return { ...page };
  }, 150);
}

// Published pages for footer / sidebar navigation (no bodies).
export async function getCmsPages() {
  if (!IS_MOCK) return remote("get", "/pages/");
  return run(() => getDb().cmsPages.filter((p) => p.published).map(({ group, slug, summary, title }) => ({ group: group ?? "about", slug, summary: summary ?? "", title })), 80);
}

export async function getAnnouncement() {
  if (!IS_MOCK) return remote("get", "/announcement/");
  const a = getDb().announcement;
  return a?.active && a.text ? { ...a } : null;
}

// Leaf categories for the "Post your requirement" form.
export async function getRfqCategories() {
  if (!IS_MOCK) return remote("get", "/rfqs/categories/");
  return leafCategories().map((c) => ({ name: c.name, parent: CATEGORIES.find((p) => p.id === c.parentId)?.name ?? "", slug: c.slug }));
}

export const RFQ_UNIT_OPTIONS = RFQ_UNITS.filter((u) => u !== "unit");
export const TICKET_CATEGORY_OPTIONS = TICKET_CATEGORIES;

// Public membership plans for the "Sell on Kartiva" page.
export async function getMembershipPlans() {
  if (!IS_MOCK) return remote("get", "/plans/");
  return run(() => getDb().plans.filter((p) => p.isActive !== false).sort((a, b) => a.priceYearly - b.priceYearly).map((p) => ({ ...p })), 150);
}
