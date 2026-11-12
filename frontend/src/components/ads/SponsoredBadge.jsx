import { EN } from "@/locales";

export function SponsoredBadge({ label = EN.ADS.SPONSORED, tone = "light" }) {
  return (
    <span className={tone === "dark" ? "rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90" : "shrink-0 text-[10px] font-semibold uppercase tracking-wider text-sponsored"}>
      {label}
    </span>
  );
}
