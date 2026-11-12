import { cn } from "@/utils/cn";

export function StatCard({ hint, icon: Icon, label, tone = "brand", value }) {
  const tones = { accent: "bg-orange-50 text-orange-600", brand: "bg-brand-50 text-brand-700", info: "bg-sky-50 text-sky-700", warning: "bg-amber-50 text-amber-700" };
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {Icon && <span className={cn("grid size-9 place-items-center rounded-lg", tones[tone])}><Icon aria-hidden className="size-5" /></span>}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
