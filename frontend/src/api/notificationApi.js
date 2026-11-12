// In-app notification bell for buyers, sellers and admins.
import { IS_MOCK } from "@/config";
import { mockDelay } from "@/utils/mock";

import { audienceMatches } from "./marketOps";
import { commit, getDb } from "./mockDb";

export async function getMyNotifications(user) {
  if (!IS_MOCK || !user) return [];
  return mockDelay(getDb().notifications.filter((n) => audienceMatches(n.audience, user)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50), 120);
}

export async function markNotificationsRead(user, id = null) {
  if (!IS_MOCK || !user) return [];
  getDb().notifications.forEach((n) => { if (audienceMatches(n.audience, user) && (id === null || n.id === id)) n.read = true; });
  commit();
  return getMyNotifications(user);
}
