import { Search } from "lucide-react";

import { cn } from "@/utils/cn";

export function SearchInput({ className, onChange, placeholder = "Search…", value }) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{placeholder}</span>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="search" value={value} />
    </label>
  );
}
