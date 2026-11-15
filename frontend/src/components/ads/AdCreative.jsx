import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { useImageKind } from "@/hooks";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";

import { SmartImage } from "../ui";
import { SponsoredBadge } from "./SponsoredBadge";

const isPaid = (ad) => ad.advertiserType !== "house";

// Renders an ad from structured fields (eyebrow, headline, subtext, cta, theme, product image).
// layout: "hero" | "wide" | "tall" | "compact"
export function AdCreative({ ad, layout = "wide" }) {
  const image = ad.imageUrl || ad.product?.images?.[0] || ad.product?.thumbnail;
  // imageFit: "photo" = fill edge to edge, "cutout" = product on the circle, "auto"/unset = look at the picture.
  const forced = ad.imageFit === "photo" || ad.imageFit === "cutout" ? ad.imageFit : null;
  const detected = useImageKind(image, Boolean(image) && !forced);
  // Own image → full photo unless it's clearly a cut-out; product image → cut-out unless it's clearly a photo.
  const fallback = ad.imageUrl ? "photo" : "cutout";
  const kind = forced ?? (detected === "unknown" ? fallback : detected) ?? (ad.imageUrl ? "photo" : null);
  const photo = kind === "photo";
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

      {photo && (
        // Full photo: the WHOLE picture is shown (never cropped); a blurred copy of it fills the spare space
        // and fades into the theme colour, so any shape (tall, square, wide) looks intentional.
        <div aria-hidden className={cn("pointer-events-none overflow-hidden", tall ? "relative mt-auto h-48 w-full" : hero ? "absolute inset-0 sm:left-auto sm:w-1/2" : "absolute inset-y-0 right-0 w-1/2")}>
          {/* the fade lives on an unscaled wrapper, so it starts exactly at the edge (no visible seam) */}
          <span className={cn(
            "absolute inset-0 overflow-hidden",
            tall ? "[mask-image:linear-gradient(to_bottom,transparent,black_40%)]" : "[mask-image:linear-gradient(to_right,transparent,black_60%)]",
            hero && "max-sm:[mask-image:none]",
          )}>
            <SmartImage alt="" className="size-full scale-125 object-cover opacity-70 blur-2xl" src={image} />
          </span>
          <SmartImage
            alt=""
            className={cn(
              "relative size-full object-contain drop-shadow-2xl transition duration-700 group-hover:scale-[1.03]",
              tall ? "p-2" : hero ? "object-right py-3 pr-3 sm:object-center sm:p-4" : "object-right py-2 pr-2",
            )}
            src={image}
          />
          {/* mobile hero: the photo sits behind the text, so darken the left side for readability */}
          {hero && <span className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent sm:hidden" />}
        </div>
      )}

      {image && kind === "cutout" && (
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
