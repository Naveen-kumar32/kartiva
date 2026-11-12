import { configureStore } from "@reduxjs/toolkit";

import { STORAGE_KEYS, writeJSON } from "@/utils/storage";

import authReducer from "./slices/authSlice";
import cartReducer from "./slices/cartSlice";
import uiReducer from "./slices/uiSlice";

export const store = configureStore({
  reducer: { auth: authReducer, cart: cartReducer, ui: uiReducer },
});

// Persist only what is safe and useful across reloads.
let last = {};
store.subscribe(() => {
  const { auth, cart } = store.getState();
  if (auth.user !== last.user) writeJSON(STORAGE_KEYS.AUTH_USER, auth.user);
  if (cart.items !== last.items) writeJSON(STORAGE_KEYS.CART, cart.items);
  last = { items: cart.items, user: auth.user };
});

export * from "./slices";
