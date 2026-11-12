// One shared copy of the signed-in buyer's wishlist ids, so a grid of heart buttons loads it once
// (useSyncExternalStore). The API stays the source of truth; this is only a client cache.
import { getWishlistIds } from "@/api";

let snapshot = { email: null, ids: [] };
let loadingFor = null;
const listeners = new Set();

export const subscribeWishlist = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getWishlistSnapshot = () => snapshot;
export const publishWishlistIds = (email, ids) => { snapshot = { email, ids }; listeners.forEach((fn) => fn()); };

export function ensureWishlistLoaded(user) {
  const email = user?.email ?? null;
  if (snapshot.email === email || loadingFor === email) return;
  if (!email) { publishWishlistIds(null, []); return; }
  loadingFor = email;
  getWishlistIds(user)
    .then((ids) => { if (loadingFor === email) { loadingFor = null; publishWishlistIds(email, ids); } })
    .catch(() => { loadingFor = null; });
}
