import { cn } from "@/utils/cn";

// tabs: [{ value, label, count? }]
export function Tabs({ className, onChange, tabs, value }) {
  return (
    <div aria-label="Tabs" className={cn("scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1", className)} role="tablist">
      {tabs.map((t) => (
        <button
          aria-selected={t.value === value}
          className={cn("-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition", t.value === value ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink")}
          key={t.value}
          onClick={() => onChange(t.value)}
          role="tab"
          type="button"
        >
          {t.label}
          {t.count != null && <span className={cn("rounded-full px-1.5 text-xs tabular", t.value === value ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-600")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
