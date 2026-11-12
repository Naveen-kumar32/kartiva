import { cn } from "@/utils/cn";

// Compact metric used in page headers and detail drawers.
export function MiniStat({ className, label, tone, value }) {
  const tones = { danger: "text-red-600", success: "text-emerald-700", warning: "text-amber-700" };
  return (
    <div className={cn("rounded-xl bg-white px-4 py-3 shadow-card", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular", tones[tone])}>{value}</p>
    </div>
  );
}
