import { cn } from "@/utils/cn";

export function Toggle({ checked, disabled, label, onChange }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50", checked ? "bg-brand-600" : "bg-slate-300")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", checked ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}
