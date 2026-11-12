// Admin growth API — leads & RFQs, KYC verification, membership plans, support desk, CMS, broadcasts,
// staff RBAC, risk flags, analytics, money ledger and tax centre. Every write is audit-logged with the
// signed-in admin's name (actor) and committed. In api mode each call maps to a Django admin endpoint.
import { API, IS_MOCK, axiosInstance } from "@/config";
import { GSTIN_PATTERN, INDIAN_STATES } from "@/constants";
import { ROUTES } from "@/locales";
import { mockDelay } from "@/utils/mock";
import { DAY_MS } from "@/utils/orderMath";

import { refreshCatalog } from "./bootstrap";
import { sendEmail } from "./mailApi";
import { dispatchRfq, notify, recomputeKyc, refreshBadges } from "./marketOps";
import { apiError, audit, commit, getDb, nextId, nowIso } from "./mockDb";

const run = async (fn, ms = 300) => mockDelay(await Promise.resolve().then(fn), ms);
const remote = async (method, url, body) => (await axiosInstance[method](url, body)).data;
const get = async (url, params) => (await axiosInstance.get(url, params ? { params } : undefined)).data;
// API mode: store badges/plans, the announcement bar and homepage sections live in the storefront's in-memory catalogue — reload it.
const withCatalog = async (promise) => { const result = await promise; await refreshCatalog(); return result; };
const HOUR = 3_600_000;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const ms = (iso) => new Date(iso).getTime();
const SLA_HOURS = { high: 8, low: 72, medium: 24, urgent: 4 };
const PLATFORM_STATE = "33"; // Kartiva is registered in Tamil Nadu

const storeBy = (slug) => getDb().stores.find((s) => s.slug === slug);
const mustStore = (slug) => {
  const store = storeBy(slug);
  if (!store) throw apiError("Store not found.", 404);
  return store;
};
const liveSubs = () => getDb().orders.flatMap((o) => o.subOrders.filter((s) => s.status !== "cancelled").map((s) => ({ ...s, createdAt: o.createdAt, order: o })));
const allSubs = () => getDb().orders.flatMap((o) => o.subOrders.map((s) => ({ ...s, createdAt: o.createdAt, order: o })));
const productName = (id) => getDb().products.find((p) => p.id === id)?.name ?? null;
const categoryName = (slug) => getDb().categories.find((c) => c.slug === slug)?.name ?? slug;
const topCategoryOf = (slug) => {
  const { categories } = getDb();
  const cat = categories.find((c) => c.slug === slug);
  const parent = cat?.parentId ? categories.find((c) => c.id === cat.parentId) : null;
  return parent ?? cat;
};

// ---------- Leads & buy requests ----------
function firstSellerReplyHours(enquiry) {
  const thread = enquiry.threadId && getDb().threads.find((t) => t.id === enquiry.threadId);
  const reply = thread?.messages.find((m) => m.from === "seller");
  return reply ? (ms(reply.at) - ms(enquiry.createdAt)) / HOUR : null;
}

