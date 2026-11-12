// Seller Hub growth API (IndiaMART / Alibaba / JustDial style): leads, buy requests (RFQ) & quotes, customers (CRM),
// analytics, business profile & KYC, membership plan, team, bulk upload and support tickets.
// Every function takes the seller's storeSlug first and only ever reads/writes that store's data (404 otherwise).
import { API, axiosInstance, IS_MOCK } from "@/config";
import { BUSINESS_TYPES, TURNOVER_BANDS } from "@/constants";
import { ROUTES } from "@/locales";
import { mockDelay } from "@/utils/mock";
import { DAY_MS } from "@/utils/orderMath";

import { refreshCatalog } from "./bootstrap";
import { notify, openThread, recomputeKyc, refreshBadges } from "./marketOps";
import { apiError, audit, commit, getDb, nextId, nowIso } from "./mockDb";
import { assertStoreAccess } from "./session";
import { moveStock } from "./orderOps";

const run = async (fn, ms = 300) => mockDelay(await Promise.resolve().then(fn), ms);
const remote = async (method, url, body, config) => (await axiosInstance[method](url, body, config)).data;
// Changes that affect the public catalogue / store cards also refresh the in-memory catalogue (api mode).
const remoteAndRefresh = async (...args) => { const data = await remote(...args); await refreshCatalog(); return data; };
const ownStore = (storeSlug) => {
  assertStoreAccess(storeSlug); // the session must own this store
  const store = getDb().stores.find((s) => s.slug === storeSlug);
  if (!store) throw apiError("Store not found.", 404);
  return store;
};
// Private per-store Seller Hub data (CRM notes, upload history). Lives on the store record in mock mode.
const hubData = (store) => {
  const hub = getDb().sellerHub;
  hub[store.slug] ??= {};
  hub[store.slug].customerNotes ??= {};
  hub[store.slug].uploads ??= [];
  return hub[store.slug];
};
const time = (iso) => new Date(iso).getTime();
const monthKey = () => new Date().toISOString().slice(0, 7);
const subOrdersOf = (storeSlug) => getDb().orders.flatMap((order) => order.subOrders.filter((s) => s.storeSlug === storeSlug).map((sub) => ({ ...sub, address: order.address, buyer: order.buyer, createdAt: order.createdAt, orderNumber: order.number })));
const productLite = (p) => (p ? { id: p.id, name: p.name, slug: p.slug, thumbnail: p.thumbnail } : null);

// ---------- Plan & lead credits ----------
const activeSubscription = (storeSlug) => getDb().subscriptions.find((s) => s.storeSlug === storeSlug && s.status === "active") ?? null;
const planOf = (store) => getDb().plans.find((p) => p.code === (store.plan ?? "free")) ?? getDb().plans.find((p) => p.code === "free");
function creditsOf(store) {
  const sub = activeSubscription(store.slug);
  const used = sub && (!sub.creditsMonth || sub.creditsMonth === monthKey()) ? sub.leadCreditsUsed ?? 0 : 0;
  const total = planOf(store)?.leadCredits ?? null;
  return { left: total == null ? null : Math.max(0, total - used), total, used };
}
function consumeCredit(store) {
  const db = getDb();
  let sub = activeSubscription(store.slug);
  if (!sub) {
    sub = { amount: 0, endsAt: null, id: nextId(db.subscriptions), invoiceNumber: null, leadCreditsUsed: 0, planCode: store.plan ?? "free", startsAt: nowIso(), status: "active", storeSlug: store.slug };
    db.subscriptions.push(sub);
  }
  if (sub.creditsMonth && sub.creditsMonth !== monthKey()) sub.leadCreditsUsed = 0;
  sub.creditsMonth = monthKey();
  sub.leadCreditsUsed = (sub.leadCreditsUsed ?? 0) + 1;
}

// ---------- Leads & enquiries ----------
const maskPhone = (phone) => (phone ? `${"•".repeat(Math.max(4, phone.length - 3))}${phone.slice(-3)}` : "");
const maskEmail = (email) => (email ? `${email[0]}•••••@•••${email.slice(-3)}` : "");
const responseHoursOf = (lead) => {
  const responded = lead.respondedAt ?? (lead.status !== "new" ? lead.updatedAt : null);
  return responded ? Math.max(0, (time(responded) - time(lead.createdAt)) / 3_600_000) : null;
};

function decorateLead(lead, store) {
  const db = getDb();
  const locked = (store.plan ?? "free") === "free";
  const product = lead.productId ? db.products.find((p) => p.id === lead.productId) : null;
  return {
    ...lead,
    buyer: { ...lead.buyer, email: locked ? maskEmail(lead.buyer.email) : lead.buyer.email, phone: locked ? maskPhone(lead.buyer.phone) : lead.buyer.phone },
    contactLocked: locked, product: productLite(product), responseHours: responseHoursOf(lead),
  };
}

export async function getSellerLeads(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_LEADS);
  return run(() => {
    const store = ownStore(storeSlug);
    const leads = getDb().enquiries.filter((e) => e.storeSlug === storeSlug).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const closed = leads.filter((l) => ["won", "lost"].includes(l.status));
    const times = leads.map(responseHoursOf).filter((h) => h != null);
    return {
      kpis: {
        avgResponseHours: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
        conversion: closed.length ? (leads.filter((l) => l.status === "won").length / closed.length) * 100 : 0,
        inProgress: leads.filter((l) => ["contacted", "quoted"].includes(l.status)).length,
        newCount: leads.filter((l) => l.status === "new").length,
        wonThisMonth: leads.filter((l) => l.status === "won" && time(l.updatedAt) >= monthStart).length,
      },
      leads: leads.map((l) => decorateLead(l, store)),
      plan: store.plan ?? "free",
    };
  });
}

const ownLead = (storeSlug, id) => {
  const lead = getDb().enquiries.find((e) => e.id === Number(id) && e.storeSlug === storeSlug);
  if (!lead) throw apiError("Enquiry not found.", 404);
  return lead;
};
const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"];

