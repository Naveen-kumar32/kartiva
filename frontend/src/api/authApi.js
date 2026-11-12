import { API, axiosInstance, IS_MOCK } from "@/config";
import { EN } from "@/locales";
import { mockDelay } from "@/utils";

import { apiError, audit, commit, getDb, nextId, nowIso } from "./mockDb";

const publicUser = ({ password: _password, ...user }) => user;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const initialsOf = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const COLORS = ["#0891b2", "#9333ea", "#16a34a", "#dc2626", "#ca8a04", "#2563eb", "#db2777"];

// Brute-force protection: 5 wrong passwords in 15 minutes → account locked for 15 minutes.
// Same error for unknown email and wrong password (no account enumeration). The backend adds IP-based
// throttling (DRF throttles + Nginx limit_req) on top.
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;
const WINDOW_MS = 15 * 60_000;

export async function login({ email, password }) {
  if (!IS_MOCK) return (await axiosInstance.post(API.AUTH_LOGIN, { email, password })).data;
  await mockDelay(null, 500);
  const db = getDb();
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const rec = db.security.attempts[key] ?? { count: 0, firstAt: now, lockedUntil: 0 };
  if (rec.lockedUntil > now) throw apiError(EN.ERRORS.ACCOUNT_LOCKED(Math.ceil((rec.lockedUntil - now) / 60_000)), 429);
  const user = db.users.find((u) => u.email === key && u.password === password);
  if (!user) {
    if (now - rec.firstAt > WINDOW_MS) Object.assign(rec, { count: 0, firstAt: now });
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
      rec.lockedUntil = now + LOCK_MS;
      if (db.users.some((u) => u.email === key)) audit("auth.locked", key, `${MAX_ATTEMPTS} failed sign-in attempts — locked for 15 minutes`, "system");
    }
    db.security.attempts[key] = rec;
    commit();
    if (rec.lockedUntil > now) throw apiError(EN.ERRORS.ACCOUNT_LOCKED(Math.ceil(LOCK_MS / 60_000)), 429);
    const left = MAX_ATTEMPTS - rec.count;
    throw apiError(left <= 2 ? EN.ERRORS.INVALID_CREDENTIALS_LEFT(left) : EN.ERRORS.INVALID_CREDENTIALS, 401);
  }
  if (user.isActive === false) throw apiError(EN.ERRORS.ACCOUNT_DISABLED, 403);
  delete db.security.attempts[key];
  commit();
  // Role always comes from the account, never from the form.
  return { access: "mock-access-token", user: publicUser(user) };
}

// ---------- Password reset (single-use, 30-minute token; only its SHA-256 hash is stored) ----------
const RESET_TTL_MS = 30 * 60_000;
const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Always resolves with the same message whether or not the email exists (no account enumeration).
// Demo mode also returns the link (normally it is only in the email).
export async function requestPasswordReset(email) {
  if (!IS_MOCK) return (await axiosInstance.post(API.AUTH_PASSWORD_RESET, { email })).data;
  await mockDelay(null, 500);
  const db = getDb();
  const key = email.trim().toLowerCase();
  const user = db.users.find((u) => u.email === key && u.isActive !== false);
  if (!user) return { demoLink: null };
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  db.security.resetTokens = db.security.resetTokens.filter((t) => t.email !== key); // older links stop working
  db.security.resetTokens.push({ email: key, expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(), tokenHash: await sha256(token), usedAt: null });
  const link = `${window.location.origin}/reset-password?token=${token}`;
  db.outbox.unshift({
    attachment: null, cc: null, id: nextId(db.outbox), sentAt: nowIso(), sentBy: "Kartiva (automatic)", status: "sent", subject: "Reset your Kartiva password", to: [key],
    message: `Hello ${user.firstName},\n\nWe received a request to reset your Kartiva password. Use this link within 30 minutes:\n${link}\n\nIf you didn't ask for this, ignore this email — your password stays the same.\n\n— Team Kartiva`,
  });
  audit("auth.reset_requested", key, "Password reset link sent", "system");
  commit();
  return { demoLink: `/reset-password?token=${token}` };
}

