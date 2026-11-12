import axios from "axios";

import { ENV } from "./env";

// Single Axios instance used by every API file. It does NOT import the Redux store —
// interceptors are attached later by setupInterceptors(store) to avoid a circular import.
export const axiosInstance = axios.create({
  baseURL: ENV.API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
  withCredentials: true, // sends the httpOnly refresh cookie to /auth/refresh/
});