export async function updateLeadStatus(storeSlug, id, status, actor) {
  if (!IS_MOCK) return remote("post", API.SELLER_LEAD(id, "status"), { status });
  return run(() => {
    const store = ownStore(storeSlug);
    const lead = ownLead(storeSlug, id);
    if (!LEAD_STATUSES.includes(status)) throw apiError("Unknown status.");
    if (lead.status === status) return decorateLead(lead, store);
    if (lead.status === "new" && !lead.respondedAt) lead.respondedAt = nowIso();
    const from = lead.status;
    lead.status = status;
    lead.updatedAt = nowIso();
    const what = getDb().products.find((p) => p.id === lead.productId)?.name ?? "your enquiry";
    if (status === "quoted") notify({ email: lead.buyer.email, role: "buyer" }, `Quotation from ${store.name}`, `${store.name} has sent a quotation for ${what}. Check your messages.`, ROUTES.ACCOUNT.ENQUIRIES);
    if (status === "won") notify({ email: lead.buyer.email, role: "buyer" }, `${store.name} confirmed your order request`, `Your enquiry for ${what} is confirmed. The seller will share next steps.`, ROUTES.ACCOUNT.ENQUIRIES);
    audit("lead.status", `Enquiry #${lead.id}`, `${store.name}: ${from} → ${status}`, actor ?? store.name);
    commit();
    return decorateLead(lead, store);
  }, 200);
}
export async function addLeadNote(storeSlug, id, text, author) {
  if (!IS_MOCK) return remote("post", API.SELLER_LEAD(id, "notes"), { text });
  return run(() => {
    const store = ownStore(storeSlug);
    const lead = ownLead(storeSlug, id);
    const clean = String(text ?? "").trim().slice(0, 1000);
    if (!clean) throw apiError("Write a note first.");
    lead.notes = [...(lead.notes ?? []), { at: nowIso(), author: author || store.name, text: clean }];
    commit();
    return decorateLead(lead, store);
  }, 150);
}

// Opens (or reuses) the buyer conversation for an enquiry and returns its id.
export async function replyToLead(storeSlug, id) {
  if (!IS_MOCK) return remote("post", API.SELLER_LEAD(id, "reply"));
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const lead = ownLead(storeSlug, id);
    if (lead.status === "spam") throw apiError("This enquiry is marked as spam.");
    const existing = d.threads.find((t) => t.storeSlug === storeSlug && (t.id === lead.threadId || (t.context?.type === "enquiry" && t.context.id === lead.id)));
    if (existing) {
      lead.threadId = existing.id;
      commit();
      return { threadId: existing.id };
    }
    const product = d.products.find((p) => p.id === lead.productId);
    const thread = openThread({ buyer: lead.buyer, context: { id: lead.id, type: "enquiry" }, from: "seller", storeSlug, subject: product ? `${product.name} — enquiry` : `Enquiry for ${store.name}` });
    // The buyer's original enquiry opens the conversation (no notification — it was sent already).
    const msgId = d.threads.reduce((m, t) => Math.max(m, ...t.messages.map((x) => x.id)), 0) + 1;
    thread.messages.push({ at: lead.createdAt, body: lead.message, from: "buyer", id: msgId });
    lead.threadId = thread.id;
    if (lead.status === "new") { lead.status = "contacted"; lead.respondedAt = nowIso(); lead.updatedAt = nowIso(); }
    commit();
    return { threadId: thread.id };
  }, 150);
}

// ---------- Buy requests (RFQ) ----------
function matchingSlugs(storeSlug) {
  const d = getDb();
  const slugs = new Set();
  d.products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt).forEach((p) => {
    slugs.add(p.categorySlug);
    const cat = d.categories.find((c) => c.slug === p.categorySlug);
    const root = cat?.parentId ? d.categories.find((c) => c.id === cat.parentId) : null;
    if (root) slugs.add(root.slug);
  });
  return slugs;
}

function decorateRfq(rfq, storeSlug, slugs) {
  const cat = getDb().categories.find((c) => c.slug === rfq.categorySlug);
  const mine = rfq.quotes.find((q) => q.storeSlug === storeSlug) ?? null;
  const thread = getDb().threads.find((t) => t.storeSlug === storeSlug && t.context?.type === "rfq" && t.context.id === rfq.id);
  const dispatch = rfq.dispatches?.find((d) => d.storeSlug === storeSlug) ?? null;
  return {
    forwardedByKartiva: Boolean(dispatch && dispatch.by !== "auto"), kartivaNote: dispatch?.note || "", sentToMe: Boolean(dispatch), viewedAt: dispatch?.viewedAt ?? null,
    buyer: { city: rfq.buyer.city || rfq.deliveryCity, name: rfq.buyer.name.split(/\s+/)[0] }, categoryName: cat?.name ?? rfq.categorySlug, categorySlug: rfq.categorySlug,
    createdAt: rfq.createdAt, deadline: rfq.deadline, deliveryCity: rfq.deliveryCity, details: rfq.details, id: rfq.id, matches: slugs.has(rfq.categorySlug) || Boolean(dispatch),
    myQuote: mine, quantity: rfq.quantity, quoteCount: rfq.quotes.length, status: rfq.status, targetPrice: rfq.targetPrice, threadId: thread?.id ?? null, title: rfq.title, unit: rfq.unit,
  };
}

export async function getSellerRfqs(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_RFQS);
  return run(() => {
    const store = ownStore(storeSlug);
    const slugs = matchingSlugs(storeSlug);
    const visible = getDb().rfqs.filter((r) => r.status === "open" || r.quotes.some((q) => q.storeSlug === storeSlug) || r.dispatches?.some((d) => d.storeSlug === storeSlug));
    return { credits: creditsOf(store), plan: store.plan ?? "free", rfqs: visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => decorateRfq(r, storeSlug, slugs)) };
  });
}

