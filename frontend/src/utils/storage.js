// localStorage helpers that never throw (private mode, blocked storage).
export function readJSON(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
}

export const STORAGE_KEYS = { AUTH_USER: "kartiva.authUser", CART: "kartiva.cart", DEMO_ORDERS: "kartiva.demoOrders" };
