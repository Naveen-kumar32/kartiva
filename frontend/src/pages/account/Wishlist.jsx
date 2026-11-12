import { Heart, MessageSquareQuote, ShoppingCart, Trash2, TrendingDown, Undo2 } from "lucide-react";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";

import { getWishlist, toggleWishlist } from "@/api";
import { Badge, Button, Container, EmptyState, EnquiryButton, ErrorState, PageHeader, PageLoader, PriceTag, publishWishlistIds, SmartImage, TradeChips } from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { addToCart } from "@/store/slices/cartSlice";
import { maxQtyFor } from "@/utils/cart";
import { getDefaultVariant } from "@/utils/catalog";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { minOrderQty } from "@/utils/pricing";
import { errorToast, successToast } from "@/utils/toast";

const B = EN.BUYER_HUB.WISHLIST;

export function Wishlist() {
  useDocumentTitle(B.TITLE);
  const { user } = useAuth();
  const dispatch = useDispatch();
  const { data, error, loading, reload, setData } = useAsync(() => getWishlist(user), [user?.email]);
  const [busyId, setBusyId] = useState(null);
  if (loading) return <PageLoader />;
  if (error) return <Container className="pt-6"><ErrorState message={error} onRetry={reload} /></Container>;

  const remove = async (product, quiet = false) => {
    setBusyId(product.id);
    try {
      const res = await toggleWishlist(user, product.id);
      publishWishlistIds(user.email, res.ids);
      setData(data.filter((p) => p.id !== product.id));
      if (!quiet) successToast(B.REMOVED);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };
  const moveToCart = async (product) => {
    const variant = getDefaultVariant(product);
    dispatch(addToCart({ maxQty: maxQtyFor(product, variant), productId: product.id, quantity: minOrderQty(product), variantId: variant.id }));
    await remove(product, true);
    successToast(B.MOVED);
  };

  return (
    <Container className="max-w-6xl space-y-5 pt-6">
      <PageHeader subtitle={B.COUNT(data.length)} title={B.TITLE} />
      {!data.length ? (
        <EmptyState actionLabel={EN.CART.CONTINUE_SHOPPING} actionTo={ROUTES.HOME} body={B.EMPTY_BODY} icon={Heart} title={B.EMPTY} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {data.map((p) => {
            const variant = getDefaultVariant(p);
            const canBuy = !p.enquiryOnly && variant.stock >= minOrderQty(p);
            return (
              <li className="flex flex-col rounded-xl bg-white p-3 shadow-card" key={p.id}>
                <Link className="relative block aspect-square overflow-hidden rounded-lg bg-slate-50" to={ROUTES.PRODUCT(p.slug)}>
                  <SmartImage alt={p.name} className="size-full object-contain p-2" src={p.thumbnail} />
                  {p.signal && (
                    <span className="absolute left-2 top-2">
                      <Badge tone={p.signal === "price_drop" ? "success" : "info"}>
                        {p.signal === "price_drop" ? <TrendingDown aria-hidden className="size-3" /> : <Undo2 aria-hidden className="size-3" />}
                        {B.SIGNALS[p.signal]}
                      </Badge>
                    </span>
                  )}
                </Link>
                <Link className="mt-2 line-clamp-2 text-sm font-medium hover:text-brand-700" to={ROUTES.PRODUCT(p.slug)}>{p.name}</Link>
                <p className="truncate text-xs text-muted">{p.store?.name}</p>
                {p.enquiryOnly && <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">{EN.BUYER_HUB.CHIPS.EX_SHOWROOM}</span>}
                <PriceTag discount={p.summary.discount} mrp={p.summary.mrp} price={p.summary.hasRange ? p.summary.minPrice : p.summary.price} />
                <TradeChips className="mt-1" product={p} />
                {!p.enquiryOnly && !canBuy && <p className="mt-1 text-xs font-semibold text-red-600">{EN.PRODUCT.OUT_OF_STOCK}</p>}
                <div className="mt-auto space-y-2 pt-3">
                  {p.enquiryOnly ? (
                    <EnquiryButton fullWidth mode="on_road" product={p} size="sm" store={p.store} variant="primary"><MessageSquareQuote className="size-4" />{EN.BUYER_HUB.ENQUIRY.CTA_ON_ROAD}</EnquiryButton>
                  ) : (
                    <Button disabled={!canBuy || busyId === p.id} fullWidth onClick={() => moveToCart(p)} size="sm" variant="accent"><ShoppingCart className="size-4" />{B.MOVE_TO_CART}</Button>
                  )}
                  <Button disabled={busyId === p.id} fullWidth onClick={() => remove(p)} size="sm" variant="ghost"><Trash2 className="size-4" />{B.REMOVE}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">{B.SAMPLE_NOTE}</p>
    </Container>
  );
}