// Seller opened a request that was sent to them → admin sees "viewed" in Product requests.
export async function markRfqViewed(storeSlug, rfqId) {
  if (!IS_MOCK) return remote("post", API.SELLER_RFQ(rfqId, "viewed"));
  return run(() => {
    ownStore(storeSlug);
    const dispatch = getDb().rfqs.find((r) => r.id === Number(rfqId))?.dispatches?.find((d) => d.storeSlug === storeSlug);
    if (dispatch && !dispatch.viewedAt) { dispatch.viewedAt = nowIso(); commit(); }
    return true;
  }, 50);
}

/** quote: { pricePerUnit, leadTimeDays, validTill (yyyy-mm-dd), note } */
export async function submitRfqQuote(storeSlug, rfqId, quote, actor) {
  if (!IS_MOCK) return remote("post", API.SELLER_RFQ(rfqId, "quote"), quote);
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    if (store.status && store.status !== "approved") throw apiError("Your store must be approved before you can quote on buy requests.", 403);
    const rfq = d.rfqs.find((r) => r.id === Number(rfqId));
    if (!rfq) throw apiError("Buy request not found.", 404);
    if (rfq.status !== "open" || time(rfq.deadline) < Date.now()) throw apiError("This buy request is no longer accepting quotes.", 409);
    const price = Math.round(Number(quote.pricePerUnit) * 100) / 100;
    const lead = Math.round(Number(quote.leadTimeDays));
    const validTill = new Date(`${quote.validTill}T23:59:59+05:30`);
    if (!(price > 0)) throw apiError("Enter a valid price per unit.");
    if (!(lead >= 1 && lead <= 365)) throw apiError("Lead time must be 1–365 days.");
    if (Number.isNaN(validTill.getTime()) || validTill.getTime() < Date.now()) throw apiError("Validity must be a future date.");
    const note = String(quote.note ?? "").trim().slice(0, 1000);
    const total = Math.round(price * rfq.quantity);
    const existing = rfq.quotes.find((q) => q.storeSlug === storeSlug);
    if (existing) {
      if (existing.status !== "submitted") throw apiError("This quote can no longer be edited.", 409);
      Object.assign(existing, { leadTimeDays: lead, note, pricePerUnit: price, updatedAt: nowIso(), validTill: validTill.toISOString() });
    } else {
      const credits = creditsOf(store);
      if (credits.total != null && credits.used >= credits.total) throw apiError("You've used all buy-request quotes in your plan this month. Upgrade to quote more.", 402);
      const id = d.rfqs.flatMap((r) => r.quotes).reduce((m, q) => Math.max(m, q.id), 0) + 1;
      rfq.quotes.push({ createdAt: nowIso(), id, leadTimeDays: lead, note, pricePerUnit: price, status: "submitted", storeSlug, validTill: validTill.toISOString() });
      consumeCredit(store);
    }
    const summary = `Quotation for “${rfq.title}”: ₹${price.toLocaleString("en-IN")} per ${rfq.unit} × ${rfq.quantity.toLocaleString("en-IN")} = ₹${total.toLocaleString("en-IN")} (+ GST as applicable). Lead time ${lead} days, valid till ${validTill.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.${note ? `\n\n${note}` : ""}`;
    const thread = d.threads.find((t) => t.storeSlug === storeSlug && t.context?.type === "rfq" && t.context.id === rfq.id);
    if (!thread) openThread({ buyer: rfq.buyer, context: { id: rfq.id, type: "rfq" }, firstMessage: summary, from: "seller", storeSlug, subject: `RFQ: ${rfq.title}` });
    notify({ email: rfq.buyer.email, role: "buyer" }, existing ? "Quote updated" : "New quote received", `${store.name} quoted ₹${price.toLocaleString("en-IN")} / ${rfq.unit} for “${rfq.title}”.`, ROUTES.ACCOUNT.ENQUIRIES);
    audit(existing ? "rfq.quote_updated" : "rfq.quoted", `RFQ #${rfq.id}`, `${store.name} quoted ₹${price} / ${rfq.unit} (${lead} days)`, actor ?? store.name);
    commit();
    return decorateRfq(rfq, storeSlug, matchingSlugs(storeSlug));
  });
}

// ---------- Customers (CRM) ----------
const DAY = DAY_MS;
function segmentOf(c) {
  if (!c.orders) return "lead";
  if (c.orders >= 3 || c.totalSpent >= 50000) return "vip";
  if (Date.now() - time(c.lastOrder) > 45 * DAY) return "at_risk";
  return c.orders >= 2 ? "repeat" : "new";
}

export async function getSellerCustomers(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_CUSTOMERS);
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const notes = hubData(store).customerNotes;
    const byEmail = new Map();
    subOrdersOf(storeSlug).forEach((s) => {
      const key = s.buyer.email;
      const c = byEmail.get(key) ?? { city: s.address?.city ?? "", email: key, history: [], name: s.buyer.name, orders: 0, phone: s.buyer.phone ?? "", state: s.address?.state ?? "", totalSpent: 0 };
      c.history.push({ createdAt: s.createdAt, items: s.items.reduce((t, i) => t + i.quantity, 0), number: s.number, status: s.status, total: s.total });
      if (s.status !== "cancelled") { c.orders += 1; c.totalSpent += s.total; }
      byEmail.set(key, c);
    });
    d.enquiries.filter((e) => e.storeSlug === storeSlug && e.status !== "spam" && !byEmail.has(e.buyer.email)).forEach((e) => {
      byEmail.set(e.buyer.email, { businessName: e.buyer.businessName, city: e.buyer.city ?? "", email: e.buyer.email, history: [], name: e.buyer.name, orders: 0, phone: e.buyer.phone ?? "", state: "", totalSpent: 0 });
    });
    const customers = [...byEmail.values()].map((c) => {
      const dates = c.history.map((h) => h.createdAt).sort();
      const enquiries = d.enquiries.filter((e) => e.storeSlug === storeSlug && e.buyer.email === c.email).length;
      const thread = d.threads.filter((t) => t.storeSlug === storeSlug && t.buyer.email === c.email).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const row = {
        ...c, aov: c.orders ? Math.round(c.totalSpent / c.orders) : 0, enquiries, firstOrder: dates[0] ?? null, history: c.history.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        lastOrder: dates.at(-1) ?? null, notes: notes[c.email]?.notes ?? "", returns: d.returns.filter((r) => r.storeSlug === storeSlug && r.buyer?.email === c.email).length,
        tags: notes[c.email]?.tags ?? [], threadId: thread?.id ?? null,
      };
      return { ...row, segment: segmentOf(row) };
    });
    return customers.sort((a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name));
  });
}

