import { Plus } from "lucide-react";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";

import { EN, ROUTES } from "@/locales";
import { addToCart } from "@/store/slices/cartSlice";
import { maxQtyFor } from "@/utils/cart";
import { getDefaultVariant } from "@/utils/catalog";
import { cn } from "@/utils/cn";
import { minOrderQty } from "@/utils/pricing";
import { successToast } from "@/utils/toast";

import { SponsoredBadge } from "../ads/SponsoredBadge";
import { PriceTag, Rating, SmartImage } from "../ui";
import { TradeChips } from "./TradeChips";
import { WishlistButton } from "./WishlistButton";

// Products a seller added in the last 14 days get a "New" tag (they are also listed first by default).
const NEW_FOR_MS = 14 * 86_400_000;
const isNewArrival = (p) => Boolean(p.createdAt) && Date.now() - new Date(p.createdAt).getTime() < NEW_FOR_MS;

export function ProductCard({ className, product, sponsored = false }) {
  const dispatch = useDispatch();
  const { discount, hasRange, mrp, price, totalStock } = product.summary;
  const outOfStock = totalStock === 0;
  const moq = minOrderQty(product);
  const canQuickAdd = !outOfStock && product.variants.length === 1 && !product.enquiryOnly && getDefaultVariant(product).stock >= moq;

  const quickAdd = (e) => {
    e.preventDefault();
    const variant = getDefaultVariant(product);
    dispatch(addToCart({ maxQty: maxQtyFor(product, variant), productId: product.id, quantity: moq, variantId: variant.id }));
    successToast(EN.CART.ADDED);
  };

  return (
    <Link
      className={cn("group relative flex flex-col rounded-xl bg-white p-3 shadow-card ring-1 ring-transparent transition hover:shadow-raised hover:ring-brand-100", className)}
      to={ROUTES.PRODUCT(product.slug)}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-50">
        <SmartImage alt={product.name} className={cn("size-full object-contain p-2 transition duration-300 group-hover:scale-105", outOfStock && "opacity-50 grayscale")} src={product.thumbnail} />
        {discount > 0 && !outOfStock && (
          <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white">-{discount}%</span>
        )}
        <WishlistButton className="absolute right-2 top-2" product={product} />
        {outOfStock && <span className="absolute inset-x-2 bottom-2 rounded-md bg-slate-900/80 py-1 text-center text-xs font-semibold text-white">{EN.PRODUCT.OUT_OF_STOCK}</span>}
        {canQuickAdd && (
          <button
            aria-label={`${EN.PRODUCT.ADD_TO_CART}: ${product.name}`}
            className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-accent-500 text-ink shadow-md transition hover:bg-accent-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
            onClick={quickAdd}
            type="button"
          >
            <Plus className="size-5" />
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted">{product.brand}</span>
          {sponsored ? <SponsoredBadge /> : isNewArrival(product) && (
            <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">{EN.PRODUCT.NEW_ARRIVAL}</span>
          )}
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-ink group-hover:text-brand-700">{product.name}</h3>
        <Rating className="mt-1.5" count={product.reviewCount} value={product.rating} />
        {product.enquiryOnly && <span className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{EN.BUYER_HUB.CHIPS.EX_SHOWROOM}</span>}
        <PriceTag className={product.enquiryOnly ? "" : "mt-2"} discount={discount} mrp={mrp} price={hasRange ? product.summary.minPrice : price} />
        <TradeChips className="mt-1.5" product={product} />
        <p className="mt-1 truncate text-xs text-muted">{EN.PRODUCT.SOLD_BY} <span className="font-medium text-ink">{product.store.name}</span></p>
        {!outOfStock && totalStock <= 3 && <p className="mt-1 text-xs font-semibold text-red-600">{EN.PRODUCT.ONLY_LEFT(totalStock)}</p>}
      </div>
    </Link>
  );
}
