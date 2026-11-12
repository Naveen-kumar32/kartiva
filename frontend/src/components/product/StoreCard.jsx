import { BadgeCheck, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

import { EN, ROUTES } from "@/locales";

import { Rating } from "../ui";

export function StoreAvatar({ size = "size-12", store }) {
  return (
    <span aria-hidden className={`grid ${size} shrink-0 place-items-center rounded-xl text-sm font-bold text-white`} style={{ background: store.color }}>
      {store.initials}
    </span>
  );
}

export function StoreCard({ compact = false, store }) {
  return (
    <Link className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-transparent transition hover:shadow-raised hover:ring-brand-100" to={ROUTES.STORE(store.slug)}>
      {!compact && <div className="h-16" style={{ background: store.banner }} />}
      <div className={`flex items-center gap-3 p-4 ${compact ? "" : "-mt-8"}`}>
        <StoreAvatar store={store} />
        <div className="min-w-0 pt-6">
          <p className="flex items-center gap-1 truncate font-semibold group-hover:text-brand-700">
            {store.name} <BadgeCheck aria-label={EN.COMMON.VERIFIED_SELLER} className="size-4 shrink-0 text-brand-600" />
          </p>
          <p className="flex items-center gap-1 text-xs text-muted"><MapPin aria-hidden className="size-3" />{store.city}</p>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-4 text-xs">
        <Rating count={store.ratingCount} value={store.rating} />
        <span className="font-semibold text-brand-700">{EN.PRODUCT.VISIT_STORE} →</span>
      </div>
    </Link>
  );
}
