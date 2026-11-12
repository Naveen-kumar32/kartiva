import { Banknote, MapPin, Truck } from "lucide-react";
import { useState } from "react";

import { checkDelivery } from "@/api";
import { EN } from "@/locales";
import { shippingFee } from "@/utils/catalog";
import { formatCurrency } from "@/utils/format";

export function DeliveryCheck({ defaultPincode = "600090", price, product }) {
  const [pincode, setPincode] = useState(defaultPincode);
  const [state, setState] = useState({ loading: false, methods: null });
  const valid = /^[1-9]\d{5}$/.test(pincode);

  const check = async (e) => {
    e?.preventDefault();
    if (!valid) return;
    setState({ loading: true, methods: null });
    setState({ loading: false, methods: await checkDelivery(product, pincode) });
  };

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MapPin aria-hidden className="size-4 text-brand-600" /> {EN.PRODUCT.DELIVERY}</p>
      <form className="flex gap-2" onSubmit={check}>
        <input aria-label={EN.PRODUCT.DELIVERY_ENTER_PINCODE} className="h-10 w-full rounded-lg border border-line px-3 text-sm tabular" inputMode="numeric" maxLength={6} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} placeholder={EN.PRODUCT.DELIVERY_ENTER_PINCODE} value={pincode} />
        <button className="h-10 rounded-lg border border-brand-600 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50" disabled={!valid || state.loading} type="submit">{EN.PRODUCT.CHECK}</button>
      </form>
      {state.methods && (
        state.methods.length === 0 ? <p className="mt-3 text-sm text-red-600">{EN.PRODUCT.DELIVERY_NOT_SERVICEABLE}</p> : (
          <ul className="mt-3 space-y-2">
            {state.methods.map((m) => {
              const fee = shippingFee(m, price);
              return (
                <li className="flex items-start gap-2 text-sm" key={m.id}>
                  <Truck aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="flex-1">
                    <p className="font-medium">{m.name} · <span className="text-emerald-700">{EN.COMMON.DAYS(m.minDays, m.maxDays)}</span></p>
                    <p className="text-xs text-muted">
                      {fee === 0 ? EN.CART.FREE : formatCurrency(fee)}
                      {m.freeAbove && fee > 0 ? ` · ${EN.PRODUCT.FREE_ABOVE(formatCurrency(m.freeAbove))}` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs ${m.codAllowed ? "text-emerald-700" : "text-muted"}`}>
                    <Banknote aria-hidden className="size-3.5" /> {m.codAllowed ? "COD" : EN.PRODUCT.COD_UNAVAILABLE}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