export async function saveCustomerNotes(storeSlug, email, { notes, tags }) {
  if (!IS_MOCK) return remote("put", API.SELLER_CUSTOMER_NOTES, { email, notes, tags });
  return run(() => {
    const store = ownStore(storeSlug);
    const known = subOrdersOf(storeSlug).some((s) => s.buyer.email === email) || getDb().enquiries.some((e) => e.storeSlug === storeSlug && e.buyer.email === email);
    if (!known) throw apiError("Customer not found.", 404);
    const clean = { notes: String(notes ?? "").trim().slice(0, 2000), tags: [...new Set((tags ?? []).map((t) => String(t).trim().slice(0, 24)).filter(Boolean))].slice(0, 10), updatedAt: nowIso() };
    hubData(store).customerNotes[email] = clean;
    commit();
    return clean;
  }, 150);
}

// ---------- Analytics ----------
// Deterministic PRNG so synthetic traffic is stable for a store + range (until the analytics backend lands).
function seeded(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (rand, min, max) => min + rand() * (max - min);
const STOP = new Set(["with", "and", "for", "the", "pack", "of", "set", "in", "-", "&"]);

export async function getSellerAnalytics(storeSlug, days = 30) {
  if (!IS_MOCK) return remote("get", API.SELLER_ANALYTICS, { params: { days } });
  return run(() => {
    const d = getDb();
    ownStore(storeSlug);
    const range = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const now = Date.now();
    const start = now - range * DAY;
    const all = subOrdersOf(storeSlug).filter((s) => s.status !== "cancelled");
    const inRange = all.filter((s) => time(s.createdAt) > start);
    const prev = all.filter((s) => time(s.createdAt) > start - range * DAY && time(s.createdAt) <= start);
    const revenue = inRange.reduce((t, s) => t + s.total, 0);
    const prevRevenue = prev.reduce((t, s) => t + s.total, 0);
    const products = d.products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt);
    const rand = seeded(`${storeSlug}:${range}`);

    // Synthetic traffic anchored on real orders (or catalogue size for brand-new stores)
    const orders = inRange.length;
    const productViews = Math.round(orders ? orders * between(rand, 40, 70) : products.filter((p) => p.status === "active").length * range * between(rand, 0.8, 2));
    const storeViews = Math.round(productViews * between(rand, 0.25, 0.4));
    const addToCarts = Math.round(orders ? Math.max(orders, orders * between(rand, 3, 5)) : productViews * between(rand, 0.02, 0.05));
    const checkouts = Math.round(orders ? Math.max(orders, orders * between(rand, 1.3, 1.7)) : addToCarts * 0.3);

    // Revenue buckets: daily for 7 days, weekly otherwise
    const bucketDays = range === 7 ? 1 : 7;
    const buckets = Math.ceil(range / bucketDays);
    const series = Array.from({ length: buckets }, (_, i) => {
      const end = now - (buckets - 1 - i) * bucketDays * DAY;
      const from = end - bucketDays * DAY;
      const value = inRange.filter((s) => time(s.createdAt) > from && time(s.createdAt) <= end).reduce((t, s) => t + s.total, 0);
      return { label: new Date(end).toLocaleDateString("en-IN", range === 7 ? { weekday: "short" } : { day: "numeric", month: "short" }), value };
    });

    // Top products
    const perProduct = new Map();
    inRange.forEach((s) => s.items.forEach((it) => {
      const row = perProduct.get(it.productId) ?? { orders: 0, revenue: 0, units: 0 };
      row.orders += 1; row.units += it.quantity; row.revenue += it.lineTotal;
      perProduct.set(it.productId, row);
    }));
    const topProducts = products.map((p) => {
      const r = perProduct.get(p.id) ?? { orders: 0, revenue: 0, units: 0 };
      const views = Math.round(r.orders ? r.orders * between(rand, 35, 80) : between(rand, 4, 30) * (range / 7));
      return { ...r, conversion: views ? (r.orders / views) * 100 : 0, id: p.id, name: p.name, thumbnail: p.thumbnail, views };
    }).sort((a, b) => b.revenue - a.revenue || b.views - a.views).slice(0, 8);

    // Sales by state
    const byState = new Map();
    inRange.forEach((s) => byState.set(s.address?.state ?? "—", (byState.get(s.address?.state ?? "—") ?? 0) + s.total));
    const states = [...byState.entries()].sort((a, b) => b[1] - a[1]);
    const top = states.slice(0, 5);
    const rest = states.slice(5).reduce((t, [, v]) => t + v, 0);
    const salesByState = [...top, ...(rest ? [["Other states", rest]] : [])].map(([label, value]) => ({ label, share: revenue ? Math.round((value / revenue) * 100) : 0, value }));

    // New vs repeat customers
    const firstOrderAt = new Map();
    all.forEach((s) => { const t = time(s.createdAt); if (!firstOrderAt.has(s.buyer.email) || t < firstOrderAt.get(s.buyer.email)) firstOrderAt.set(s.buyer.email, t); });
    const buyers = [...new Set(inRange.map((s) => s.buyer.email))];
    const newCustomers = buyers.filter((e) => firstOrderAt.get(e) > start).length;

    // Lead funnel
    const leads = d.enquiries.filter((e) => e.storeSlug === storeSlug && e.status !== "spam" && time(e.createdAt) > start);
    const responded = leads.map(responseHoursOf).filter((h) => h != null);

    // Search keywords (sample, from product names)
    const words = new Map();
    products.forEach((p) => {
      const tokens = p.name.toLowerCase().split(/[\s,()/]+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
      [tokens.slice(0, 2).join(" "), tokens[0], `${tokens[0] ?? ""} price`].filter((k) => k && k.trim().length > 2).forEach((k) => words.set(k, (words.get(k) ?? 0) + 1));
    });
    const keywords = [...words.keys()].slice(0, 10).map((k) => ({ clicks: 0, keyword: k, searches: Math.round(between(rand, 20, 400) * (range / 30) + 5) }))
      .map((k) => ({ ...k, clicks: Math.round(k.searches * between(rand, 0.08, 0.3)) })).sort((a, b) => b.searches - a.searches);

    return {
      funnel: { addToCarts, checkouts, orders, productViews, storeViews },
      kpis: { aov: orders ? revenue / orders : 0, conversion: productViews ? (orders / productViews) * 100 : 0, orders, prevOrders: prev.length, prevRevenue, revenue },
      keywords, leadFunnel: { avgResponseHours: responded.length ? responded.reduce((a, b) => a + b, 0) / responded.length : null, enquiries: leads.length, quoted: leads.filter((l) => ["quoted", "won"].includes(l.status)).length, won: leads.filter((l) => l.status === "won").length },
      customers: { new: newCustomers, repeat: buyers.length - newCustomers },
      range, revenueSeries: series, salesByState, topProducts,
    };
  });
}

// ---------- Business profile & KYC ----------
export const KYC_DOC_TYPES = { optional: ["address_proof", "trade_licence", "fssai_bis_licence"], required: ["gst_certificate", "pan_card", "cancelled_cheque"] };
const KYC_MAX_KB = 5 * 1024;
// Multipart body for the KYC upload: the File itself when the page passes one, else just its metadata.
const kycForm = (docType, file) => {
  const form = new FormData();
  form.append("docType", docType);
  if (typeof Blob !== "undefined" && file instanceof Blob) form.append("file", file);
  else Object.entries({ name: file?.name ?? "", size: file?.size ?? 0, type: file?.type ?? "" }).forEach(([k, v]) => form.append(k, String(v)));
  return form;
};

export async function getBusinessProfile(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_BUSINESS);
  return run(() => {
    const store = ownStore(storeSlug);
    const docs = getDb().kycDocuments.filter((k) => k.storeSlug === storeSlug).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    const latest = Object.fromEntries([...KYC_DOC_TYPES.required, ...KYC_DOC_TYPES.optional].map((type) => [type, docs.find((x) => x.type === type) ?? null]));
    return { documents: latest, store };
  }, 200);
}

