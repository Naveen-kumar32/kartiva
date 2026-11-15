// Customer ratings & reviews (port of backend apps/catalog/reviews.py).
// Rules enforced here too, never trusted from the page: only a signed-in BUYER whose order for the product was
// DELIVERED can rate it, one review per buyer per product (posting again edits it). Email / order number stay private.
import { API, axiosInstance, IS_MOCK } from "@/config";
import { PRODUCTS, buildReviews, ratingCounts } from "@/data";
import { mockDelay } from "@/utils/mock";

import { apiError, commit, getDb, nextId, nowIso } from "./mockDb";
import { requireSession } from "./session";

const PRIVATE = ["hidden", "orderNumber", "productId", "userEmail"];
const run = async (fn, ms = 300) => mockDelay(await Promise.resolve().then(fn), ms);
const publicReview = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !PRIVATE.includes(k)));
const byNewest = (a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);

/** Product page list: customers' reviews first (newest first), then the sample reviews; hidden ones removed. */
export function visibleReviews(product, count = 6) {
  const db = getDb();
  const hidden = db.hiddenReviews;
  const own = db.customerReviews.filter((r) => r.productId === product.id && !hidden.includes(r.id)).sort(byNewest).slice(0, 20);
  return [...own.map(publicReview), ...buildReviews(product, count).filter((r) => !hidden.includes(r.id))];
}

/** Admin / seller review screens: customers' reviews with product details (storeSlug limits to one seller). */
export function customerReviewRows(storeSlug) {
  const db = getDb();
  return db.customerReviews
    .map((r) => ({ r, p: PRODUCTS.find((x) => x.id === r.productId) }))
    .filter(({ p }) => p && (!storeSlug || p.storeSlug === storeSlug))
    .sort((a, b) => byNewest(a.r, b.r))
    .map(({ r, p }) => ({ ...publicReview(r), hidden: db.hiddenReviews.includes(r.id), productName: p.name, productSlug: p.slug, storeSlug: p.storeSlug }));
}

const deliveredOrder = (email, productId) =>
  getDb().orders.find((o) => o.buyer.email === email && o.subOrders.some((s) => s.status === "delivered" && s.items.some((it) => it.productId === productId)));

/** { canReview, review } for the signed-in user on this product. */
export async function getMyReview(slug) {
  if (!IS_MOCK) return (await axiosInstance.get(API.PRODUCT_MY_REVIEW(slug))).data;
  return run(() => {
    const user = requireSession();
    const product = PRODUCTS.find((p) => p.slug === slug && !p.deletedAt);
    if (!product) throw apiError("Product not found.", 404);
    const mine = getDb().customerReviews.find((r) => r.productId === product.id && r.userEmail === user.email);
    return { canReview: user.role === "buyer" && Boolean(mine || deliveredOrder(user.email, product.id)), review: mine ? publicReview(mine) : null };
  }, 150);
}

/** The signed-in buyer's reviews (My Orders shows "Your rating" next to delivered items). */
export async function getMyReviews() {
  if (!IS_MOCK) return (await axiosInstance.get(API.REVIEWS_MINE)).data.results;
  return run(() => {
    const user = requireSession();
    return getDb().customerReviews.filter((r) => r.userEmail === user.email).map((r) => ({ ...publicReview(r), productId: r.productId }));
  }, 150);
}

/** Create or edit my review: { rating 1-5, title, body }. Updates the product's average and star breakdown. */
export async function saveMyReview(slug, { body = "", rating, title = "" }) {
  if (!IS_MOCK) return (await axiosInstance.post(API.PRODUCT_MY_REVIEW(slug), { body, rating, title })).data;
  return run(() => {
    const user = requireSession();
    if (user.role !== "buyer") throw apiError("Only customers can rate products.", 403);
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw apiError("Choose a rating from 1 to 5 stars.");
    const text = String(body).trim();
    if (text.length > 2000) throw apiError("Keep your review under 2000 characters.");
    const cleanTitle = String(title).split(/\s+/).filter(Boolean).join(" ").slice(0, 100);
    const product = PRODUCTS.find((p) => p.slug === slug && !p.deletedAt);
    if (!product) throw apiError("Product not found.", 404);
    const db = getDb();
    let mine = db.customerReviews.find((r) => r.productId === product.id && r.userEmail === user.email);
    const order = deliveredOrder(user.email, product.id);
    if (!mine && !order) throw apiError("You can rate this product once your order has been delivered.", 403);

    const counts = { ...ratingCounts(product) };
    const n = product.reviewCount || 0;
    let avg = product.rating || 0;
    const now = nowIso();
    if (mine) {
      counts[mine.rating] = Math.max(0, (counts[mine.rating] || 0) - 1);
      counts[stars] = (counts[stars] || 0) + 1;
      avg = n ? (avg * n - mine.rating + stars) / n : stars;
      Object.assign(mine, { body: text, rating: stars, title: cleanTitle, updatedAt: now });
    } else {
      const record = db.users.find((u) => u.email === user.email) ?? user;
      const first = (record.firstName ?? "").trim();
      const last = (record.lastName ?? "").trim();
      const num = nextId(db.customerReviews.map((r) => ({ id: Number(r.id.slice(1)) })));
      mine = {
        author: first && last ? `${first} ${last[0]}.` : first || "Kartiva customer", body: text, city: order.address?.city ?? "", createdAt: now, helpful: 0,
        id: `c${num}`, orderNumber: order.number, productId: product.id, rating: stars, title: cleanTitle, updatedAt: now, userEmail: user.email, verified: true,
      };
      db.customerReviews.push(mine);
      counts[stars] = (counts[stars] || 0) + 1;
      avg = (avg * n + stars) / (n + 1);
      product.customerReviewCount = (product.customerReviewCount || 0) + 1;
      product.reviewCount = n + 1;
    }
    product.rating = Math.round(avg * 100) / 100;
    product.ratingCounts = counts;
    commit();
    return publicReview(mine);
  }, 400);
}
