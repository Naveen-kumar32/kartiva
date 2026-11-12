import { Heart } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { toggleWishlist } from "@/api";
import { useAuth } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn } from "@/utils/cn";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

import { ensureWishlistLoaded, getWishlistSnapshot, publishWishlistIds, subscribeWishlist } from "./wishlistStore";

const B = EN.BUYER_HUB.WISHLIST;

// Heart toggle for product cards and the product page. Guests are sent to login and brought back.
export function WishlistButton({ className, onChange, product, size = "sm" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { email, ids } = useSyncExternalStore(subscribeWishlist, getWishlistSnapshot);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ensureWishlistLoaded(user); }, [user]);
  const active = Boolean(user) && email === user.email && ids.includes(product.id);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { navigate(ROUTES.LOGIN, { state: { from: location.pathname + location.search } }); return; }
    setBusy(true);
    try {
      const res = await toggleWishlist(user, product.id);
      publishWishlistIds(user.email, res.ids);
      successToast(res.added ? B.ADDED : B.REMOVED);
      onChange?.(res);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      aria-label={`${active ? B.REMOVE_FROM : B.ADD_TO}: ${product.name}`}
      aria-pressed={active}
      className={cn(
        "grid place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-line transition hover:scale-105 disabled:opacity-60",
        size === "lg" ? "size-11" : "size-8",
        className,
      )}
      disabled={busy}
      onClick={toggle}
      type="button"
    >
      <Heart aria-hidden className={cn(size === "lg" ? "size-5" : "size-4", active ? "fill-red-500 text-red-500" : "text-slate-500")} />
    </button>
  );
}
