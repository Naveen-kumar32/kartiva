import { createSlice } from "@reduxjs/toolkit";

import { MAX_PER_LINE } from "@/constants/catalog";
import { readJSON, STORAGE_KEYS } from "@/utils/storage";

// Guest/demo cart: [{ variantId, productId, quantity }]. Persisted to localStorage.
// maxQty (bulk cap) / minQty (MOQ) come from the caller (utils/cart maxQtyFor + pricing minOrderQty);
// prices are never stored here — the cart view and the checkout API recompute them.
const cartSlice = createSlice({
  initialState: { items: readJSON(STORAGE_KEYS.CART, []) },
  name: "cart",
  reducers: {
    addToCart: (state, { payload: { maxQty, maxStock, productId, quantity = 1, variantId } }) => {
      const existing = state.items.find((i) => i.variantId === variantId);
      const cap = maxQty ?? Math.min(MAX_PER_LINE, maxStock ?? MAX_PER_LINE);
      if (existing) existing.quantity = Math.min(existing.quantity + quantity, cap);
      else state.items.push({ productId, quantity: Math.min(quantity, cap), variantId });
    },
    clearCart: (state) => {
      state.items = [];
    },
    removeFromCart: (state, { payload: variantId }) => {
      state.items = state.items.filter((i) => i.variantId !== variantId);
    },
    updateQuantity: (state, { payload: { maxQty = MAX_PER_LINE, minQty = 1, quantity, variantId } }) => {
      const item = state.items.find((i) => i.variantId === variantId);
      if (item) item.quantity = Math.max(1, minQty, Math.min(quantity, maxQty));
    },
  },
});

export const { addToCart, clearCart, removeFromCart, updateQuantity } = cartSlice.actions;
export const selectCartItems = (state) => state.cart.items;
export const selectCartCount = (state) => state.cart.items.reduce((sum, i) => sum + i.quantity, 0);
export default cartSlice.reducer;