export async function getAdminLeads() {
  if (!IS_MOCK) return get(API.ADMIN_LEADS);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const enquiries = db.enquiries.map((e) => ({
      ...e, productName: productName(e.productId), replyHours: firstSellerReplyHours(e), storeName: storeBy(e.storeSlug)?.name ?? e.storeSlug,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const rfqs = db.rfqs.map((r) => ({
      ...r, categoryName: categoryName(r.categorySlug),
      quotes: r.quotes.map((q) => ({ ...q, store: storeBy(q.storeSlug) ?? { name: q.storeSlug, slug: q.storeSlug } })),
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const replies = enquiries.map((e) => e.replyHours).filter((h) => h != null);
    const awardedValue = db.rfqs.filter((r) => r.status === "awarded").reduce((t, r) => {
      const q = r.quotes.find((x) => x.status === "accepted");
      return t + (q ? q.pricePerUnit * r.quantity : 0);
    }, 0);
    return {
      enquiries,
      kpis: {
        avgResponseHours: replies.length ? replies.reduce((t, h) => t + h, 0) / replies.length : null,
        awardedValue,
        byStatus: enquiries.reduce((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {}),
        leads7d: enquiries.filter((e) => now - ms(e.createdAt) < 7 * DAY_MS).length,
        leadsToday: enquiries.filter((e) => now - ms(e.createdAt) < DAY_MS).length,
        openRfqs: db.rfqs.filter((r) => r.status === "open").length,
        quoteRate: db.rfqs.length ? (db.rfqs.filter((r) => r.quotes.length > 0).length / db.rfqs.length) * 100 : 0,
      },
      rfqs,
      stores: db.stores.filter((s) => s.status === "approved").map((s) => ({ name: s.name, slug: s.slug })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

export async function getAdminThread(threadId) {
  if (!IS_MOCK) return get(API.ADMIN_THREAD(threadId));
  return run(() => {
    const thread = getDb().threads.find((t) => t.id === Number(threadId));
    if (!thread) throw apiError("Conversation not found.", 404);
    return { ...thread, storeName: storeBy(thread.storeSlug)?.name ?? thread.storeSlug };
  }, 150);
}

export async function adminSetEnquirySpam(id, spam, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_ENQUIRY_ACTION(id, spam ? "spam" : "restore"));
  return run(() => {
    const e = getDb().enquiries.find((x) => x.id === id);
    if (!e) throw apiError("Enquiry not found.", 404);
    if (spam) { e.prevStatus = e.status === "spam" ? e.prevStatus : e.status; e.status = "spam"; }
    else { e.status = e.prevStatus && e.prevStatus !== "spam" ? e.prevStatus : "new"; e.prevStatus = null; }
    e.updatedAt = nowIso();
    audit(spam ? "enquiry.spam" : "enquiry.restored", `Enquiry #${id}`, `${e.buyer.name} → ${storeBy(e.storeSlug)?.name ?? e.storeSlug}`, actor);
    commit();
    return e;
  }, 150);
}

export async function adminReassignEnquiry(id, storeSlug, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_ENQUIRY_ACTION(id, "reassign"), { storeSlug });
  return run(() => {
    const db = getDb();
    const e = db.enquiries.find((x) => x.id === id);
    if (!e) throw apiError("Enquiry not found.", 404);
    const to = mustStore(storeSlug);
    if (to.status !== "approved") throw apiError("Choose an active store.");
    if (e.storeSlug === storeSlug) throw apiError("The enquiry is already with this store.");
    const from = storeBy(e.storeSlug);
    e.storeSlug = storeSlug;
    e.status = "new";
    e.assignedTo = null;
    e.updatedAt = nowIso();
    e.notes = [...(e.notes ?? []), { at: nowIso(), author: actor, text: `Reassigned by Kartiva from ${from?.name ?? "another store"}.` }];
    const thread = e.threadId && db.threads.find((t) => t.id === e.threadId);
    if (thread) { thread.storeSlug = storeSlug; thread.unread.seller = thread.messages.length; }
    notify({ role: "seller", storeSlug }, "New enquiry (assigned by Kartiva)", `${e.buyer.name}: ${e.message.slice(0, 100)}`, ROUTES.SELLER.LEADS);
    audit("enquiry.reassigned", `Enquiry #${id}`, `${from?.name ?? "—"} → ${to.name}`, actor);
    commit();
    return e;
  });
}

export async function adminUpdateRfq(id, patch, actor) {
  if (!IS_MOCK) return remote("patch", API.ADMIN_RFQ(id), patch);
  return run(() => {
    const rfq = getDb().rfqs.find((r) => r.id === id);
    if (!rfq) throw apiError("Buy request not found.", 404);
    if (patch.status === "closed") {
      if (rfq.status !== "open") throw apiError("Only open buy requests can be closed.", 409);
      rfq.status = "closed";
      rfq.closedAt = nowIso();
      notify({ email: rfq.buyer.email, role: "buyer" }, "Buy request closed", `“${rfq.title}” was closed by Kartiva.`, ROUTES.ACCOUNT.ENQUIRIES);
      audit("rfq.closed", `RFQ #${id}`, rfq.title, actor);
    }
    if (patch.featured !== undefined) {
      rfq.featured = Boolean(patch.featured);
      audit(rfq.featured ? "rfq.featured" : "rfq.unfeatured", `RFQ #${id}`, rfq.title, actor);
    }
    commit();
    return rfq;
  }, 150);
}

export async function adminNotifyRfqSellers(id, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_RFQ_NOTIFY_SELLERS(id));
  return run(() => {
    const db = getDb();
    const rfq = db.rfqs.find((r) => r.id === id);
    if (!rfq) throw apiError("Buy request not found.", 404);
    const cat = db.categories.find((c) => c.slug === rfq.categorySlug);
    const family = new Set([rfq.categorySlug, ...db.categories.filter((c) => cat && c.parentId === cat.id).map((c) => c.slug)]);
    const slugs = [...new Set(db.products.filter((p) => !p.deletedAt && family.has(p.categorySlug)).map((p) => p.storeSlug))]
      .filter((slug) => storeBy(slug)?.status === "approved" && !rfq.quotes.some((q) => q.storeSlug === slug));
    dispatchRfq(rfq, slugs, { by: actor || "Kartiva" });
    rfq.notifiedAt = nowIso();
    audit("rfq.sellers_notified", `RFQ #${id}`, `${rfq.title} → ${slugs.length} sellers`, actor);
    commit();
    return { count: slugs.length };
  });
}

// ---------- Product requests (customer buy requests → sellers) ----------
// Every request with FULL buyer details (admin only), suggested sellers, and per-seller delivery status
// (sent → viewed → quoted). stores = approved stores the admin can forward to.
export async function getProductRequests() {
  if (!IS_MOCK) return get(API.ADMIN_PRODUCT_REQUESTS);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const catOf = (slug) => db.categories.find((c) => c.slug === slug);
    const rootOf = (slug) => { const c = catOf(slug); return c?.parentId ? db.categories.find((x) => x.id === c.parentId) : c; };
    const sellerSlugsIn = (slugs) => new Set(db.products.filter((p) => !p.deletedAt && slugs.has(p.categorySlug)).map((p) => p.storeSlug));
    const requests = db.rfqs.map((r) => {
      const root = rootOf(r.categorySlug);
      const family = new Set([r.categorySlug, ...(root ? [root.slug, ...db.categories.filter((c) => c.parentId === root.id).map((c) => c.slug)] : [])]);
      const suggested = [...sellerSlugsIn(family)].filter((slug) => storeBy(slug)?.status === "approved");
      const dispatches = (r.dispatches ?? []).map((d) => {
        const quote = r.quotes.find((q) => q.storeSlug === d.storeSlug) ?? null;
        return { ...d, quote, storeName: storeBy(d.storeSlug)?.name ?? d.storeSlug };
      });
      // Stores that quoted without a recorded dispatch (e.g. found it themselves) still show up.
      r.quotes.filter((q) => !dispatches.some((d) => d.storeSlug === q.storeSlug)).forEach((q) => dispatches.push({ at: q.createdAt, by: "self", note: "", quote: q, storeName: storeBy(q.storeSlug)?.name ?? q.storeSlug, storeSlug: q.storeSlug, viewedAt: q.createdAt }));
      const expired = r.status === "open" && new Date(r.deadline).getTime() < now;
      const stage = r.status === "awarded" ? "awarded" : r.status === "closed" || expired ? "closed" : r.quotes.length ? "quoted" : dispatches.length ? "awaiting" : "sourcing";
      return {
        ...r, categoryName: catOf(r.categorySlug)?.name ?? r.categorySlug, dispatches, rootName: root?.name ?? "", stage,
        stats: { quoted: dispatches.filter((d) => d.quote).length, sent: dispatches.length, viewed: dispatches.filter((d) => d.viewedAt).length },
        suggested,
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const stores = db.stores.filter((s) => s.status === "approved").map((s) => ({ city: s.city, kycStatus: s.kycStatus, name: s.name, plan: s.plan, slug: s.slug }));
    return { requests, stores };
  });
}

// Admin forwards a request to chosen sellers (any category) with an optional note; sellers get full details.
export async function adminForwardRfq(id, storeSlugs, note, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_PRODUCT_REQUEST_FORWARD(id), { note, storeSlugs });
  return run(() => {
    const db = getDb();
    const rfq = db.rfqs.find((r) => r.id === id);
    if (!rfq) throw apiError("Product request not found.", 404);
    if (rfq.status !== "open") throw apiError("Only open requests can be forwarded.", 409);
    if (!storeSlugs?.length) throw apiError("Choose at least one seller.");
    const sent = dispatchRfq(rfq, storeSlugs, { by: actor || "Kartiva", note: (note ?? "").trim().slice(0, 300) });
    audit("rfq.forwarded", `RFQ #${id}`, `${rfq.title} → ${sent.map((slug) => storeBy(slug)?.name ?? slug).join(", ")}`, actor);
    notify({ email: rfq.buyer.email, role: "buyer" }, "More suppliers contacted", `Kartiva sent “${rfq.title}” to ${sent.length} more supplier${sent.length === 1 ? "" : "s"}. Quotes will appear in My enquiries & quotes.`, ROUTES.ACCOUNT.ENQUIRIES);
    commit();
    return { count: sent.length };
  });
}

// ---------- KYC verification ----------
export async function getKycQueue() {
  if (!IS_MOCK) return get(API.ADMIN_KYC);
  return run(() => {
    const db = getDb();
    return db.stores.filter((s) => s.status !== "rejected").map((store) => {
      const docs = db.kycDocuments.filter((d) => d.storeSlug === store.slug).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      return { docs, lastUpload: docs[0]?.uploadedAt ?? null, pendingDocs: docs.filter((d) => d.status === "pending").length, store };
    });
  }, 200);
}

export async function reviewKycDocument(docId, decision, note, actor) {
  if (!IS_MOCK) return withCatalog(remote("post", API.ADMIN_KYC_REVIEW(docId, decision), { note }));
  return run(() => {
    const doc = getDb().kycDocuments.find((d) => d.id === docId);
    if (!doc) throw apiError("Document not found.", 404);
    if (!["verified", "rejected"].includes(decision)) throw apiError("Unknown decision.");
    if (decision === "rejected" && !note?.trim()) throw apiError("Give the seller a reason.");
    Object.assign(doc, { note: decision === "rejected" ? note.trim() : "", reviewedAt: nowIso(), reviewedBy: actor, status: decision });
    const store = recomputeKyc(doc.storeSlug);
    const label = doc.type.replace(/_/g, " ");
    notify({ role: "seller", storeSlug: doc.storeSlug }, decision === "verified" ? "KYC document verified" : "KYC document rejected",
      decision === "verified" ? `Your ${label} was verified. KYC status: ${store.kycStatus.replace(/_/g, " ")}.` : `Your ${label} was rejected — ${note.trim()}`, ROUTES.SELLER.BUSINESS);
    audit(`kyc.${decision}`, store.name, `${label} (${doc.fileName})${decision === "rejected" ? ` — ${note.trim()}` : ""}`, actor);
    commit();
    return store;
  }, 200);
}

export async function setTrustedBadge(slug, on, actor) {
  if (!IS_MOCK) return withCatalog(remote("post", API.ADMIN_STORE_ACTION(slug, "trusted"), { trusted: on }));
  return run(() => {
    const store = mustStore(slug);
    store.trustedManual = on;
    const others = (store.badges ?? []).filter((b) => b !== "trusted");
    store.badges = on ? [...others, "trusted"] : others;
    if (on) notify({ role: "seller", storeSlug: slug }, "Trusted Seller badge awarded", "Kartiva added the Trusted Seller badge to your store.", ROUTES.SELLER.BUSINESS);
    audit(on ? "store.trusted_added" : "store.trusted_removed", store.name, on ? "Trusted Seller badge added manually" : "Trusted Seller badge removed", actor);
    commit();
    return store;
  }, 150);
}

// Simulated GST portal lookup: format + state code must match the store's registered state.
export async function verifyStoreGstin(slug, actor) {
  if (!IS_MOCK) return withCatalog(remote("post", API.ADMIN_STORE_ACTION(slug, "verify-gstin")));
  return run(() => {
    const store = mustStore(slug);
    const gstin = String(store.gstin ?? "").toUpperCase();
    const state = INDIAN_STATES.find((s) => s.name === store.state);
    const formatOk = GSTIN_PATTERN.test(gstin);
    const stateOk = Boolean(state) && gstin.slice(0, 2) === state.code;
    const valid = formatOk && stateOk;
    const seed = [...gstin].reduce((t, c) => t + c.charCodeAt(0), 0);
    const response = {
      checkedAt: nowIso(), formatOk, gstin, legalName: valid ? `${store.name.toUpperCase()}${/pvt|ltd|llp/i.test(store.name) ? "" : " (PROPRIETORSHIP)"}` : null,
      pan: gstin.slice(2, 12), registeredOn: valid ? new Date(Date.UTC(Math.min(2025, Math.max(2017, store.yearEstablished ?? 2017)), seed % 12, (seed % 27) + 1)).toISOString() : null,
      stateCode: gstin.slice(0, 2), stateName: INDIAN_STATES.find((s) => s.code === gstin.slice(0, 2))?.name ?? null, stateOk, status: valid ? "Active" : "Not found", storeState: store.state, taxpayerType: "Regular", valid,
    };
    store.gstVerified = valid;
    store.gstCheck = response;
    refreshBadges(store);
    if (valid) notify({ role: "seller", storeSlug: slug }, "GSTIN verified", `GSTIN ${gstin} was verified with the GST portal.`, ROUTES.SELLER.BUSINESS);
    audit(valid ? "store.gst_verified" : "store.gst_failed", store.name, `${gstin} — ${valid ? "Active" : formatOk ? "state code mismatch" : "invalid format"}`, actor);
    commit();
    return response;
  }, 600);
}

// ---------- Membership plans ----------
export async function getPlansOverview() {
  if (!IS_MOCK) return get(API.ADMIN_PLANS);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const subscriptions = db.subscriptions.map((s) => {
      const plan = db.plans.find((p) => p.code === s.planCode);
      return { ...s, leadCredits: plan?.leadCredits ?? null, renewalDue: s.status === "active" && Boolean(s.endsAt) && ms(s.endsAt) - now < 30 * DAY_MS, planName: plan?.name ?? s.planCode, storeName: storeBy(s.storeSlug)?.name ?? s.storeSlug };
    }).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const activePaid = subscriptions.filter((s) => s.status === "active" && s.amount > 0);
    const active = subscriptions.filter((s) => s.status === "active");
    const liveStores = db.stores.filter((s) => s.status === "approved");
    const mix = db.plans.map((p) => ({ code: p.code, count: liveStores.filter((s) => (s.plan ?? "free") === p.code).length, name: p.name }));
    const total = mix.reduce((t, m) => t + m.count, 0) || 1;
    const commission = liveSubs().reduce((t, s) => t + s.commissionAmount, 0);
    const ads = db.ads.reduce((t, a) => t + (a.spend ?? 0), 0);
    const memberships = db.subscriptions.filter((s) => s.amount > 0).reduce((t, s) => t + s.amount, 0);
    const streamTotal = commission + ads + memberships || 1;
    return {
      streams: [["commission", commission], ["ads", ads], ["memberships", memberships]].map(([key, value]) => ({ key, share: Math.round((value / streamTotal) * 100), value: round2(value) })),
      kpis: {
        activePaid: activePaid.length, arr: activePaid.reduce((t, s) => t + s.amount, 0),
        collected: db.subscriptions.filter((s) => s.amount > 0).reduce((t, s) => t + s.amount, 0),
        renewalsDue: active.filter((s) => s.endsAt && ms(s.endsAt) > now && ms(s.endsAt) - now < 30 * DAY_MS).length,
      },
      mix: mix.map((m) => ({ ...m, share: Math.round((m.count / total) * 100) })),
      plans: db.plans,
      stores: db.stores.filter((s) => s.status === "approved").map((s) => ({ name: s.name, plan: s.plan ?? "free", slug: s.slug })).sort((a, b) => a.name.localeCompare(b.name)),
      subscriptions,
    };
  });
}

export async function savePlan(plan, actor) {
  if (!IS_MOCK) return remote("patch", API.ADMIN_PLAN(plan.id), plan);
  return run(() => {
    const existing = getDb().plans.find((p) => p.id === plan.id);
    if (!existing) throw apiError("Plan not found.", 404);
    const price = Number(plan.priceYearly);
    const discount = Number(plan.commissionDiscount);
    if (!(price >= 0) || !(discount >= 0 && discount <= 10)) throw apiError("Check the price and commission discount.");
    const credits = plan.leadCredits === "" || plan.leadCredits == null ? null : Number(plan.leadCredits);
    if (credits != null && !(credits >= 0)) throw apiError("Lead credits must be 0 or more.");
    if (existing.code === "free" && price > 0) throw apiError("The Starter plan must stay free.");
    Object.assign(existing, {
      commissionDiscount: discount, features: (plan.features ?? []).map((f) => String(f).trim()).filter(Boolean), isActive: existing.code === "free" ? true : plan.isActive !== false,
      leadCredits: credits, name: String(plan.name).trim(), priceYearly: price,
    });
    audit("plan.updated", `Plan ${existing.code}`, `${existing.name} · ₹${price}/yr · ${credits ?? "unlimited"} credits · ${discount}% off commission`, actor);
    commit();
    return existing;
  });
}

export async function grantPlan({ months, planCode, storeSlug }, actor) {
  if (!IS_MOCK) return withCatalog(remote("post", API.ADMIN_SUBSCRIPTION_GRANT, { months, planCode, storeSlug }));
  return run(() => {
    const db = getDb();
    const store = mustStore(storeSlug);
    const plan = db.plans.find((p) => p.code === planCode && p.code !== "free");
    if (!plan) throw apiError("Choose a paid plan.");
    const span = Number(months);
    if (!(span >= 1 && span <= 36)) throw apiError("Duration must be 1–36 months.");
    const current = db.subscriptions.find((s) => s.storeSlug === storeSlug && s.status === "active" && s.planCode === planCode && s.endsAt);
    if (current) {
      const from = Math.max(Date.now(), ms(current.endsAt));
      current.endsAt = new Date(from + span * 30 * DAY_MS).toISOString();
      audit("subscription.extended", store.name, `${plan.name} extended by ${span} months (complimentary)`, actor);
    } else {
      db.subscriptions.filter((s) => s.storeSlug === storeSlug && s.status === "active").forEach((s) => { s.status = "replaced"; });
      db.subscriptions.push({
        amount: 0, complimentary: true, endsAt: new Date(Date.now() + span * 30 * DAY_MS).toISOString(), grantedBy: actor, id: nextId(db.subscriptions), invoiceNumber: null,
        leadCreditsUsed: 0, planCode, startsAt: nowIso(), status: "active", storeSlug,
      });
      audit("subscription.granted", store.name, `${plan.name} for ${span} months (complimentary)`, actor);
    }
    store.plan = planCode;
    refreshBadges(store);
    notify({ role: "seller", storeSlug }, `${plan.name} activated`, `Kartiva has given your store ${plan.name} for ${span} months at no charge.`, ROUTES.SELLER.PLAN);
    commit();
    return store;
  });
}

export async function cancelSubscription(id, actor) {
  if (!IS_MOCK) return withCatalog(remote("post", API.ADMIN_SUBSCRIPTION_CANCEL(id)));
  return run(() => {
    const db = getDb();
    const sub = db.subscriptions.find((s) => s.id === id);
    if (!sub) throw apiError("Subscription not found.", 404);
    if (sub.status !== "active" || sub.planCode === "free") throw apiError("Only active paid plans can be cancelled.", 409);
    sub.status = "cancelled";
    sub.cancelledAt = nowIso();
    const store = storeBy(sub.storeSlug);
    if (store) {
      store.plan = "free";
      refreshBadges(store);
      if (store.trustedManual && !store.badges.includes("trusted")) store.badges.push("trusted");
      notify({ role: "seller", storeSlug: store.slug }, "Membership cancelled", "Your store is now on the free Starter plan.", ROUTES.SELLER.PLAN);
    }
    audit("subscription.cancelled", store?.name ?? sub.storeSlug, `Plan ${sub.planCode} cancelled`, actor);
    commit();
    return sub;
  });
}

// ---------- Support desk ----------
const firstResponseAt = (t) => t.messages.find((m) => m.from === "admin")?.at ?? null;

export async function getAdminTickets() {
  if (!IS_MOCK) return get(API.ADMIN_TICKETS);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const tickets = db.tickets.map((t) => ({
      ...t, firstResponseAt: firstResponseAt(t), overdue: ["open", "in_progress"].includes(t.status) && ms(t.slaDueAt) < now,
      storeName: t.raisedBy.storeSlug ? storeBy(t.raisedBy.storeSlug)?.name : null,
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const responded = tickets.filter((t) => t.firstResponseAt);
    return {
      kpis: {
        avgFirstResponseHours: responded.length ? responded.reduce((s, t) => s + (ms(t.firstResponseAt) - ms(t.createdAt)) / HOUR, 0) / responded.length : null,
        open: tickets.filter((t) => ["open", "in_progress"].includes(t.status)).length,
        overdue: tickets.filter((t) => t.overdue).length,
        resolvedWeek: tickets.filter((t) => ["resolved", "closed"].includes(t.status) && now - ms(t.updatedAt) < 7 * DAY_MS).length,
      },
      staff: db.adminStaff.filter((s) => s.status === "active").map((s) => ({ name: s.name, role: s.role })),
      tickets,
    };
  }, 200);
}

function mustTicket(id) {
  const t = getDb().tickets.find((x) => x.id === id);
  if (!t) throw apiError("Ticket not found.", 404);
  return t;
}
function notifyRequester(ticket, title, body) {
  const by = ticket.raisedBy;
  if (by.role === "seller") notify({ role: "seller", storeSlug: by.storeSlug }, title, body, ROUTES.SELLER.SUPPORT);
  else notify({ email: by.email, role: "buyer" }, title, body, ROUTES.ACCOUNT.SUPPORT);
}

export async function adminReplyTicket(id, body, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_TICKET_REPLY(id), { body });
  return run(() => {
    const t = mustTicket(id);
    const text = String(body ?? "").trim();
    if (!text) throw apiError("Write a reply first.");
    const all = getDb().tickets.flatMap((x) => x.messages.map((m) => m.id));
    t.messages.push({ at: nowIso(), author: actor, body: text, from: "admin", id: Math.max(0, ...all) + 1 });
    if (t.status === "open") t.status = "in_progress";
    t.assignee ??= actor;
    t.updatedAt = nowIso();
    notifyRequester(t, `Kartiva replied to ${t.number}`, text.slice(0, 120));
    audit("ticket.replied", t.number, t.subject, actor);
    commit();
    return t;
  }, 200);
}

export async function adminUpdateTicket(id, patch, actor) {
  if (!IS_MOCK) return remote("patch", API.ADMIN_TICKET(id), patch);
  return run(() => {
    const t = mustTicket(id);
    const changes = [];
    if (patch.status && patch.status !== t.status) {
      if (!["open", "in_progress", "resolved", "closed"].includes(patch.status)) throw apiError("Unknown status.");
      changes.push(`status ${t.status} → ${patch.status}`);
      t.status = patch.status;
      if (["resolved", "closed"].includes(t.status)) notifyRequester(t, `${t.number} ${t.status}`, `Your ticket “${t.subject}” was marked ${t.status}.`);
    }
    if (patch.priority && patch.priority !== t.priority) {
      if (!SLA_HOURS[patch.priority]) throw apiError("Unknown priority.");
      changes.push(`priority ${t.priority} → ${patch.priority}`);
      t.priority = patch.priority;
      t.slaDueAt = new Date(ms(t.createdAt) + SLA_HOURS[t.priority] * HOUR).toISOString();
    }
    if (patch.assignee !== undefined && patch.assignee !== t.assignee) {
      changes.push(`assignee → ${patch.assignee || "unassigned"}`);
      t.assignee = patch.assignee || null;
    }
    if (!changes.length) return t;
    t.updatedAt = nowIso();
    audit("ticket.updated", t.number, changes.join(", "), actor);
    commit();
    return t;
  }, 150);
}

export async function addTicketNote(id, text, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_TICKET_NOTES(id), { text });
  return run(() => {
    const t = mustTicket(id);
    if (!String(text ?? "").trim()) throw apiError("Write a note first.");
    t.internalNotes = [...(t.internalNotes ?? []), { at: nowIso(), author: actor, text: text.trim() }];
    audit("ticket.note", t.number, "Internal note added", actor);
    commit();
    return t;
  }, 150);
}

// ---------- Content (CMS, announcement bar, homepage sections) ----------
export const DEFAULT_HOME_SECTIONS = { buyRequestBanner: true, featuredStores: true, heroCarousel: true, sponsoredRow: true };
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function getAdminContent() {
  if (!IS_MOCK) return get(API.ADMIN_CONTENT);
  return run(() => {
    const db = getDb();
    return { announcement: db.announcement, homeSections: { ...DEFAULT_HOME_SECTIONS, ...(db.platform.homeSections ?? {}) }, pages: db.cmsPages };
  }, 200);
}

export async function saveCmsPage(page, actor) {
  if (!IS_MOCK) return page.id ? remote("patch", API.ADMIN_PAGE(page.id), page) : remote("post", API.ADMIN_PAGES, page);
  return run(() => {
    const db = getDb();
    const title = String(page.title ?? "").trim();
    const slug = String(page.slug ?? "").trim();
    if (!title) throw apiError("Add a title.");
    if (!SLUG_RE.test(slug)) throw apiError("Slug must be lowercase words joined by hyphens (e.g. seller-policy).");
    if (db.cmsPages.some((p) => p.slug === slug && p.id !== page.id)) throw apiError("Another page already uses this slug.", 409);
    let saved;
    if (page.id) {
      saved = db.cmsPages.find((p) => p.id === page.id);
      if (!saved) throw apiError("Page not found.", 404);
      Object.assign(saved, { body: String(page.body ?? ""), published: Boolean(page.published), slug, title, updatedAt: nowIso(), updatedBy: actor });
    } else {
      saved = { body: String(page.body ?? ""), id: nextId(db.cmsPages), published: Boolean(page.published), slug, title, updatedAt: nowIso(), updatedBy: actor };
      db.cmsPages.push(saved);
    }
    audit(page.id ? "page.updated" : "page.created", `Page /${slug}`, `${title}${saved.published ? " (published)" : " (draft)"}`, actor);
    commit();
    return saved;
  });
}

export async function setCmsPublished(id, published, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_PAGE_PUBLISH(id), { published });
  return run(() => {
    const page = getDb().cmsPages.find((p) => p.id === id);
    if (!page) throw apiError("Page not found.", 404);
    page.published = published;
    page.updatedAt = nowIso();
    audit(published ? "page.published" : "page.unpublished", `Page /${page.slug}`, page.title, actor);
    commit();
    return page;
  }, 150);
}

export async function saveAnnouncement(value, actor) {
  if (!IS_MOCK) return withCatalog(remote("put", API.ADMIN_ANNOUNCEMENT, value));
  return run(() => {
    const db = getDb();
    const text = String(value.text ?? "").trim();
    const link = String(value.link ?? "").trim();
    if (value.active && !text) throw apiError("Add the announcement text.");
    if (link && !/^\/(?!\/)|^https:\/\//.test(link)) throw apiError("Link must be an internal path (/...) or an https:// URL.");
    Object.assign(db.announcement, { active: Boolean(value.active), link: link || null, text });
    audit("announcement.updated", "Announcement bar", `${db.announcement.active ? "On" : "Off"} · ${text.slice(0, 80)}`, actor);
    commit();
    return db.announcement;
  });
}

export async function saveHomeSections(sections, actor) {
  if (!IS_MOCK) return withCatalog(remote("put", API.ADMIN_HOME_SECTIONS, sections));
  return run(() => {
    const p = getDb().platform;
    p.homeSections = { ...DEFAULT_HOME_SECTIONS, ...(p.homeSections ?? {}), ...Object.fromEntries(Object.keys(DEFAULT_HOME_SECTIONS).map((k) => [k, sections[k] !== false])) };
    audit("home.sections", "Homepage", Object.entries(p.homeSections).map(([k, v]) => `${k}: ${v ? "on" : "off"}`).join(", "), actor);
    commit();
    return p.homeSections;
  }, 150);
}

// ---------- Broadcasts ----------
function audienceSize(db, { audience, planCode, storeSlug }) {
  const sellers = db.stores.filter((s) => s.status === "approved");
  const buyers = db.buyers.filter((b) => b.isActive !== false).length;
  if (audience === "sellers") return { label: `All sellers (${sellers.length})`, recipients: sellers.length };
  if (audience === "buyers") return { label: `All buyers (${buyers})`, recipients: buyers };
  if (audience === "everyone") return { label: `Everyone (${sellers.length + buyers})`, recipients: sellers.length + buyers };
  if (audience === "store") {
    const store = sellers.find((s) => s.slug === storeSlug);
    return { label: store ? store.name : "—", recipients: store ? 1 : 0 };
  }
  if (audience === "plan") {
    const plan = db.plans.find((p) => p.code === planCode);
    const n = sellers.filter((s) => (s.plan ?? "free") === planCode).length;
    return { label: `${plan?.name ?? planCode} sellers (${n})`, recipients: n };
  }
  return { label: "—", recipients: 0 };
}

export async function getBroadcastData() {
  if (!IS_MOCK) return get(API.ADMIN_BROADCASTS);
  return run(() => {
    const db = getDb();
    const sellers = db.stores.filter((s) => s.status === "approved");
    return {
      counts: {
        buyers: db.buyers.filter((b) => b.isActive !== false).length,
        plans: Object.fromEntries(db.plans.map((p) => [p.code, sellers.filter((s) => (s.plan ?? "free") === p.code).length])),
        sellers: sellers.length,
      },
      history: [...db.broadcasts].sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
      plans: db.plans.map((p) => ({ code: p.code, name: p.name })),
      stores: sellers.map((s) => ({ name: s.name, slug: s.slug })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, 200);
}

export async function sendBroadcast(values, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_BROADCASTS, values);
  const { audience, body, channels = [], planCode, storeSlug, title } = values;
  const db = getDb();
  if (!String(title ?? "").trim() || !String(body ?? "").trim()) throw apiError("Add a title and a message.");
  if (!channels.length) throw apiError("Choose at least one channel.");
  const size = audienceSize(db, { audience, planCode, storeSlug });
  if (!size.recipients) throw apiError("This audience has no recipients.");
  const link = values.link?.trim() || null;
  if (channels.includes("in_app")) {
    if (audience === "sellers") notify({ role: "seller" }, title.trim(), body.trim(), link);
    if (audience === "buyers") notify({ role: "buyer" }, title.trim(), body.trim(), link);
    if (audience === "everyone") notify({ role: "all" }, title.trim(), body.trim(), link);
    if (audience === "store") notify({ role: "seller", storeSlug }, title.trim(), body.trim(), link);
    if (audience === "plan") db.stores.filter((s) => s.status === "approved" && (s.plan ?? "free") === planCode).forEach((s) => notify({ role: "seller", storeSlug: s.slug }, title.trim(), body.trim(), link));
  }
  const entry = {
    audience, audienceLabel: size.label, body: body.trim(), channels, id: nextId(db.broadcasts), planCode: audience === "plan" ? planCode : undefined, recipients: size.recipients,
    sentAt: nowIso(), sentBy: actor, storeSlug: audience === "store" ? storeSlug : undefined, title: title.trim(),
  };
  db.broadcasts.unshift(entry);
  audit("broadcast.sent", `Broadcast #${entry.id}`, `${entry.title} → ${size.label} via ${channels.join(" + ")}`, actor);
  commit();
  if (channels.includes("email")) {
    // One outbox entry per broadcast; the mailing-list alias stands in for the expanded recipient list.
    const store = audience === "store" ? storeBy(storeSlug) : null;
    const alias = store?.ownerEmail ?? `${audience === "plan" ? `${planCode}-sellers` : audience === "store" ? storeSlug : `all-${audience}`}@lists.kartiva.in`;
    await sendEmail({ message: `${body.trim()}\n\n— Sent to ${size.label}`, sentBy: actor, subject: `[${size.label}] ${title.trim()}`, to: alias });
  }
  return mockDelay(entry, 300);
}

// ---------- Admin staff ----------
export const ADMIN_ROLES = ["super_admin", "operations", "finance", "catalogue", "support"];

export async function getAdminStaff() {
  if (!IS_MOCK) return get(API.ADMIN_STAFF);
  return run(() => getDb().adminStaff, 150);
}

export async function inviteAdminStaff({ email, name, role }, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_STAFF, { email, name, role });
  return run(() => {
    const db = getDb();
    const clean = String(email).trim().toLowerCase();
    if (!ADMIN_ROLES.includes(role)) throw apiError("Choose a role.");
    if (db.adminStaff.some((s) => s.email === clean)) throw apiError("This email is already on the team.", 409);
    const member = { email: clean, id: nextId(db.adminStaff), invitedAt: nowIso(), invitedBy: actor, lastActiveAt: null, name: String(name).trim(), role, status: "invited", twoFactor: false };
    db.adminStaff.push(member);
    audit("staff.invited", member.email, `${member.name} invited as ${role}`, actor);
    commit();
    return member;
  });
}

export async function updateAdminStaff(id, patch, actor) {
  if (!IS_MOCK) return remote("patch", API.ADMIN_STAFF_MEMBER(id), patch);
  return run(() => {
    const db = getDb();
    const member = db.adminStaff.find((s) => s.id === id);
    if (!member) throw apiError("Team member not found.", 404);
    const supers = db.adminStaff.filter((s) => s.role === "super_admin" && s.status === "active");
    const lastSuper = member.role === "super_admin" && supers.length <= 1 && member.status === "active";
    if (patch.role && patch.role !== member.role) {
      if (!ADMIN_ROLES.includes(patch.role)) throw apiError("Unknown role.");
      if (lastSuper) throw apiError("Keep at least one active super admin.", 409);
      audit("staff.role", member.email, `${member.role} → ${patch.role}`, actor);
      member.role = patch.role;
    }
    if (patch.status && patch.status !== member.status) {
      if (patch.status === "disabled" && lastSuper) throw apiError("Keep at least one active super admin.", 409);
      if (patch.status === "disabled" && member.name === actor) throw apiError("You can't disable your own account.", 409);
      audit(patch.status === "disabled" ? "staff.disabled" : "staff.enabled", member.email, member.name, actor);
      member.status = patch.status;
    }
    commit();
    return member;
  }, 150);
}

export async function removeAdminStaff(id, actorEmail, actor) {
  if (!IS_MOCK) return remote("delete", API.ADMIN_STAFF_MEMBER(id));
  return run(() => {
    const db = getDb();
    const member = db.adminStaff.find((s) => s.id === id);
    if (!member) throw apiError("Team member not found.", 404);
    if (member.email === actorEmail) throw apiError("You can't remove yourself.", 409);
    if (member.role === "super_admin" && db.adminStaff.filter((s) => s.role === "super_admin").length <= 1) throw apiError("Keep at least one super admin.", 409);
    db.adminStaff.splice(db.adminStaff.indexOf(member), 1);
    audit("staff.removed", member.email, member.name, actor);
    commit();
    return id;
  }, 150);
}

// ---------- Risk & fraud ----------
// Dismissed flags live on the persisted platform object (top-level keys added after seeding are not persisted by mockDb).
const dismissedList = (db) => (db.platform.dismissedRiskFlags ??= []);
const last10 = (p) => String(p ?? "").replace(/\D/g, "").slice(-10);

export async function getRiskFlags() {
  if (!IS_MOCK) return get(API.ADMIN_RISK);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const flags = [];
    const add = (f) => flags.push(f);
    const buyerByEmail = Object.fromEntries(db.buyers.map((b) => [b.email, b]));

    // Buyers: cancellations + returns
    const perBuyer = {};
    db.orders.forEach((o) => {
      const b = (perBuyer[o.buyer.email] ??= { cancelled: 0, email: o.buyer.email, name: o.buyer.name, returns: 0, subs: 0, undelivered: 0 });
      o.subOrders.forEach((s) => { b.subs += 1; if (s.status === "cancelled") b.cancelled += 1; if (s.status === "undelivered") b.undelivered += 1; });
    });
    db.returns.forEach((r) => { if (perBuyer[r.buyer.email]) perBuyer[r.buyer.email].returns += 1; });
    Object.values(perBuyer).forEach((b) => {
      const bad = b.cancelled + b.returns + b.undelivered;
      if (bad < 2) return;
      add({
        entity: { email: b.email, kind: "buyer", name: b.name }, key: `buyer-abuse:${b.email}`, metric: `${Math.round((bad / b.subs) * 100)}%`,
        reason: { cancelled: b.cancelled, returns: b.returns, subs: b.subs, undelivered: b.undelivered }, severity: bad >= 3 || b.undelivered >= 2 ? "high" : "medium", type: "buyer_returns",
        codBlocked: Boolean(buyerByEmail[b.email]?.codBlocked),
      });
    });
    // High-value COD not delivered yet
    db.orders.filter((o) => o.paymentMethod === "cod" && o.grandTotal > 5000).forEach((o) => {
      const open = o.subOrders.filter((s) => !["delivered", "cancelled", "undelivered"].includes(s.status));
      if (!open.length) return;
      add({
        codBlocked: Boolean(buyerByEmail[o.buyer.email]?.codBlocked), entity: { email: o.buyer.email, kind: "order", name: o.number }, key: `cod-high:${o.number}`, metric: o.grandTotal,
        reason: { amount: o.grandTotal, buyer: o.buyer.name, status: open[0].status }, severity: o.grandTotal > 10000 ? "high" : "medium", type: "cod_high_value",
      });
    });
    // COD-blocked buyers (watch list)
    db.buyers.filter((b) => b.codBlocked).forEach((b) => add({ codBlocked: true, entity: { email: b.email, kind: "buyer", name: b.name }, key: `cod-blocked:${b.email}`, reason: {}, severity: "low", type: "cod_blocked" }));
    // Sellers: cancellation rate / returns
    db.stores.filter((s) => s.status !== "rejected").forEach((store) => {
      const subs = db.orders.flatMap((o) => o.subOrders).filter((s) => s.storeSlug === store.slug);
      const cancelled = subs.filter((s) => s.status === "cancelled").length;
      const returns = db.returns.filter((r) => r.storeSlug === store.slug).length;
      const rate = subs.length ? (cancelled / subs.length) * 100 : 0;
      if ((subs.length >= 5 && rate >= 10) || returns >= 2) {
        add({ entity: { kind: "store", name: store.name, slug: store.slug, status: store.status }, key: `seller-quality:${store.slug}`, metric: `${rate.toFixed(1)}%`, reason: { cancelled, rate, returns, subs: subs.length }, severity: rate >= 15 || returns >= 3 ? "high" : "medium", type: "seller_quality" });
      }
      // KYC not verified but selling
      const recent = subs.filter((s) => s.status !== "cancelled").length;
      if (store.status === "approved" && store.kycStatus !== "verified" && recent > 0) {
        add({ entity: { kind: "store", name: store.name, slug: store.slug, status: store.status }, key: `kyc-selling:${store.slug}`, reason: { kycStatus: store.kycStatus, orders: recent }, severity: "high", type: "kyc_selling" });
      }
    });
    // Spam enquiries
    db.enquiries.filter((e) => e.status === "spam").forEach((e) => add({ entity: { email: e.buyer.email, kind: "enquiry", name: e.buyer.name }, key: `spam:${e.id}`, reason: { message: e.message, store: storeBy(e.storeSlug)?.name }, severity: "low", type: "spam_enquiry" }));
    // Duplicate phone numbers across buyer accounts
    const phones = {};
    const addPhone = (phone, email, name) => { const p = last10(phone); if (p.length === 10) ((phones[p] ??= new Map()).set(email, name)); };
    db.buyers.forEach((b) => addPhone(b.address?.phone, b.email, b.name));
    db.users.filter((u) => u.role === "buyer").forEach((u) => addPhone(u.phone, u.email, `${u.firstName} ${u.lastName}`));
    db.orders.forEach((o) => addPhone(o.buyer.phone, o.buyer.email, o.buyer.name));
    Object.entries(phones).filter(([, m]) => m.size > 1).forEach(([phone, m]) => add({
      entity: { kind: "phone", name: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` }, key: `dup-phone:${phone}`, reason: { accounts: [...m.values()], emails: [...m.keys()] }, severity: m.size > 2 ? "high" : "medium", type: "duplicate_phone",
    }));

    flags.forEach((f) => { f.isBuyer = Boolean(f.entity.email && buyerByEmail[f.entity.email]); });
    const dismissed = new Set(dismissedList(db));
    const visible = flags.filter((f) => !dismissed.has(f.key));
    const rank = { high: 0, low: 2, medium: 1 };
    visible.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return { checkedAt: new Date(now).toISOString(), dismissedCount: flags.length - visible.length, flags: visible };
  }, 300);
}

export async function dismissRiskFlag(key, actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_RISK_DISMISS, { key });
  return run(() => {
    const list = dismissedList(getDb());
    if (!list.includes(key)) list.push(key);
    audit("risk.dismissed", "Risk flag", key, actor);
    commit();
    return key;
  }, 150);
}

export async function restoreRiskFlags(actor) {
  if (!IS_MOCK) return remote("post", API.ADMIN_RISK_RESTORE);
  return run(() => {
    const list = dismissedList(getDb());
    const n = list.length;
    list.splice(0, n);
    audit("risk.restored", "Risk flags", `${n} dismissed flags restored`, actor);
    commit();
    return n;
  }, 150);
}

// ---------- Analytics ----------
function prng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const share = (items, total) => items.map((x) => ({ ...x, share: total ? Math.round((x.value / total) * 100) : 0 }));

export async function getAdminAnalytics(days = 30) {
  if (!IS_MOCK) return get(API.ADMIN_ANALYTICS, { days });
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const start = now - days * DAY_MS;
    const inRange = (iso) => ms(iso) > start && ms(iso) <= now;
    const subs = liveSubs().filter((s) => inRange(s.createdAt));
    const orders = db.orders.filter((o) => inRange(o.createdAt) && o.subOrders.some((s) => s.status !== "cancelled"));
    const gmv = subs.reduce((t, s) => t + s.total, 0);

    const bucketDays = days <= 30 ? 3 : 7;
    const buckets = Math.ceil(days / bucketDays);
    const trend = Array.from({ length: buckets }, (_, i) => {
      const end = now - (buckets - 1 - i) * bucketDays * DAY_MS;
      const from = end - bucketDays * DAY_MS;
      const inB = subs.filter((s) => ms(s.createdAt) > from && ms(s.createdAt) <= end);
      return { gmv: Math.round(inB.reduce((t, s) => t + s.total, 0)), label: new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), orders: new Set(inB.map((s) => s.order.number)).size };
    });

    const firstOrder = {};
    [...db.orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((o) => { firstOrder[o.buyer.email] ??= o.createdAt; });
    const buyerEmails = [...new Set(orders.map((o) => o.buyer.email))];
    const newBuyers = buyerEmails.filter((e) => inRange(firstOrder[e])).length;

    const byCat = {};
    subs.forEach((s) => s.items.forEach((it) => {
      const product = db.products.find((p) => p.id === it.productId);
      const top = topCategoryOf(product?.categorySlug);
      const k = top?.name ?? "Other";
      byCat[k] = (byCat[k] ?? 0) + it.lineTotal;
    }));
    const catItems = Object.entries(byCat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const byState = {};
    subs.forEach((s) => { const k = s.order.address.state; byState[k] = (byState[k] ?? 0) + s.total; });
    const stateItems = Object.entries(byState).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    const leaderboard = db.stores.map((store) => {
      const own = allSubs().filter((s) => s.storeSlug === store.slug && inRange(s.createdAt));
      const live = own.filter((s) => s.status !== "cancelled");
      return {
        cancelRate: own.length ? (own.filter((s) => s.status === "cancelled").length / own.length) * 100 : 0, gmv: live.reduce((t, s) => t + s.total, 0), name: store.name,
        orders: live.length, plan: store.plan ?? "free", rating: store.rating, slug: store.slug, store,
      };
    }).filter((r) => r.orders > 0).sort((a, b) => b.gmv - a.gmv);

    // Sample traffic: synthesised deterministically from real order counts (no analytics backend yet).
    const rand = prng(days * 7919 + orders.length);
    const cart = Math.round(orders.length * (3.1 + rand() * 0.8));
    const views = Math.round(cart * (6 + rand() * 2));
    const sessions = Math.round(views * (1.6 + rand() * 0.4));
    const funnel = [["sessions", sessions], ["views", views], ["cart", cart], ["orders", orders.length]].map(([key, value]) => ({ key, rate: sessions ? (value / sessions) * 100 : 0, value }));

    const enquiries = db.enquiries.filter((e) => inRange(e.createdAt));
    const rfqs = db.rfqs.filter((r) => inRange(r.createdAt));
    const quotes = db.rfqs.flatMap((r) => r.quotes).filter((q) => inRange(q.createdAt));
    const decided = db.rfqs.flatMap((r) => r.quotes).filter((q) => q.status !== "submitted");
    const commission = subs.reduce((t, s) => t + s.commissionAmount, 0);
    const adsRev = db.ads.reduce((t, a) => {
      if (!a.spend) return t;
      const aStart = ms(`${a.startsAt}T00:00:00Z`);
      const aEnd = Math.min(now, ms(`${a.endsAt}T23:59:59Z`));
      const overlap = Math.max(0, Math.min(now, aEnd) - Math.max(start, aStart));
      return t + (aEnd > aStart ? (a.spend * overlap) / (aEnd - aStart) : 0);
    }, 0);
    // Membership fees are recognised pro-rata over the subscription term (yearly fee / 365 per day in range).
    const memberships = db.subscriptions.filter((s) => s.amount > 0 && s.endsAt).reduce((t, s) => {
      const overlap = Math.max(0, Math.min(now, ms(s.endsAt)) - Math.max(start, ms(s.startsAt)));
      return t + (s.amount * overlap) / Math.max(DAY_MS, ms(s.endsAt) - ms(s.startsAt));
    }, 0);
    const revenue = [["commission", commission], ["ads", adsRev], ["memberships", memberships]].map(([key, value]) => ({ key, value: Math.round(value) }));
    const revTotal = revenue.reduce((t, r) => t + r.value, 0);

    return {
      byCategory: share(catItems, gmv), byState: share(stateItems, gmv),
      funnel, leaderboard,
      leads: { enquiries: enquiries.length, quotes: quotes.length, rfqs: rfqs.length, winRate: decided.length ? (decided.filter((q) => q.status === "accepted").length / decided.length) * 100 : 0, won: enquiries.filter((e) => e.status === "won").length },
      revenue: revenue.map((r) => ({ ...r, share: revTotal ? Math.round((r.value / revTotal) * 100) : 0 })), revenueTotal: revTotal,
      totals: { aov: orders.length ? gmv / orders.length : 0, buyers: buyerEmails.length, gmv, newBuyers, orders: orders.length, returningBuyers: buyerEmails.length - newBuyers },
      trend,
    };
  }, 350);
}

// ---------- Transactions (unified money ledger) ----------
export async function getTransactions() {
  if (!IS_MOCK) return get(API.ADMIN_TRANSACTIONS);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const rows = [];
    const add = (r) => rows.push({ ...r, id: `${r.type}-${r.reference}-${rows.length}` });
    db.orders.forEach((o) => {
      if (o.paymentMethod === "online") {
        const status = o.paymentStatus === "pending_payment" ? "pending" : now - ms(o.createdAt) > 2 * DAY_MS ? "reconciled" : "captured";
        add({ amount: o.grandTotal, date: o.createdAt, method: "online", party: o.buyer.name, reference: o.number, status, type: "payment" });
      } else {
        o.subOrders.filter((s) => s.status === "delivered").forEach((s) => add({
          amount: s.total, date: s.deliveredAt ?? o.createdAt, method: "cod", party: `${o.buyer.name} → ${s.storeName}`, reference: s.number, status: s.settlementId ? "reconciled" : "pending", type: "cod",
        }));
      }
    });
    db.refunds.forEach((r) => add({
      amount: -r.amount, date: r.processedAt ?? r.createdAt, method: r.method === "gateway" ? "online" : "bank_transfer", party: db.orders.find((o) => o.number === r.orderNumber)?.buyer.name ?? "—",
      reference: r.utr ? `${r.subOrderNumber} · ${r.utr}` : r.subOrderNumber, status: r.status === "processed" ? "reconciled" : "pending", type: "refund",
    }));
    const subByNumber = Object.fromEntries(db.orders.flatMap((o) => o.subOrders).map((s) => [s.number, s]));
    db.settlements.forEach((s) => {
      const store = storeBy(s.storeSlug);
      const commission = s.breakdown?.commission != null ? Math.abs(s.breakdown.commission) : s.subOrderNumbers.reduce((t, n) => t + (subByNumber[n]?.commissionAmount ?? 0), 0);
      if (commission) add({ amount: round2(commission), date: s.createdAt, method: "ledger", party: store?.name ?? s.storeSlug, reference: s.number, status: "reconciled", type: "commission" });
      if (s.status === "paid") add({ amount: -s.net, date: s.paidAt, method: "bank_transfer", party: store?.name ?? s.storeSlug, reference: `${s.number} · ${s.utr}`, status: "reconciled", type: "payout" });
      if (s.status === "approved") add({ amount: -s.net, date: s.createdAt, method: "bank_transfer", party: store?.name ?? s.storeSlug, reference: s.number, status: "pending", type: "payout" });
    });
    db.ads.filter((a) => a.spend > 0).forEach((a) => add({
      amount: a.spend, date: `${a.startsAt}T00:00:00.000Z`, method: a.advertiserType === "seller" ? "ledger" : "online", party: a.advertiser, reference: `AD-${String(a.id).padStart(4, "0")}`,
      status: a.settlementId || a.advertiserType !== "seller" ? "reconciled" : "captured", type: "ad",
    }));
    db.subscriptions.filter((s) => s.amount > 0).forEach((s) => add({
      amount: s.amount, date: s.startsAt, method: "online", party: storeBy(s.storeSlug)?.name ?? s.storeSlug, reference: s.invoiceNumber ?? `MEM-${s.id}`, status: now - ms(s.startsAt) > 2 * DAY_MS ? "reconciled" : "captured", type: "membership",
    }));
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const online = db.orders.filter((o) => o.paymentMethod === "online");
    const unmatched = online.filter((o) => o.paymentStatus === "pending_payment");
    return {
      reconciliation: {
        capturedAmount: online.filter((o) => o.paymentStatus !== "pending_payment").reduce((t, o) => t + o.grandTotal, 0),
        matched: online.length - unmatched.length, onlineOrders: online.length, unmatched: unmatched.map((o) => ({ amount: o.grandTotal, number: o.number })),
      },
      rows,
    };
  }, 350);
}

// ---------- Tax centre ----------
const monthOf = (iso) => iso.slice(0, 7);

export async function getTaxCentre(month) {
  if (!IS_MOCK) return get(API.ADMIN_TAX, month ? { month } : undefined);
  return run(() => {
    const db = getDb();
    const p = db.platform;
    const months = [...new Set(db.orders.map((o) => monthOf(o.createdAt)))].sort().reverse();
    const m = month && months.includes(month) ? month : months[0];
    const subs = liveSubs().filter((s) => monthOf(s.createdAt) === m);
    const gstRate = p.commissionGstRate;

    // (a) GST on platform fees
    const feeRow = (stream, items) => {
      const out = { cgst: 0, igst: 0, sgst: 0, stream, taxable: 0 };
      items.forEach(({ amount, stateCode }) => {
        const tax = (amount * gstRate) / 100;
        out.taxable += amount;
        if (stateCode === PLATFORM_STATE) { out.cgst += tax / 2; out.sgst += tax / 2; } else out.igst += tax;
      });
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, typeof v === "number" ? round2(v) : v]));
    };
    const commissionItems = subs.map((s) => ({ amount: s.commissionAmount, stateCode: storeBy(s.storeSlug)?.gstStateCode }));
    const adItems = db.ads.filter((a) => a.spend > 0 && monthOf(a.startsAt) === m && a.advertiserType !== "house").map((a) => ({ amount: a.spend, stateCode: a.storeSlug ? storeBy(a.storeSlug)?.gstStateCode : null }));
    const memItems = db.subscriptions.filter((s) => s.amount > 0 && monthOf(s.startsAt) === m).map((s) => ({ amount: s.amount, stateCode: storeBy(s.storeSlug)?.gstStateCode }));
    const platformGst = [feeRow("commission", commissionItems), feeRow("ads", adItems), feeRow("memberships", memItems)];

    // (b–d) per seller TCS / TDS
    const refunds = db.refunds.filter((r) => r.status === "processed" && monthOf(r.processedAt ?? r.createdAt) === m);
    const subByNumber = Object.fromEntries(db.orders.flatMap((o) => o.subOrders).map((s) => [s.number, s]));
    const sellers = db.stores.map((store) => {
      const own = subs.filter((s) => s.storeSlug === store.slug);
      const interstate = (s) => s.interstate ?? s.tax.igst > 0;
      const gross = own.reduce((t, s) => t + s.tax.taxable, 0);
      const grossInter = own.filter(interstate).reduce((t, s) => t + s.tax.taxable, 0);
      let returns = 0;
      let returnsInter = 0;
      refunds.filter((r) => r.storeSlug === store.slug).forEach((r) => {
        const sub = subByNumber[r.subOrderNumber];
        if (!sub || !sub.total) return;
        const taxable = (r.amount * sub.tax.taxable) / sub.total;
        returns += taxable;
        if (interstate(sub)) returnsInter += taxable;
      });
      const net = gross - returns;
      const netInter = grossInter - returnsInter;
      const netIntra = net - netInter;
      const grossSales = own.reduce((t, s) => t + s.subtotal, 0);
      const tcsIgst = (Math.max(0, netInter) * p.tcsRate) / 100;
      const tcsHalf = (Math.max(0, netIntra) * p.tcsRate) / 200;
      return {
        gross: round2(gross), grossSales: round2(grossSales), gstin: store.gstin, name: store.name, net: round2(net), orders: own.length, pan: String(store.pan || store.gstin || "").slice(store.pan ? 0 : 2, store.pan ? 10 : 12),
        returns: round2(returns), slug: store.slug, state: store.state, tcsCgst: round2(tcsHalf), tcsIgst: round2(tcsIgst), tcsSgst: round2(tcsHalf), tcsTotal: round2(tcsIgst + 2 * tcsHalf),
        tds: round2((grossSales * p.tdsRate) / 100),
      };
    }).filter((r) => r.orders > 0 || r.returns > 0).sort((a, b) => b.gross - a.gross);

    return { month: m, months, platform: { gstin: p.gstin, legalName: p.legalName, tcsRate: p.tcsRate, tdsRate: p.tdsRate, address: p.address, commissionGstRate: gstRate }, platformGst, sellers };
  }, 300);
}

// ---------- Dashboard summary for the growth modules ----------
export async function getGrowthSummary() {
  if (!IS_MOCK) return get(API.ADMIN_GROWTH_SUMMARY);
  return run(() => {
    const db = getDb();
    const now = Date.now();
    const openTickets = db.tickets.filter((t) => ["open", "in_progress"].includes(t.status));
    return {
      arr: db.subscriptions.filter((s) => s.status === "active" && s.amount > 0).reduce((t, s) => t + s.amount, 0),
      leadsToday: db.enquiries.filter((e) => now - ms(e.createdAt) < DAY_MS).length,
      openRfqs: db.rfqs.filter((r) => r.status === "open").length,
      openTickets: openTickets.length,
      overdueTickets: openTickets.filter((t) => ms(t.slaDueAt) < now).length,
      pendingKyc: db.stores.filter((s) => s.status !== "rejected" && db.kycDocuments.some((d) => d.storeSlug === s.slug && d.status === "pending")).length,
    };
  }, 200);
}
