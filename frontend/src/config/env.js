export const ENV = {
  API_URL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1",
  DATA_MODE: import.meta.env.VITE_DATA_MODE ?? "mock",
  RAZORPAY_KEY_ID: import.meta.env.VITE_RAZORPAY_KEY_ID ?? "",
};

export const IS_MOCK = ENV.DATA_MODE !== "api";
