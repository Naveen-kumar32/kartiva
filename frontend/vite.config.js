import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // In api mode the SPA calls /api/v1/… on the same origin; Vite forwards it to Django (cookies stay first-party).
  server: { port: 5173, proxy: { "/api": { changeOrigin: false, target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000" } } },
  preview: { proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000" } } },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    include: ["src/**/__tests__/*.test.js"],
  },
});