export async function updateBusinessProfile(storeSlug, patch, actor) {
  if (!IS_MOCK) return remoteAndRefresh("patch", API.SELLER_BUSINESS, patch);
  return run(() => {
    const store = ownStore(storeSlug);
    const year = Number(patch.yearEstablished);
    if (!BUSINESS_TYPES.includes(patch.businessType)) throw apiError("Choose a business type.");
    if (!TURNOVER_BANDS.includes(patch.annualTurnover)) throw apiError("Choose an annual turnover band.");
    if (!(year >= 1900 && year <= new Date().getFullYear())) throw apiError("Enter a valid year of establishment.");
    const list = (v, max) => [...new Set((Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean))].slice(0, max);
    Object.assign(store, {
      annualTurnover: patch.annualTurnover, businessType: patch.businessType, certifications: list(patch.certifications, 12).map((c) => c.slice(0, 60)),
      contactPerson: String(patch.contactPerson ?? "").trim().slice(0, 80), description: String(patch.description ?? "").trim().slice(0, 1500),
      employees: String(patch.employees ?? "").slice(0, 20), mainMarkets: list(patch.mainMarkets, 12).map((m) => m.slice(0, 40)),
      phone: String(patch.phone ?? "").trim().slice(0, 20), yearEstablished: year,
    });
    audit("store.profile_updated", `Store ${storeSlug}`, `${store.name} updated its business profile`, actor ?? store.name);
    commit();
    return store;
  });
}

