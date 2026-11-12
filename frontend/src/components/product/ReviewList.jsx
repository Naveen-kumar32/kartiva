import { BadgeCheck } from "lucide-react";

import { EN } from "@/locales";
import { formatDate } from "@/utils/format";

import { Rating, Stars } from "../ui";

export function ReviewList({ rating, reviewCount, reviews }) {
  // Approximate distribution for the demo summary bars.
  const dist = [5, 4, 3, 2, 1].map((star) => {
    const weight = Math.max(0.02, 1 - Math.abs(star - rating) / 2.5);
    return { star, weight };
  });
  const total = dist.reduce((s, d) => s + d.weight, 0);

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
          {dist.map(({ star, weight }) => (
            <div className="flex items-center gap-2 text-xs" key={star}>
              <span className="w-6 tabular">{star}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(weight / total) * 100}%` }} />
              </div>
              <span className="w-10 text-right text-muted tabular">{Math.round((weight / total) * reviewCount).toLocaleString("en-IN")}</span>
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
