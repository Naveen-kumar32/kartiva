import { BadgeCheck } from "lucide-react";

import { estimateCounts } from "@/data";
import { EN } from "@/locales";
import { formatDate } from "@/utils/format";

import { Rating, Stars } from "../ui";

export function ReviewList({ rating, ratingCounts, reviewCount, reviews }) {
  if (!reviewCount && !reviews.length) return <p className="text-sm text-muted">{EN.PRODUCT.NO_RATINGS}</p>;

  // Star breakdown from the server (real counts once customers rate; an estimate for seeded demo ratings).
  const counts = ratingCounts ?? estimateCounts(rating, reviewCount);
  const total = Math.max(1, [1, 2, 3, 4, 5].reduce((t, s) => t + (counts[s] || 0), 0));

  return (
    <div className="grid gap-8 md:grid-cols-[260px_1fr]">
      <div>
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold">{rating.toFixed(1)}</span>
          <div>
            <Stars value={rating} />
            <p className="text-xs text-muted">{EN.PRODUCT.RATINGS(reviewCount)}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => (
            <div className="flex items-center gap-2 text-xs" key={star}>
              <span className="w-6 tabular">{star}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${((counts[star] || 0) / total) * 100}%` }} />
              </div>
              <span className="w-10 text-right text-muted tabular">{(counts[star] || 0).toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {reviews.map((r) => (
          <li className="py-4 first:pt-0" key={r.id}>
            <div className="flex items-center gap-2">
              <Rating value={r.rating} />
              <span className="font-semibold">{r.title}</span>
            </div>
            <p className="mt-2 text-sm text-ink/90">{r.body}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{r.author}, {r.city}</span>
              <span>{formatDate(r.createdAt)}</span>
              {r.verified && <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck aria-hidden className="size-3.5" />{EN.PRODUCT.VERIFIED_PURCHASE}</span>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
