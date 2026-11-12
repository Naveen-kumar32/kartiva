import { Star } from "lucide-react";

import { cn } from "@/utils/cn";

// Compact pill: "4.3 ★" + optional count
export function Rating({ className, count, value }) {
  const tone = value >= 4 ? "bg-emerald-600" : value >= 3 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold text-white", tone)}>
        {value.toFixed(1)} <Star aria-hidden className="size-3 fill-current" />
      </span>
      {count != null && <span className="text-muted tabular">({count.toLocaleString("en-IN")})</span>}
    </span>
  );
}

export function Stars({ size = "size-4", value }) {
  return (
    <span aria-label={`${value} out of 5`} className="inline-flex" role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star aria-hidden className={cn(size, n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-slate-300")} key={n} />
      ))}
    </span>
  );
}
