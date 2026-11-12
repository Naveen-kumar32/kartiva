// In-app notification bell for buyers, sellers and admins.
import { API, axiosInstance, IS_MOCK } from "@/config";
import { mockDelay } from "@/utils/mock";

import { audienceMatches } from "./marketOps";
import { commit, getDb } from "./mockDb";

export async function getMyNotifications(user) {
  if (!user) return [];
  if (!IS_MOCK) return (await axiosInstance.get(API.NOTIFICATIONS)).data;
  return mockDelay(getDb().notifications.filter((n) => audienceMatches(n.audience, user)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50), 120);
}

export async function markNotificationsRead(user, id = null) {
  if (!user) return [];
  if (!IS_MOCK) return (await axiosInstance.post(API.NOTIFICATIONS_READ, { id })).data;
  getDb().notifications.forEach((n) => { if (audienceMatches(n.audience, user) && (id === null || n.id === id)) n.read = true; });
  commit();
  return getMyNotifications(user);
}
