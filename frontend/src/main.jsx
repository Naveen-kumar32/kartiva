import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import "@/api/mockDb"; // mock mode: hydrate the demo database before anything renders
import { refreshCatalog } from "@/api/bootstrap";
import { API, axiosInstance, IS_MOCK, setupInterceptors } from "@/config";
import { store } from "@/store";
import { clearCredentials, setCredentials } from "@/store/slices/authSlice";

import App from "./App";

import "./index.css";

setupInterceptors(store);

// API mode: before the first render, restore the session silently (refresh cookie → access token, so the
// first authenticated call doesn't 401) and load menus, stores and the catalogue from the backend.
if (!IS_MOCK) {
  if (store.getState().auth.user) {
    try {
      const { data } = await axiosInstance.post(API.AUTH_REFRESH);
      store.dispatch(setCredentials(data));
    } catch {
      store.dispatch(clearCredentials()); // refresh cookie expired → signed out
    }
  }
  try { await refreshCatalog(); } catch (err) { console.error("Could not reach the Kartiva API", err); }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