/** file: { name, size (bytes), type (mime) } — only metadata is stored, never the file contents. */
export async function uploadKycDocument(storeSlug, docType, file, actor) {
  if (!IS_MOCK) return remoteAndRefresh("post", API.SELLER_KYC, kycForm(docType, file), { headers: { "Content-Type": "multipart/form-data" } });
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    if (![...KYC_DOC_TYPES.required, ...KYC_DOC_TYPES.optional].includes(docType)) throw apiError("Unknown document type.");
    const ext = String(file?.name ?? "").toLowerCase().split(".").pop();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) throw apiError("Upload a PDF, JPG or PNG file.");
    const sizeKb = Math.ceil(Number(file.size) / 1024);
    if (!(sizeKb > 0) || sizeKb > KYC_MAX_KB) throw apiError("File must be smaller than 5 MB.");
    const id = nextId(d.kycDocuments);
    // Re-upload replaces the previous document of this type
    const keep = d.kycDocuments.filter((k) => !(k.storeSlug === storeSlug && k.type === docType));
    d.kycDocuments.splice(0, d.kycDocuments.length, ...keep);
    const doc = { fileName: String(file.name).slice(0, 120), fileType: ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`, id, note: "", reviewedAt: null, reviewedBy: null, sizeKb, status: "pending", storeSlug, type: docType, uploadedAt: nowIso() };
    d.kycDocuments.push(doc);
    recomputeKyc(storeSlug);
    notify({ role: "admin" }, "KYC document uploaded", `${store.name} uploaded ${docType.replace(/_/g, " ")} (${doc.fileName}) for verification.`, ROUTES.ADMIN.VERIFICATION);
    audit("kyc.uploaded", `Store ${storeSlug}`, `${store.name} uploaded ${docType}`, actor ?? store.name);
    commit();
    return { doc, store };
  });
}

// ---------- Membership plan ----------
const GST_RATE = 18;
export async function getSellerPlan(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_PLAN);
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const history = d.subscriptions.filter((s) => s.storeSlug === storeSlug).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return { credits: creditsOf(store), history, plans: d.plans.filter((p) => p.isActive), store, subscription: activeSubscription(storeSlug) };
  }, 200);
}

export async function changeSellerPlan(storeSlug, planCode, { paymentRef } = {}, actor) {
  if (!IS_MOCK) return remoteAndRefresh("post", API.SELLER_PLAN_CHANGE, { paymentRef, planCode });
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const plan = d.plans.find((p) => p.code === planCode && p.isActive);
    if (!plan) throw apiError("Plan not found.", 404);
    if ((store.plan ?? "free") === plan.code) throw apiError("You're already on this plan.", 409);
    const amount = Number(plan.priceYearly) || 0;
    if (amount > 0 && !paymentRef) throw apiError("Payment is required to activate this plan.", 402);
    const prev = activeSubscription(storeSlug);
    if (prev) Object.assign(prev, { replacedAt: nowIso(), status: "replaced" });
    const startsAt = new Date();
    const invoiced = d.subscriptions.filter((s) => s.invoiceNumber).length;
    const gst = Math.round(amount * GST_RATE) / 100;
    const sub = {
      amount, creditsMonth: monthKey(), endsAt: amount ? new Date(startsAt.getTime() + 365 * DAY).toISOString() : null, gst, id: nextId(d.subscriptions),
      invoiceNumber: amount ? `KTV-MEM/26-27/${String(invoiced + 1).padStart(4, "0")}` : null, leadCreditsUsed: 0, paymentRef: paymentRef ?? null,
      planCode: plan.code, startsAt: startsAt.toISOString(), status: "active", storeSlug, total: amount + gst,
    };
    d.subscriptions.push(sub);
    const from = store.plan ?? "free";
    store.plan = plan.code;
    refreshBadges(store);
    audit("plan.changed", `Store ${storeSlug}`, `${store.name} switched plan ${from} → ${plan.code}${amount ? ` (₹${(amount + gst).toLocaleString("en-IN")} incl. GST, ${sub.invoiceNumber})` : ""}`, actor ?? store.name);
    notify({ role: "admin" }, amount ? "New membership purchase" : "Membership downgraded", `${store.name} is now on ${plan.name}${amount ? ` — ₹${(amount + gst).toLocaleString("en-IN")} paid` : ""}.`, ROUTES.ADMIN.PLANS);
    commit();
    return { store, subscription: sub };
  }, 500);
}

// ---------- Team ----------
const TEAM_ROLES = ["manager", "catalogue", "orders", "accounts"];
const ownMember = (storeSlug, id) => {
  const m = getDb().sellerStaff.find((s) => s.id === Number(id) && s.storeSlug === storeSlug);
  if (!m) throw apiError("Team member not found.", 404);
  return m;
};

export async function getSellerTeam(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_TEAM);
  return run(() => { ownStore(storeSlug); return getDb().sellerStaff.filter((s) => s.storeSlug === storeSlug); }, 200);
}

export async function inviteTeamMember(storeSlug, { email, name, role }, actor) {
  if (!IS_MOCK) return remote("post", API.SELLER_TEAM, { email, name, role });
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const clean = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw apiError("Enter a valid email address.");
    if (!TEAM_ROLES.includes(role)) throw apiError("Choose a role.");
    if (d.sellerStaff.some((s) => s.email === clean)) throw apiError("This email is already part of a seller team.", 409);
    const member = { email: clean, id: nextId(d.sellerStaff), invitedAt: nowIso(), lastActiveAt: null, name: String(name).trim().slice(0, 80), role, status: "invited", storeSlug };
    d.sellerStaff.push(member);
    d.outbox?.unshift({ at: nowIso(), id: nextId(d.outbox), kind: "team_invite", subject: `You're invited to ${store.name} on Kartiva Seller Hub`, to: clean });
    audit("team.invited", `Store ${storeSlug}`, `${member.name} <${clean}> invited as ${role}`, actor ?? store.name);
    commit();
    return member;
  });
}

export async function updateTeamMember(storeSlug, id, patch, actor) {
  if (!IS_MOCK) return remote("patch", `${API.SELLER_TEAM}${id}/`, patch);
  return run(() => {
    const store = ownStore(storeSlug);
    const m = ownMember(storeSlug, id);
    if (m.role === "owner") throw apiError("The store owner can't be changed.", 403);
    const changes = [];
    if (patch.role && patch.role !== m.role) {
      if (!TEAM_ROLES.includes(patch.role)) throw apiError("Choose a role.");
      changes.push(`role ${m.role} → ${patch.role}`);
      m.role = patch.role;
    }
    if (patch.status && patch.status !== m.status) {
      if (!["active", "disabled"].includes(patch.status)) throw apiError("Unknown status.");
      if (patch.status === "active" && m.status === "invited") throw apiError("Invited members become active when they accept.", 409);
      changes.push(patch.status === "disabled" ? "disabled" : "enabled");
      m.status = patch.status;
    }
    if (patch.resend) {
      if (m.status !== "invited") throw apiError("Only pending invites can be resent.", 409);
      m.invitedAt = nowIso();
      changes.push("invite resent");
    }
    if (changes.length) audit("team.updated", `Store ${storeSlug}`, `${m.name}: ${changes.join(", ")}`, actor ?? store.name);
    commit();
    return m;
  }, 200);
}

