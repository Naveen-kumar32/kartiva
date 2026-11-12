// Buyer ↔ seller conversations (one thread per enquiry / RFQ / order). Buyers see their own threads
// (by email), sellers see their store's threads, admins can read all (moderation). 404 otherwise.
import { API, axiosInstance, IS_MOCK } from "@/config";
import { mockDelay } from "@/utils/mock";

import { appendMessage } from "./marketOps";
import { apiError, commit, getDb } from "./mockDb";

const run = async (fn, ms = 250) => mockDelay(await Promise.resolve().then(fn), ms);
const sideOf = (user) => (user.role === "seller" ? "seller" : user.role === "admin" ? "admin" : "buyer");
const canSee = (thread, user) => user.role === "admin" || (user.role === "seller" ? thread.storeSlug === user.storeSlug : thread.buyer.email === user.email);
const decorate = (thread) => {
  const store = getDb().stores.find((s) => s.slug === thread.storeSlug);
  return { ...thread, store: store ? { color: store.color, initials: store.initials, name: store.name, slug: store.slug } : null };
};

export async function getMyThreads(user) {
  if (!IS_MOCK) return (await axiosInstance.get(API.MESSAGES)).data;
  return run(() => getDb().threads.filter((t) => canSee(t, user)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(decorate));
}

export async function getUnreadMessageCount(user) {
  if (!user) return 0;
  if (!IS_MOCK) return (await axiosInstance.get(API.MESSAGES_UNREAD_COUNT)).data.count;
  const side = sideOf(user);
  if (side === "admin") return 0;
  return getDb().threads.filter((t) => canSee(t, user)).reduce((n, t) => n + (t.unread[side] ?? 0), 0);
}

export async function markThreadRead(id, user) {
  if (!IS_MOCK) return (await axiosInstance.post(API.MESSAGE_READ(id))).data;
  return run(() => {
    const thread = getDb().threads.find((t) => t.id === Number(id));
    if (!thread || !canSee(thread, user)) throw apiError("Conversation not found.", 404);
    const side = sideOf(user);
    if (side !== "admin" && thread.unread[side]) { thread.unread[side] = 0; commit(); }
    return decorate(thread);
  }, 80);
}

export async function sendMessage(id, user, body) {
  if (!IS_MOCK) return (await axiosInstance.post(API.MESSAGE(id), { body: String(body ?? "").slice(0, 2000) })).data;
  return run(() => {
    const thread = getDb().threads.find((t) => t.id === Number(id));
    if (!thread || !canSee(thread, user) || user.role === "admin") throw apiError("Conversation not found.", 404);
    if (!body?.trim()) throw apiError("Type a message first.");
    appendMessage(thread, sideOf(user), body.slice(0, 2000));
    commit();
    return decorate(thread);
  });
}
