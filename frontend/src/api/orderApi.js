import { API, axiosInstance, IS_MOCK } from "@/config";
import { mockDelay } from "@/utils/mock";

import { refreshCatalog } from "./bootstrap";
import { apiError, commit, getDb } from "./mockDb";
import { findSubOrder, placeOrderInDb, requestReturnInDb, transitionSubOrder, updateReturnInDb } from "./orderOps";
import { requireSession, sessionUser } from "./session";

const run = async (fn, ms = 400) => mockDelay(await Promise.resolve().then(fn), ms);
// Buyers can only see / act on their own orders; admins can see all. Anything else → 404 (don't leak existence).
const ownOrder = (order) => {
  const user = sessionUser();
  if (!order || !user || (user.role !== "admin" && order.buyer.email !== user.email)) throw apiError("Order not found.", 404);
  return order;
};

// payload: { address, gstin, lines[{variantId, quantity}], paymentMethod, shippingChoices{storeSlug: methodId}, idempotencyKey }
// The buyer identity comes from the session (never from the payload). Prices are recomputed on the server.
// idempotencyKey: retries / double-clicks of the same checkout return the SAME order instead of a duplicate.
export async function placeOrder(payload) {
  if (!IS_MOCK) {
    const { data } = await axiosInstance.post(API.CHECKOUT, payload, { headers: { "Idempotency-Key": payload.idempotencyKey ?? crypto.randomUUID() } });
    await refreshCatalog(); // stock changed
    return data;
  }
  return run(() => {
    const user = requireSession("buyer");
    const db = getDb();
    db.platform.idempotency ??= {};
    const key = payload.idempotencyKey && `${user.email}:${payload.idempotencyKey}`;
    if (key && db.platform.idempotency[key]) return db.orders.find((o) => o.number === db.platform.idempotency[key]);
    const record = db.users.find((u) => u.email === user.email);
    const buyer = { email: user.email, name: payload.address?.fullName || `${record?.firstName ?? ""} ${record?.lastName ?? ""}`.trim(), phone: payload.address?.phone ?? record?.phone ?? "" };
    const order = placeOrderInDb({ ...payload, buyer });
    if (key) { db.platform.idempotency[key] = order.number; commit(); }
    return order;
  }, 700);
}

export async function getMyOrders() {
  if (!IS_MOCK) return (await axiosInstance.get(API.ORDERS)).data.results;
  const user = requireSession();
  return mockDelay(getDb().orders.filter((o) => o.buyer.email === user.email), 300);
}

export async function getOrder(orderNumber) {
  if (!IS_MOCK) return (await axiosInstance.get(API.ORDER(orderNumber))).data;
  return run(() => ownOrder(getDb().orders.find((o) => o.number === orderNumber)), 200);
}

export async function cancelMySubOrder(subOrderNumber, reason) {
  if (!IS_MOCK) {
    const { data } = await axiosInstance.post(API.SUB_ORDER_CANCEL(subOrderNumber), { reason });
    await refreshCatalog(); // stock released
    return data;
  }
  return run(() => {
    requireSession("buyer");
    ownOrder(findSubOrder(subOrderNumber).order);
    return transitionSubOrder(subOrderNumber, "cancelled", { actor: "buyer", note: reason });
  });
}

export async function getMyReturns() {
  if (!IS_MOCK) return (await axiosInstance.get(API.RETURNS)).data.results;
  const user = requireSession();
  return mockDelay(getDb().returns.filter((r) => r.buyer.email === user.email), 200);
}

export async function requestReturn(payload) {
  if (!IS_MOCK) return (await axiosInstance.post(API.RETURNS, payload)).data;
  return run(() => {
    requireSession("buyer");
    ownOrder(findSubOrder(payload.subOrderNumber).order);
    return requestReturnInDb(payload);
  });
}

export async function escalateReturn(id) {
  if (!IS_MOCK) return (await axiosInstance.post(API.RETURN_ESCALATE(id))).data;
  return run(() => {
    const user = requireSession("buyer");
    const ret = getDb().returns.find((r) => r.id === id);
    if (!ret || ret.buyer.email !== user.email) throw apiError("Return not found.", 404);
    return updateReturnInDb(id, "escalate", { actor: "buyer" });
  });
}

// UX hint only — the backend re-checks COD eligibility (blocked buyer, limit, method) at checkout.
export function isCodBlocked(email) {
  if (!IS_MOCK) return false;
  return getDb().buyers.some((b) => b.email === email && b.codBlocked);
}

export async function getOrderRefunds(orderNumber) {
  if (!IS_MOCK) return (await axiosInstance.get(API.ORDER_REFUNDS(orderNumber))).data.results;
  return run(() => {
    const user = requireSession();
    const order = getDb().orders.find((o) => o.number === orderNumber);
    const sellerOwns = user.role === "seller" && order?.subOrders.some((s) => s.storeSlug === user.storeSlug);
    if (!sellerOwns) ownOrder(order);
    return getDb().refunds.filter((r) => r.orderNumber === orderNumber && (!sellerOwns || r.storeSlug === user.storeSlug));
  }, 100);
}
