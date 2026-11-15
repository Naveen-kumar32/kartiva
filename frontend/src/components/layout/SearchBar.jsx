import { CornerDownLeft, Search, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { categoryNames, isPublicProduct } from "@/api";
import { CATEGORIES, PLATFORM, PRODUCTS } from "@/data";
import { useDebounce } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { getStore } from "@/utils/catalog";
import { cn } from "@/utils/cn";
import { createSearcher, editDistance, normalize } from "@/utils/smartSearch";

// Suggestions use the same smart search as the results page: typos, sound-alikes and Tamil / Tanglish / Hindi words.
function useSuggestions(term) {
  const searcher = useMemo(
    () => createSearcher(PRODUCTS.filter(isPublicProduct).map((p) => ({ ...p, store: getStore(p.storeSlug) })), { categoryNames, customWords: PLATFORM.searchWords }),
    // the catalogue arrays are refreshed in place — rebuild when their size or the admin's word list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [PRODUCTS.length, PLATFORM.searchWords],
  );
  return useMemo(() => {
    const q = term.trim();
    if (q.length < 2) return { corrected: null, items: [] };
    const found = searcher.search(q);
    const words = normalize(found.corrected ?? q).split(" ");
    const cats = CATEGORIES.filter((c) => c.parentId && c.isActive !== false && normalize(c.name).split(" ").some((w) => words.some((t) => t.length > 2 && (w.startsWith(t) || editDistance(t, w, 1) <= 1))))
      .slice(0, 2).map((c) => ({ label: c.name, to: ROUTES.CATEGORY(c.slug), type: EN.NAV.SUGGEST_CATEGORY }));
    const prods = found.mode === "related" ? [] : [...found.results].sort((a, b) => b.score - a.score).slice(0, 6)
      .map(({ p }) => ({ label: p.name, to: ROUTES.PRODUCT(p.slug), type: p.brand }));
    return { corrected: found.corrected, items: [...cats, ...prods] };
  }, [searcher, term]);
}

export function SearchBar({ className }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(location.pathname === ROUTES.SEARCH_PATTERN ? params.get("q") ?? "" : "");
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(q, 150);
  const boxRef = useRef(null);
  const { corrected, items } = useSuggestions(debounced);

  const go = (to) => { setOpen(false); navigate(to); };
  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) go(ROUTES.SEARCH(q.trim()));
  };
  const showList = open && debounced.trim().length >= 2;

  return (
    <form className={cn("relative", className)} onSubmit={submit} ref={boxRef} role="search">
      <label className="sr-only" htmlFor="site-search">{EN.NAV.SEARCH}</label>
      <input
        autoComplete="off"
        className="h-11 w-full rounded-xl border-2 border-transparent bg-white pl-4 pr-12 text-sm text-ink shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none"
        id="site-search"
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={EN.NAV.SEARCH_PLACEHOLDER}
        type="search"
        value={q}
      />
      <button aria-label={EN.NAV.SEARCH} className="absolute right-1 top-1 grid h-9 w-10 place-items-center rounded-lg bg-accent-500 text-ink hover:bg-accent-400" type="submit">
        <Search className="size-5" />
      </button>
      {showList && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-line bg-white py-1 text-ink shadow-raised" role="listbox">
          {corrected && (
            <li role="option">
              <button className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50" onMouseDown={() => { setQ(corrected); go(ROUTES.SEARCH(corrected)); }} type="button">
                <Sparkles aria-hidden className="size-4 shrink-0" />
                <span className="flex-1 truncate">{EN.NAV.DID_YOU_MEAN(corrected)}</span>
              </button>
            </li>
          )}
          {items.map((s) => (
            <li key={s.to} role="option">
              <button className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-brand-50" onMouseDown={() => go(s.to)} type="button">
                <Search aria-hidden className="size-4 shrink-0 text-slate-400" />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="shrink-0 text-xs text-muted">{s.type}</span>
              </button>
            </li>
          ))}
          <li role="option">
            <button className="flex w-full items-center gap-3 border-t border-line px-4 py-2 text-left text-sm text-muted hover:bg-brand-50" onMouseDown={() => go(ROUTES.SEARCH(debounced.trim()))} type="button">
              <CornerDownLeft aria-hidden className="size-4 shrink-0" />
              <span className="flex-1 truncate">{EN.NAV.SEARCH_ALL(debounced.trim())}</span>
            </button>
          </li>
        </ul>
      )}
    </form>
  );
}
