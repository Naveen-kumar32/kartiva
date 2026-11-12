import { createSlice } from "@reduxjs/toolkit";

import { readJSON, STORAGE_KEYS } from "@/utils/storage";

// Reducers only — never import the API layer here (Day-1 notes §21).
// The access token stays in memory; only the non-secret user profile is persisted (AD-10).
const initialState = { accessToken: null, user: readJSON(STORAGE_KEYS.AUTH_USER, null) };

const authSlice = createSlice({
  initialState,
  name: "auth",
  reducers: {
    clearCredentials: (state) => {
      state.accessToken = null;
      state.user = null;
    },
    setAccessToken: (state, { payload }) => {
      state.accessToken = payload;
    },
    setCredentials: (state, { payload: { access, user } }) => {
      state.accessToken = access ?? null;
      state.user = user;
    },
  },
});

export const { clearCredentials, setAccessToken, setCredentials } = authSlice.actions;
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => Boolean(state.auth.user);
export default authSlice.reducer;
