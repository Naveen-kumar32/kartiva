import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getSlotAds, trackImpressions } from "@/api";
import { useAsync, useInView } from "@/hooks";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";

import { ProductRail } from "../product/ProductRail";
import { SectionHeader, Skeleton } from "../ui";
import { AdCarousel } from "./AdCarousel";
import { AdCreative } from "./AdCreative";

const RESERVED = {
  banner: "min-h-[150px] sm:min-h-[180px]",
  carousel: "h-[260px] sm:h-[340px] lg:h-[380px]",
  sponsored_products: "min-h-[320px]",
};

/**
 * Fetches live ads for a slot and renders them by format. Reserves space while loading
 * (no layout shift) and renders nothing when the slot is empty.
 * context: optional { categorySlug, query, excludeProductId } so product ads match the page.
 * variant: for banners — "wide" | "tall" | "compact"; "strip" for the top promo strip.
 */
export function AdSlot({ className, context, slotKey, title, variant = "wide" }) {
  const contextKey = JSON.stringify(context ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { data, loading } = useAsync(() => getSlotAds(slotKey, context), [slotKey, contextKey]);
  const [ref, inView] = useInView({ threshold: 0.5 });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (inView && data?.items?.length) trackImpressions(data.items.map((a) => a.id), slotKey);
  }, [inView, data, slotKey]);

  if (variant === "strip") {
    const ad = data?.items?.[0];
    if (!ad || dismissed) return null;
    return (
      <div className="relative text-white" ref={ref} style={{ background: ad.theme }}>
        <Link className="block px-10 py-2 text-center text-xs font-medium sm:text-sm" to={ad.link}>{ad.headline}</Link>
        <button aria-label={EN.COMMON.CLOSE} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/80 hover:bg-white/10" onClick={() => setDismissed(true)} type="button">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const format = data?.slot?.format ?? (variant === "carousel" ? "carousel" : "banner");
  if (loading) return <Skeleton className={cn("w-full rounded-2xl", RESERVED[format] ?? RESERVED.banner, className)} />;
  if (!data?.items?.length) return null;

  return (
    <div className={className} ref={ref}>
      {format === "carousel" && <AdCarousel items={data.items} rotationSeconds={data.slot.rotationSeconds} />}
      {format === "banner" && <AdCreative ad={data.items[0]} layout={variant} />}
      {format === "sponsored_products" && (
        <section>
          <SectionHeader title={title ?? EN.ADS.SPONSORED_PICKS} />
          <ProductRail products={data.items.filter((a) => a.product).map((a) => a.product)} sponsored />
        </section>
      )}
    </div>
  );
}
