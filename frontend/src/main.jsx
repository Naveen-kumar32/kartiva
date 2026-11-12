import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import "@/api/mockDb"; // hydrate the demo database before anything renders
import { setupInterceptors } from "@/config";
import { store } from "@/store";

import App from "./App";

import "./index.css";

setupInterceptors(store);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
