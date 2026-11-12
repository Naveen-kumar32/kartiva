import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { EN } from "@/locales";

export function SectionHeader({ action, subtitle, title, to }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {to && (
        <Link className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline" to={to}>
          {action ?? EN.COMMON.SEE_ALL} <ChevronRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}