export async function removeTeamMember(storeSlug, id, actor) {
  if (!IS_MOCK) return remote("delete", `${API.SELLER_TEAM}${id}/`);
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const m = ownMember(storeSlug, id);
    if (m.role === "owner") throw apiError("The store owner can't be removed.", 403);
    d.sellerStaff.splice(d.sellerStaff.indexOf(m), 1);
    audit("team.removed", `Store ${storeSlug}`, `${m.name} <${m.email}> removed`, actor ?? store.name);
    commit();
    return m;
  }, 200);
}

// ---------- Bulk upload ----------
export async function getBulkUploadData(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_BULK);
  return run(() => {
    const store = ownStore(storeSlug);
    const variants = getDb().products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt).flatMap((p) => p.variants.map((v) => ({
      mrp: v.mrp, price: v.price, product: p.name, sku: v.sku, stock: v.stock, variant: Object.values(v.attributes ?? {}).join(" / ") || "Default",
    })));
    return { uploads: hubData(store).uploads, variants };
  }, 200);
}

function recordUpload(store, entry) {
  const uploads = hubData(store).uploads;
  uploads.unshift({ at: nowIso(), id: uploads.reduce((m, u) => Math.max(m, u.id), 0) + 1, ...entry });
  uploads.splice(30);
}

/** rows: [{ sku, price, mrp, stock }] — applied only to this store's SKUs. */
export async function applyBulkPriceStock(storeSlug, rows, fileName) {
  if (!IS_MOCK) return remoteAndRefresh("post", API.SELLER_BULK_PRICE_STOCK, { fileName, rows });
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const own = new Map(d.products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt).flatMap((p) => p.variants.map((v) => [v.sku.toUpperCase(), { product: p, variant: v }])));
    const errors = [];
    let applied = 0;
    (rows ?? []).slice(0, 5000).forEach((row, i) => {
      const hit = own.get(String(row.sku ?? "").trim().toUpperCase());
      if (!hit) { errors.push({ row: i + 2, sku: row.sku, error: "Unknown SKU" }); return; }
      const { product, variant } = hit;
      const price = Number(row.price);
      const mrp = Number(row.mrp);
      const stock = Number(row.stock);
      if (!(price > 0) || !(mrp > 0)) { errors.push({ row: i + 2, sku: row.sku, error: "Invalid price" }); return; }
      if (price > mrp) { errors.push({ row: i + 2, sku: row.sku, error: "Price is higher than MRP" }); return; }
      if (!Number.isInteger(stock) || stock < 0) { errors.push({ row: i + 2, sku: row.sku, error: "Invalid stock" }); return; }
      let changed = false;
      if (variant.price !== price || variant.mrp !== mrp) { variant.price = price; variant.mrp = mrp; changed = true; }
      if (stock !== variant.stock) { moveStock({ actor: "seller", delta: stock - variant.stock, note: `Bulk upload · ${fileName}`, reason: "bulk_upload", variantId: variant.id }); changed = true; }
      if (changed) { applied += 1; product.updatedAt = nowIso(); }
    });
    recordUpload(store, { failed: errors.length, fileName: String(fileName).slice(0, 120), mode: "update", ok: applied });
    audit("catalog.bulk_update", `Store ${storeSlug}`, `${store.name} bulk-updated ${applied} variant(s) from ${fileName}`, store.name);
    commit();
    return { applied, errors };
  }, 500);
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** rows: [{ name, categorySlug, brand, description, price, mrp, stock, hsn, gstRate, imageUrl }] */
export async function bulkCreateProducts(storeSlug, rows, fileName) {
  if (!IS_MOCK) return remoteAndRefresh("post", API.SELLER_BULK_PRODUCTS, { fileName, rows });
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const moderation = d.platform.productModerationEnabled !== false;
    const errors = [];
    const created = [];
    let vid = d.products.flatMap((p) => p.variants).reduce((m, v) => Math.max(m, v.id), 0);
    const usedSkus = new Set(d.products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt).flatMap((p) => p.variants.map((v) => v.sku.toUpperCase())));
    (rows ?? []).slice(0, 500).forEach((row, i) => {
      const fail = (error) => errors.push({ error, name: row.name, row: i + 2 });
      const name = String(row.name ?? "").trim();
      const category = d.categories.find((c) => c.slug === String(row.categorySlug ?? "").trim());
      const price = Number(row.price);
      const mrp = Number(row.mrp);
      const stock = Number(row.stock);
      const gstRate = Number(row.gstRate);
      const hsn = String(row.hsn ?? "").trim();
      const image = String(row.imageUrl ?? "").trim();
      if (name.length < 3) return fail("Name is too short");
      if (!category || !category.parentId) return fail("Category must be an existing sub-category");
      if (!(price > 0) || !(mrp > 0)) return fail("Invalid price");
      if (price > mrp) return fail("Price is higher than MRP");
      if (!Number.isInteger(stock) || stock < 0) return fail("Invalid stock");
      if (!/^\d{4,8}$/.test(hsn)) return fail("HSN must be 4–8 digits");
      if (!d.platform.gstRateChoices.includes(gstRate)) return fail(`GST must be one of ${d.platform.gstRateChoices.join(", ")}`);
      if (image && !/^https:\/\/\S+$/.test(image)) return fail("Image URL must start with https://");
      const id = nextId(d.products);
      let sku = `${slugify(name).split("-").slice(0, 3).map((w) => w.slice(0, 3)).join("-").toUpperCase()}-${id}`;
      while (usedSkus.has(sku)) sku = `${sku}X`;
      usedSkus.add(sku);
      const variant = { attributes: {}, id: ++vid, isDefault: true, lowStockThreshold: 3, mrp, price, sku, stock };
      const description = String(row.description ?? "").trim() || name;
      const product = {
        brand: String(row.brand ?? "").trim() || store.name, categorySlug: category.slug, createdAt: nowIso(), deletedAt: null, description, gstRate, hsnCode: hsn, id,
        images: [image || "/placeholder-product.svg"], isFeatured: false, isReturnable: true, name, rating: 0, returnWindowDays: d.platform.defaultReturnWindowDays, reviewCount: 0,
        slug: `${slugify(name)}-${id}`, soldCount: 0, specifications: [], status: moderation ? "pending_review" : "active", storeSlug, thumbnail: image || "/placeholder-product.svg",
        variantOptions: [], variants: [variant],
      };
      d.products.unshift(product);
      if (stock) d.stockMovements.unshift({ actor: "seller", at: nowIso(), delta: stock, id: nextId(d.stockMovements), note: `Opening stock · bulk upload ${fileName}`, productId: id, productName: name, reason: "initial", sku, stockAfter: stock, storeSlug, variantId: variant.id });
      created.push({ id, name, status: product.status });
      return null;
    });
    recordUpload(store, { failed: errors.length, fileName: String(fileName).slice(0, 120), mode: "create", ok: created.length });
    audit("catalog.bulk_create", `Store ${storeSlug}`, `${store.name} added ${created.length} product(s) from ${fileName}`, store.name);
    commit();
    return { created, errors, moderation };
  }, 600);
}

