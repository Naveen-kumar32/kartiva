import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";

import { SmartImage } from "../ui";
import { SponsoredBadge } from "./SponsoredBadge";

const isPaid = (ad) => ad.advertiserType !== "house";

// Renders an ad from structured fields (eyebrow, headline, subtext, cta, theme, product image).
// layout: "hero" | "wide" | "tall" | "compact"
export function AdCreative({ ad, layout = "wide" }) {
  const image = ad.imageUrl ?? ad.product?.images?.[0] ?? ad.product?.thumbnail;
  const hero = layout === "hero";
  const tall = layout === "tall";
  return (
    <Link
      className={cn(
        "group relative flex overflow-hidden text-white",
        hero && "h-[260px] rounded-2xl sm:h-[340px] lg:h-[380px]",
        layout === "wide" && "min-h-[150px] rounded-2xl sm:min-h-[180px]",
        layout === "compact" && "min-h-[120px] rounded-xl",
        tall && "min-h-[340px] flex-col rounded-xl",
      )}
      rel={isPaid(ad) ? "sponsored noopener" : undefined}
      style={{ background: ad.theme }}
      to={ad.link}
    >
      {/* soft decorative shapes */}
      <span aria-hidden className="absolute -right-16 -top-24 size-72 rounded-full bg-white/10 blur-2xl" />
      <span aria-hidden className="absolute -bottom-28 left-1/3 size-72 rounded-full bg-black/10 blur-2xl" />

      <div className={cn("relative z-10 flex flex-col justify-center", tall ? "p-5" : hero ? "w-full p-6 sm:w-3/5 sm:p-10 lg:p-14" : "w-2/3 p-5 sm:p-8")}>
        {ad.eyebrow && <p className={cn("font-semibold uppercase tracking-wider text-white/80", hero ? "text-xs sm:text-sm" : "text-[11px]")}>{ad.eyebrow}</p>}
        <h3 className={cn("font-extrabold leading-tight tracking-tight", hero ? "mt-2 text-2xl sm:text-4xl lg:text-5xl" : tall ? "mt-1 text-xl" : "mt-1 text-lg sm:text-2xl")}>{ad.headline}</h3>
        {ad.subtext && <p className={cn("text-white/85", hero ? "mt-3 text-sm sm:text-base" : "mt-1 text-xs sm:text-sm")}>{ad.subtext}</p>}
        {ad.cta && (
          <span className={cn("mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-white font-semibold text-ink shadow-sm transition group-hover:gap-2.5", hero ? "px-5 py-2.5 text-sm" : "px-3.5 py-1.5 text-xs sm:text-sm")}>
            {ad.cta} <ArrowRight aria-hidden className="size-4" />
          </span>
        )}
      </div>

      {image && (
        <div className={cn("relative z-0 flex items-center justify-center", tall ? "mt-auto h-40 p-4" : hero ? "absolute bottom-0 right-0 top-0 hidden w-2/5 sm:flex" : "w-1/3 p-3")}>
          <span aria-hidden className={cn("absolute rounded-full bg-white/20", hero ? "size-64 lg:size-80" : "size-28 sm:size-36")} />
          <SmartImage alt="" className={cn("relative object-contain drop-shadow-2xl transition duration-500 group-hover:scale-105", hero ? "max-h-[85%] max-w-[85%]" : "max-h-32 sm:max-h-40")} src={image} />
        </div>
      )}

      {isPaid(ad) && (
        <span className="absolute right-3 top-3 z-20">
          <SponsoredBadge label={ad.advertiserType === "external" ? EN.ADS.AD_LABEL : EN.ADS.SPONSORED} tone="dark" />
        </span>
      )}
    </Link>
  );
}
