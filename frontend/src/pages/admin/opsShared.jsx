// Small building blocks shared by the admin operations pages (not part of the pages barrel).
import { Info, ShieldAlert, TriangleAlert } from "lucide-react";

import { Badge, MiniStat, Select } from "@/components";
import { EN } from "@/locales";
import { cn } from "@/utils";

export function FilterSelect({ label, onChange, options, value }) {
  return (
    <Select ariaLabel={label} className="w-48" onChange={onChange} options={options.map(([v, l]) => ({ label: l, value: v }))} placeholder={label} size="sm" value={value} />
  );
}

export function IconAction({ danger, disabled, icon: Icon, label, onClick }) {
  return (
    <button aria-label={label} className={cn("grid size-8 place-items-center rounded-md text-muted transition hover:bg-slate-100 disabled:opacity-30", danger ? "hover:text-red-600" : "hover:text-ink")} disabled={disabled} onClick={onClick} title={label} type="button">
      <Icon className="size-4" />
    </button>
  );
}

// Section heading used inside drawers.
export function DrawerSection({ action, children, title }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export const Money = ({ className, value }) => (
  <span className={cn("tabular", value < 0 && "text-red-600", className)}>{value < 0 ? "−" : ""}{new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 2, style: "currency" }).format(Math.abs(value))}</span>
);

// Visually hidden table header. The relative wrapper keeps the absolutely-positioned sr-only text inside
// the table's scroll container, otherwise it escapes and widens the page on mobile.
export const SrHeader = ({ children }) => <span className="relative inline-block"><span className="sr-only">{children}</span></span>;

// ---------- Round 3 helpers (admin growth pages) ----------
const AGO = EN.ADMIN_PRO.COMMON;

// Severity chip: icon + label + colour (never colour alone).
const SEVERITY = {
  high: [ShieldAlert, "bg-red-50 text-red-700 ring-red-200"],
  low: [Info, "bg-slate-100 text-slate-700 ring-slate-200"],
  medium: [TriangleAlert, "bg-amber-50 text-amber-800 ring-amber-200"],
};
export function SeverityChip({ level }) {
  const [Icon, tone] = SEVERITY[level] ?? SEVERITY.low;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", tone)}><Icon aria-hidden className="size-3.5" />{AGO.SEVERITY[level] ?? level}</span>;
}

// Coloured status pill with a label from the page's own dictionary.
export function Pill({ children, className, tone = "neutral" }) {
  return <Badge className={cn("whitespace-nowrap", className)} tone={tone}>{children}</Badge>;
}

// KPI strip: [[label, value, tone?]]
export function KpiStrip({ className, items }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6", className)}>
      {items.filter(Boolean).map(([label, value, tone]) => <MiniStat key={label} label={label} tone={tone} value={value} />)}
    </div>
  );
}

// Toolbar row for filters above a table.
export function FilterBar({ children }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2 [&>*]:max-w-full">{children}</div>;
}
