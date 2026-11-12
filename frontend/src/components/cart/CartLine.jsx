import { Trash2 } from "lucide-react";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";

import { EN, ROUTES } from "@/locales";
import { removeFromCart, updateQuantity } from "@/store/slices/cartSlice";
import { discountPercent } from "@/utils/catalog";
import { formatCurrency } from "@/utils/format";
import { infoToast } from "@/utils/toast";

const P = EN.BUYER_HUB.PRICING;

import { PriceTag, QuantityStepper, SmartImage } from "../ui";

export function CartLine({ item }) {
  const dispatch = useDispatch();
  const { maxQty, moq, moqOk, nextTier, product, quantity, tier, unitPrice, variant } = item;
  const setQty = (q) => dispatch(updateQuantity({ maxQty: Math.max(moq, maxQty), minQty: moq, quantity: q, variantId: variant.id }));
  const label = Object.values(variant.attributes).join(" / ");
  return (
    <li className="flex gap-4 py-4">
      <Link className="size-24 shrink-0 overflow-hidden rounded-lg bg-slate-50 sm:size-28" to={ROUTES.PRODUCT(product.slug)}>
        <SmartImage alt={product.name} className="size-full object-contain p-2" src={product.thumbnail} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link className="line-clamp-2 font-medium hover:text-brand-700" to={ROUTES.PRODUCT(product.slug)}>{product.name}</Link>
        {label && <p className="mt-0.5 text-sm text-muted">{label}</p>}
        <PriceTag className="mt-1" discount={discountPercent(unitPrice, variant.mrp)} mrp={variant.mrp} price={unitPrice} />
        {tier && <p className="mt-0.5 text-xs font-medium text-emerald-700">{P.CART_UNIT(formatCurrency(unitPrice), tier.minQty)}</p>}
        {nextTier && <p className="mt-1 inline-flex w-fit rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">{P.NUDGE(nextTier.addQty, formatCurrency(nextTier.unitPrice))}</p>}
        {variant.stock < quantity && <p className="mt-1 text-xs font-semibold text-red-600">{EN.ERRORS.STOCK_LIMIT(variant.stock)}</p>}
        {!moqOk && <p className="mt-1 text-xs font-semibold text-red-600">{product.enquiryOnly ? P.ENQUIRY_ONLY_IN_CART : P.MOQ_NOTE(moq)}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <QuantityStepper max={Math.max(moq, maxQty)} min={moq} onChange={setQty} value={quantity} />
          {quantity > 1 && <span className="text-sm font-semibold tabular">{formatCurrency(item.lineTotal)}</span>}
          <button className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-red-600" onClick={() => { dispatch(removeFromCart(variant.id)); infoToast(EN.CART.REMOVED); }} type="button">
            <Trash2 aria-hidden className="size-4" /> {EN.CART.REMOVE}
          </button>
        </div>
      </div>
    </li>
  );
}
