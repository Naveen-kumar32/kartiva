import { ShieldCheck } from "lucide-react";

import { EN } from "@/locales";
import { formatCurrency } from "@/utils/format";

export function CartSummary({ children, view }) {
  return (
    <aside className="rounded-2xl bg-white p-5 shadow-card lg:sticky lg:top-36">
      <h2 className="text-lg font-bold">{EN.CART.SUMMARY}</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted">{EN.CART.ITEMS_SUBTOTAL(view.itemCount)}</dt><dd className="tabular">{formatCurrency(view.itemsSubtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{EN.CART.DELIVERY}</dt><dd className={view.shippingTotal === 0 ? "font-semibold text-emerald-700" : "tabular"}>{view.shippingTotal === 0 ? EN.CART.FREE : formatCurrency(view.shippingTotal)}</dd></div>
        <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>{EN.CART.GRAND_TOTAL}</dt><dd className="tabular">{formatCurrency(view.grandTotal)}</dd></div>
      </dl>
      {view.savings > 0 && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{EN.CART.YOU_SAVE(formatCurrency(view.savings))}</p>}
      <p className="mt-2 text-xs text-muted">{EN.CART.INCLUSIVE_GST} · {EN.CART.SELLER_COUNT(view.groups.length)}</p>
      <div className="mt-4">{children}</div>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted"><ShieldCheck aria-hidden className="size-4 text-brand-600" /> {EN.PRODUCT.SECURE}</p>
    </aside>
  );
}
