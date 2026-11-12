import { Award, BadgeCheck, Crown, ShieldCheck, Star } from "lucide-react";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";

const M = EN.MARKET;
// Trust signals for a store (IndiaMART "TrustSEAL" / Alibaba "Verified Supplier" style).
export function VerifiedBadges({ className, compact = false, store }) {
  if (!store) return null;
  const items = [
    store.plan === "platinum" && [Crown, M.BADGE_PLATINUM, "bg-violet-50 text-violet-700 ring-violet-200"],
    store.plan === "gold" && [Award, M.BADGE_GOLD, "bg-amber-50 text-amber-800 ring-amber-200"],
    store.kycStatus === "verified" && [ShieldCheck, M.BADGE_KYC, "bg-emerald-50 text-emerald-700 ring-emerald-200"],
    store.gstVerified && [BadgeCheck, M.BADGE_GST, "bg-sky-50 text-sky-700 ring-sky-200"],
    store.badges?.includes("trusted") && !compact && [ShieldCheck, M.BADGE_TRUSTED, "bg-brand-50 text-brand-700 ring-brand-200"],
    store.badges?.includes("top_rated") && !compact && [Star, M.BADGE_TOP_RATED, "bg-orange-50 text-orange-700 ring-orange-200"],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map(([Icon, label, tone]) => (
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tone)} key={label}>
          <Icon aria-hidden className="size-3.5" />{label}
        </span>
      ))}
    </div>
  );
}
