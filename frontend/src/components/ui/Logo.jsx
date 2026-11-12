import { Link } from "react-router-dom";

import { EN, ROUTES } from "@/locales";
import { cn } from "@/utils/cn";

export function Logo({ className, light = false }) {
  return (
    <Link aria-label={`${EN.APP.NAME} home`} className={cn("flex items-center gap-2", className)} to={ROUTES.HOME}>
      <svg aria-hidden className="size-8 shrink-0" viewBox="0 0 64 64">
        <rect fill={light ? "#fff" : "#0E7C7B"} height="64" rx="14" width="64" />
        <path d="M18 24h28l-3 26H21z" fill={light ? "#0E7C7B" : "#fff"} />
        <path d="M25 24v-3a7 7 0 0 1 14 0v3" fill="none" stroke="#F59E0B" strokeLinecap="round" strokeWidth="4" />
        <path d="M28 31v13M28 38l7-7M28 38l7 6" fill="none" stroke={light ? "#fff" : "#0E7C7B"} strokeLinecap="round" strokeWidth="3.5" />
      </svg>
      <span className={cn("text-xl font-extrabold tracking-tight", light ? "text-white" : "text-ink")}>
        {EN.APP.NAME.slice(0, -2)}<span className="text-accent-500">{EN.APP.NAME.slice(-2)}</span>
      </span>
    </Link>
  );
}
