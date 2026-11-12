import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { formatCurrency } from "@/utils/format";

export function PriceTag({ className, discount, mrp, price, size = "md" }) {
  const big = size === "lg";
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className={cn("font-bold text-ink tabular", big ? "text-3xl" : "text-lg")}>{formatCurrency(price)}</span>
      {mrp > price && (
        <>
          <span className={cn("text-muted line-through tabular", big ? "text-base" : "text-xs")}>
            {big && <span className="sr-only">{EN.PRODUCT.MRP} </span>}{formatCurrency(mrp)}
          </span>
          <span className={cn("font-semibold text-emerald-700", big ? "text-base" : "text-xs")}>{EN.PRODUCT.DISCOUNT(discount)}</span>
        </>
      )}
    </div>
  );
}
