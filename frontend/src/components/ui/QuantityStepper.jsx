import { Minus, Plus } from "lucide-react";

import { EN } from "@/locales";

export function QuantityStepper({ label = EN.PRODUCT.QUANTITY, max = 10, min = 1, onChange, value }) {
  return (
    <div aria-label={label} className="inline-flex h-10 items-center rounded-lg border border-line bg-white" role="group">
      <button aria-label={EN.COMMON.DECREASE} className="grid size-10 place-items-center text-muted hover:text-ink disabled:opacity-40" disabled={value <= min} onClick={() => onChange(value - 1)} type="button">
        <Minus className="size-4" />
      </button>
      <span aria-live="polite" className="w-8 text-center text-sm font-semibold tabular">{value}</span>
      <button aria-label={EN.COMMON.INCREASE} className="grid size-10 place-items-center text-muted hover:text-ink disabled:opacity-40" disabled={value >= max} onClick={() => onChange(value + 1)} type="button">
        <Plus className="size-4" />
      </button>
    </div>
  );
}
