import { Layers } from "lucide-react";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { formatCurrency } from "@/utils/format";
import { priceTiersOf, tierFor, tierUnitPrice } from "@/utils/pricing";

const B = EN.BUYER_HUB.PRICING;

// Wholesale slab table (IndiaMART / Alibaba "Bulk pricing"): qty range → price per unit → saving.
// The row that applies to the chosen quantity is highlighted.
// onPick(minQty) (optional) lets the buyer jump straight to a slab's quantity.
export function BulkPricingTable({ className, onPick, product, quantity, variant }) {
  const tiers = priceTiersOf(product);
  if (!tiers.length) return null;
  const active = tierFor(product, quantity);
  const rows = [{ discountPct: 0, minQty: 1 }, ...tiers].map((t, i, all) => ({
    ...t, isActive: (active?.minQty ?? 1) === t.minQty, maxQty: all[i + 1] ? all[i + 1].minQty - 1 : null, price: tierUnitPrice(variant.price, t.discountPct ? t : null),
  }));
  return (
    <section aria-labelledby="bulk-pricing-title" className={cn("rounded-xl border border-line bg-white p-4", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold" id="bulk-pricing-title"><Layers aria-hidden className="size-4 text-brand-600" />{B.TITLE}</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="pb-2 font-semibold" scope="col">{B.QTY}</th>
            <th className="px-2 pb-2 font-semibold" scope="col">{B.PRICE_PER_UNIT}</th>
            <th className="pb-2 text-right font-semibold" scope="col">{B.YOU_SAVE}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr aria-current={r.isActive ? "true" : undefined} className={cn("border-t border-line", r.isActive && "bg-brand-50 font-semibold text-brand-800")} key={r.minQty}>
              <td className="py-2 pl-2">
                {onPick && !r.isActive ? (
                  <button aria-label={B.PICK(r.minQty)} className="font-medium text-brand-700 underline-offset-2 hover:underline" onClick={() => onPick(r.minQty)} type="button">{B.RANGE(r.minQty, r.maxQty)}</button>
                ) : B.RANGE(r.minQty, r.maxQty)}
              </td>
              <td className="whitespace-nowrap px-2 py-2 tabular">{formatCurrency(r.price)}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right tabular">{r.discountPct ? <span className="text-emerald-700">{B.SAVE_PCT(r.discountPct)}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
