import { PenLine, Star } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { getMyReview } from "@/api";
import { useAsync, useAuth } from "@/hooks";
import { EN, ROUTES } from "@/locales";

import { Button } from "../ui";
import { ReviewModal } from "./ReviewModal";

const R = EN.REVIEW;

/** "Rate this product" on the product page. Only buyers with a delivered order can rate; others see why not. */
export function RateProduct({ onSaved, product }) {
  const { role, user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isBuyer = role === "buyer";
  const { data, reload } = useAsync(() => (isBuyer ? getMyReview(product.slug) : Promise.resolve(null)), [product.slug, user?.email, role]);

  if (!user) {
    return <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline" state={{ from: location.pathname }} to={ROUTES.LOGIN}><Star className="size-4" />{R.SIGN_IN_TO_RATE}</Link>;
  }
  if (!isBuyer || !data) return null;
  if (!data.canReview) return <p className="max-w-xs text-xs text-muted">{R.ONLY_BUYERS}</p>;
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant={data.review ? "outline" : "primary"}>
        {data.review ? <PenLine className="size-4" /> : <Star className="size-4" />}{data.review ? R.EDIT_MINE : R.RATE_PRODUCT}
      </Button>
      {open && (
        <ReviewModal
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); reload(); onSaved?.(); }}
          product={{ image: product.thumbnail ?? product.images?.[0], name: product.name, slug: product.slug }}
          review={data.review}
        />
      )}
    </>
  );
}
