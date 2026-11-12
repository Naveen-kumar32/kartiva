import { ChevronLeft, ChevronRight } from "lucide-react";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";

export function Pagination({ onChange, page, pageCount }) {
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <nav aria-label={EN.COMMON.PAGINATION} className="mt-8 flex items-center justify-center gap-1">
      <button aria-label={EN.COMMON.PREVIOUS} className="grid size-9 place-items-center rounded-lg border border-line bg-white disabled:opacity-40" disabled={page === 1} onClick={() => onChange(page - 1)} type="button">
        <ChevronLeft className="size-4" />
      </button>
      {pages.map((p, i) => (
        <span className="flex items-center gap-1" key={p}>
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
          <button
            aria-current={p === page ? "page" : undefined}
            className={cn("size-9 rounded-lg text-sm font-semibold tabular", p === page ? "bg-brand-600 text-white" : "border border-line bg-white hover:border-brand-500")}
            onClick={() => onChange(p)}
            type="button"
          >
            {p}
          </button>
        </span>
      ))}
      <button aria-label={EN.COMMON.NEXT} className="grid size-9 place-items-center rounded-lg border border-line bg-white disabled:opacity-40" disabled={page === pageCount} onClick={() => onChange(page + 1)} type="button">
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}