// ---------- Help & support ----------
const SLA_HOURS = { high: 8, low: 72, medium: 24, urgent: 4 };
const TICKET_CATEGORIES = ["payments", "orders", "catalogue", "kyc", "ads", "technical", "other"];
const ownTicket = (storeSlug, id) => {
  const t = getDb().tickets.find((x) => x.id === Number(id) && x.raisedBy?.storeSlug === storeSlug);
  if (!t) throw apiError("Ticket not found.", 404);
  return t;
};
const nextMessageId = () => getDb().tickets.flatMap((t) => t.messages).reduce((m, x) => Math.max(m, x.id), 0) + 1;

export async function getSellerTickets(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_TICKETS);
  return run(() => { ownStore(storeSlug); return getDb().tickets.filter((t) => t.raisedBy?.storeSlug === storeSlug).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }, 200);
}

export async function createSellerTicket(storeSlug, user, { category, message, priority, subject }) {
  if (!IS_MOCK) return remote("post", API.SELLER_TICKETS, { category, message, priority, subject });
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    if (!TICKET_CATEGORIES.includes(category)) throw apiError("Choose a category.");
    if (!SLA_HOURS[priority]) throw apiError("Choose a priority.");
    if (!String(subject ?? "").trim() || !String(message ?? "").trim()) throw apiError("Subject and message are required.");
    const at = nowIso();
    const id = nextId(d.tickets);
    const ticket = {
      assignee: null, category, createdAt: at, id, messages: [{ at, body: String(message).trim().slice(0, 4000), from: "seller", id: nextMessageId() }], number: `TKT-${1040 + id}`, priority,
      raisedBy: { email: user.email, name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || store.name, role: "seller", storeSlug }, slaDueAt: new Date(Date.now() + SLA_HOURS[priority] * 3_600_000).toISOString(),
      status: "open", subject: String(subject).trim().slice(0, 160), updatedAt: at,
    };
    d.tickets.unshift(ticket);
    notify({ role: "admin" }, priority === "urgent" ? "Urgent ticket" : "New support ticket", `${ticket.number}: ${ticket.subject} (${store.name})`, ROUTES.ADMIN.SUPPORT);
    commit();
    return ticket;
  });
}

export async function replySellerTicket(storeSlug, id, body) {
  if (!IS_MOCK) return remote("post", API.SELLER_TICKET(id, "reply"), { body });
  return run(() => {
    const store = ownStore(storeSlug);
    const t = ownTicket(storeSlug, id);
    if (!String(body ?? "").trim()) throw apiError("Type a message first.");
    const at = nowIso();
    t.messages.push({ at, body: String(body).trim().slice(0, 4000), from: "seller", id: nextMessageId() });
    t.updatedAt = at;
    if (["resolved", "closed"].includes(t.status)) t.status = "open";
    notify({ role: "admin" }, "Ticket reply", `${t.number}: ${store.name} replied.`, ROUTES.ADMIN.SUPPORT);
    commit();
    return t;
  }, 200);
}

export async function resolveSellerTicket(storeSlug, id) {
  if (!IS_MOCK) return remote("post", API.SELLER_TICKET(id, "resolve"));
  return run(() => {
    const t = ownTicket(storeSlug, id);
    t.status = "resolved";
    t.resolvedAt = nowIso();
    t.updatedAt = nowIso();
    commit();
    return t;
  }, 200);
}

// ---------- Dashboard summary ----------
export async function getSellerGrowthSummary(storeSlug) {
  if (!IS_MOCK) return remote("get", API.SELLER_GROWTH_SUMMARY);
  return run(() => {
    const d = getDb();
    const store = ownStore(storeSlug);
    const slugs = matchingSlugs(storeSlug);
    const products = d.products.filter((p) => p.storeSlug === storeSlug && !p.deletedAt);
    const profile = Boolean(store.businessType && store.yearEstablished && store.contactPerson && store.phone && store.mainMarkets?.length && (store.description || store.certifications?.length));
    return {
      checklist: { kyc: store.kycStatus === "verified", plan: (store.plan ?? "free") !== "free", product: products.length > 0, profile, shipping: (store.shippingMethods ?? []).length > 0 },
      credits: creditsOf(store),
      kycStatus: store.kycStatus ?? "not_submitted",
      newLeads: d.enquiries.filter((e) => e.storeSlug === storeSlug && e.status === "new").length,
      openRfqs: d.rfqs.filter((r) => r.status === "open" && slugs.has(r.categorySlug) && time(r.deadline) > Date.now() && !r.quotes.some((q) => q.storeSlug === storeSlug)).length,
      unreadMessages: d.threads.filter((t) => t.storeSlug === storeSlug).reduce((n, t) => n + (t.unread?.seller ?? 0), 0),
    };
  }, 200);
}