export async function resetPassword({ password, token }) {
  if (!IS_MOCK) return (await axiosInstance.post(API.AUTH_PASSWORD_RESET_CONFIRM, { password, token })).data;
  await mockDelay(null, 500);
  const db = getDb();
  const hash = await sha256(token ?? "");
  const rec = db.security.resetTokens.find((t) => t.tokenHash === hash);
  if (!rec || rec.usedAt || new Date(rec.expiresAt).getTime() < Date.now()) throw apiError(EN.ERRORS.RESET_LINK_INVALID, 400);
  const user = db.users.find((u) => u.email === rec.email);
  if (!user) throw apiError(EN.ERRORS.RESET_LINK_INVALID, 400);
  user.password = password; // the backend stores a salted hash (Django PBKDF2/Argon2), never the password
  rec.usedAt = nowIso();
  delete db.security.attempts[rec.email]; // unlock after a successful reset
  db.notifications.unshift({ at: nowIso(), audience: { email: user.email, role: user.role }, body: "Your password was changed. If this wasn't you, contact support immediately.", id: nextId(db.notifications), link: null, read: false, title: "Password changed" });
  audit("auth.password_reset", user.email, "Password reset via email link", "system");
  commit();
  return { ok: true };
}

// Buyer sign-up, or seller sign-up (values.accountType === "seller"): creates the user, a PENDING store
// and a seller application for admin review. The seller can set up the store; nothing is public until approved.
export async function register(values) {
  if (!IS_MOCK) return (await axiosInstance.post(values.accountType === "seller" ? API.AUTH_REGISTER_SELLER : API.AUTH_REGISTER, values)).data;
  await mockDelay(null, 600);
  const db = getDb();
  const email = values.email.trim().toLowerCase();
  if (db.users.some((u) => u.email === email)) throw apiError(EN.ERRORS.EMAIL_TAKEN, 409);
  const user = { createdAt: nowIso(), email, firstName: values.firstName.trim(), id: Math.max(100, nextId(db.users)), isActive: true, lastName: values.lastName.trim(), password: values.password, phone: `+91${values.phone}`, role: "buyer" };

  if (values.accountType === "seller") {
    const business = values.businessName.trim();
    let slug = slugify(business) || `store-${user.id}`;
    while (db.stores.some((s) => s.slug === slug)) slug = `${slug}-${user.id}`;
    const color = COLORS[user.id % COLORS.length];
    const owner = `${user.firstName} ${user.lastName}`.trim();
    db.stores.push({
      address: `${values.city.trim()}, ${values.state}`, annualTurnover: values.annualTurnover || "Up to ₹1 Cr", badges: [], banner: `linear-gradient(120deg,#0f172a,${color} 60%,${color}cc)`,
      businessType: values.businessType, certifications: [], city: values.city.trim(), color, contactPerson: owner, employees: "1–10", gstStateCode: values.gstin.slice(0, 2), gstin: values.gstin.toUpperCase(),
      gstVerified: false, initials: initialsOf(business), isFeatured: false, kycStatus: "not_submitted", mainMarkets: [values.state], name: business, ownerEmail: email, pan: values.pan?.toUpperCase() ?? "",
      phone: user.phone, plan: "free", rating: 0, ratingCount: 0, responseHours: null, responseRate: null, returnPolicy: "7-day returns on unused items in original packaging.",
      shippingMethods: [{ codAllowed: true, fee: 49, freeAbove: 499, id: 1000 + user.id, maxDays: 7, minDays: 3, name: "Standard Delivery", type: "standard" }],
      since: new Date().getFullYear(), slug, state: values.state, status: "pending", tagline: `${values.businessType} · ${values.category}`, yearEstablished: Number(values.yearEstablished) || new Date().getFullYear(),
    });
    db.applications.unshift({
      business, businessType: values.businessType, category: values.category, city: `${values.city.trim()}, ${values.state}`, email, gstin: values.gstin.toUpperCase(),
      id: Math.max(200, nextId(db.applications)), owner, phone: user.phone, selfRegistered: true, status: "pending", storeSlug: slug, submittedAt: nowIso(), userId: user.id,
    });
    db.subscriptions.push({ amount: 0, endsAt: null, id: nextId(db.subscriptions), invoiceNumber: null, leadCreditsUsed: 0, planCode: "free", startsAt: nowIso(), status: "active", storeSlug: slug });
    db.sellerStaff.push({ email, id: nextId(db.sellerStaff), lastActiveAt: nowIso(), name: owner, role: "owner", status: "active", storeSlug: slug });
    db.notifications.unshift({ at: nowIso(), audience: { role: "admin" }, body: `${business} (${values.city.trim()}) registered as a seller and is waiting for approval.`, id: nextId(db.notifications), link: "/admin/sellers", read: false, title: "New seller sign-up" });
    Object.assign(user, { role: "seller", storeSlug: slug });
    audit("seller.registered", `Store ${slug}`, `${business} signed up (${values.businessType}, ${values.category})`, owner);
  }
  db.users.push(user);
  commit();
  return { access: "mock-access-token", user: publicUser(user) };
}

export async function logout() {
  if (!IS_MOCK) await axiosInstance.post(API.AUTH_LOGOUT);
}
