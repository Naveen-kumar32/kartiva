import { BadgeCheck, EyeOff, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { getSellerReviews } from "@/api";
import { Badge, EmptyState, ErrorState, PageHeader, PageLoader, Panel, Rating, Stars } from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, formatDate } from "@/utils";

const H = EN.SELLER_HUB;

export function SellerReviews() {
  useDocumentTitle(EN.SELLER.NAV_REVIEWS);
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => getSellerReviews(user.storeSlug), [user.storeSlug]);
  const [stars, setStars] = useState(0);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const reviews = data ?? [];
  const avg = reviews.length ? reviews.reduce((t, r) => t + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ count: reviews.filter((r) => r.rating === s).length, star: s }));
  const shown = reviews.filter((r) => !stars || r.rating === stars);

  return (
    <div className="space-y-6">
      <PageHeader subtitle={H.REVIEWS_SUBTITLE} title={EN.SELLER.NAV_REVIEWS} />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Panel className="h-fit">
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold">{avg.toFixed(1)}</span>
            <div><Stars value={avg} /><p className="text-xs text-muted">{H.REVIEW_COUNT(reviews.length)}</p></div>
          </div>
          <div className="mt-4 space-y-1">
            {dist.map(({ count, star }) => (
              <button
                aria-pressed={stars === star}
                className={cn("flex w-full items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-slate-50", stars === star && "bg-brand-50")}
                key={star}
                onClick={() => setStars(stars === star ? 0 : star)}
                type="button"
              >
                <span className="w-6 tabular">{star}★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${reviews.length ? (count / reviews.length) * 100 : 0}%` }} /></span>
                <span className="w-6 text-right text-muted tabular">{count}</span>
              </button>
            ))}
          </div>
          {stars > 0 && <button className="mt-3 text-xs font-semibold text-brand-700" onClick={() => setStars(0)} type="button">{H.CLEAR_FILTER}</button>}
        </Panel>
        <Panel>
          {shown.length === 0 ? <EmptyState icon={MessageSquareText} title={H.NO_REVIEWS} /> : (
            <ul className="divide-y divide-line">
              {shown.map((r) => (
                <li className="py-4 first:pt-0" key={r.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Rating value={r.rating} />
                    <span className="font-semibold">{r.title}</span>
                    {r.hidden && <Badge tone="danger"><EyeOff className="size-3" />{H.HIDDEN_BY_ADMIN}</Badge>}
                  </div>
                  <p className="mt-2 text-sm">{r.body}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <Link className="font-medium text-brand-700 hover:underline" to={ROUTES.PRODUCT(r.productSlug)}>{r.productName}</Link>
                    <span>{r.author}, {r.city}</span>
                    <span>{formatDate(r.createdAt)}</span>
                    {r.verified && <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck aria-hidden className="size-3.5" />{EN.PRODUCT.VERIFIED_PURCHASE}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
