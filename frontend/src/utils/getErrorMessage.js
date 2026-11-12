import { EN } from "@/locales";

// Backend always returns { detail } on errors (docs/API_DOCUMENTATION.md §1).
export const getErrorMessage = (err) => err?.response?.data?.detail ?? err?.message ?? EN.ERRORS.FALLBACK;
