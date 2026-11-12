import { EN } from "@/locales";
import { findVariant } from "@/utils/catalog";
import { cn } from "@/utils/cn";

const SWATCH = {
  "Forest Green": "#166534", Graphite: "#3f3f46", "Midnight Black": "#111827", "Ocean Blue": "#1d4ed8", "Rose Gold": "#e8b4a0", Silver: "#cbd5e1",
};

// Chips per option. A value is disabled if no in-stock variant exists with the other current selections.
export function VariantSelector({ onSelect, product, selected }) {
  if (!product.variantOptions.length) return null;
  return (
    <div className="space-y-4">
      {product.variantOptions.map((option) => (
        <div key={option.name}>
          <p className="mb-2 text-sm">
            <span className="font-semibold">{option.name}:</span> <span className="text-muted">{selected[option.name]}</span>
          </p>
          <div aria-label={EN.PRODUCT.SELECT(option.name)} className="flex flex-wrap gap-2" role="radiogroup">
            {option.values.map((value) => {
              const candidate = findVariant(product, { ...selected, [option.name]: value });
              const available = candidate && candidate.stock > 0;
              const isActive = selected[option.name] === value;
              const swatch = option.name === "Colour" ? SWATCH[value] : null;
              return (
                <button
                  aria-checked={isActive}
                  className={cn(
                    "relative flex h-10 min-w-12 items-center gap-2 rounded-lg border-2 px-3 text-sm font-medium transition",
                    isActive ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white hover:border-brand-300",
                    !available && "text-slate-400 line-through decoration-slate-400",
                  )}
                  key={value}
                  onClick={() => onSelect({ ...selected, [option.name]: value })}
                  role="radio"
                  title={available ? value : `${value} — ${EN.PRODUCT.OUT_OF_STOCK}`}
                  type="button"
                >
                  {swatch && <span aria-hidden className="size-4 rounded-full ring-1 ring-black/10" style={{ background: swatch }} />}
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
