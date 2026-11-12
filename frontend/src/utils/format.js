const inr = new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" });
const inr2 = new Intl.NumberFormat("en-IN", { currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2, style: "currency" });
const num = new Intl.NumberFormat("en-IN");

export const formatCurrency = (value, { decimals = false } = {}) => (decimals ? inr2 : inr).format(Number(value) || 0);

export const formatNumber = (value) => num.format(Number(value) || 0);

// Indian short form: ₹29.5 L, ₹1.86 Cr
export function formatCompactInr(value) {
  const v = Number(value) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return formatCurrency(v);
}

export const formatDate = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "Asia/Kolkata" }).format(new Date(iso));

export const formatDateTime = (iso) =>
  formatDate(iso, { day: "numeric", hour: "numeric", minute: "2-digit", month: "short" });

export const formatPercent = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`;

// "just now", "12 min ago", "3 h ago", "2 days ago" — used to make new orders easy to spot.
export function formatRelative(iso, now = Date.now()) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : formatDate(iso);
}
