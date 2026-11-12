import { Truck } from "lucide-react";
import { Link } from "react-router-dom";

import { EN, ROUTES } from "@/locales";
import { formatCurrency } from "@/utils/format";

import { StoreAvatar } from "../product/StoreCard";
import { CartLine } from "./CartLine";

export function CartSellerGroup({ group }) {
  const { fee, freeGap, items, method, store, subtotal } = group;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
      <header className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <StoreAvatar size="size-9" store={store} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{EN.CART.SOLD_BY}</p>
          <Link className="font-semibold hover:text-brand-700" to={ROUTES.STORE(store.slug)}>{store.name}</Link>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Truck aria-hidden className="size-4" /> {method.name} · {EN.COMMON.DAYS(method.minDays, method.maxDays)}
        </p>
      </header>
      <ul className="divide-y divide-line">{items.map((item) => <CartLine item={item} key={item.variantId} />)}</ul>
      {freeGap > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{EN.CART.ADD_MORE_FOR_FREE(formatCurrency(freeGap), store.name)}</p>
      )}
      <footer className="mt-3 flex justify-end gap-6 text-sm">
        <span className="text-muted">{EN.CART.SUBTOTAL} <b className="text-ink tabular">{formatCurrency(subtotal)}</b></span>
        <span className="text-muted">{EN.CART.DELIVERY} <b className={fee === 0 ? "text-emerald-700" : "text-ink tabular"}>{fee === 0 ? EN.CART.FREE : formatCurrency(fee)}</b></span>
      </footer>
    </section>
  );
}
