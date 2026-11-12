import { clearCredentials, setAccessToken } from "@/store/slices/authSlice";

import { API } from "./apiConfig";
import { axiosInstance } from "./axiosInstance";

let refreshPromise = null;

// Retries with exponential backoff + jitter: only network errors / 429 / 502 / 503 / 504, only for requests that
// are safe to repeat (GET/HEAD/OPTIONS, or any request carrying an Idempotency-Key, e.g. checkout).
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 400;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const isRetryable = (error) => {
  const { config, response } = error;
  if (!config || (config._retryCount ?? 0) >= MAX_RETRIES) return false;
  const safe = ["get", "head", "options"].includes((config.method ?? "get").toLowerCase()) || Boolean(config.headers?.["Idempotency-Key"]);
  return safe && (!response || RETRY_STATUSES.has(response.status));
};
const backoffDelay = (error) => {
  const retryAfter = Number(error.response?.headers?.["retry-after"]);
  if (retryAfter > 0) return Math.min(retryAfter * 1000, 10_000);
  const attempt = error.config._retryCount ?? 0;
  return BASE_DELAY_MS * 2 ** attempt + Math.random() * BASE_DELAY_MS; // 0.4s, 0.8s, 1.6s (+ jitter)
};

// Called once from main.jsx after the store exists (Day-1 notes §21: no store import in axiosInstance).
export function setupInterceptors(store) {
  axiosInstance.interceptors.request.use((config) => {
    const token = store.getState().auth.accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // Correlates this request with backend logs / error tracking (structured logging, tracing).
    config.headers["X-Request-ID"] ??= crypto.randomUUID();
    return config;
  });

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      if (isRetryable(error)) {
        await sleep(backoffDelay(error));
        original._retryCount = (original._retryCount ?? 0) + 1;
        return axiosInstance(original);
      }
      const isAuthCall = original?.url?.includes("/auth/");
      if (error.response?.status !== 401 || original?._retried || isAuthCall) throw error;

      original._retried = true;
      try {
        // One shared refresh even when several requests fail together.
        refreshPromise ??= axiosInstance.post(API.AUTH_REFRESH).finally(() => { refreshPromise = null; });
        const { data } = await refreshPromise;
        store.dispatch(setAccessToken(data.access));
        return axiosInstance(original);
      } catch (refreshError) {
        store.dispatch(clearCredentials());
        throw refreshError;
      }
    },
  );
}
