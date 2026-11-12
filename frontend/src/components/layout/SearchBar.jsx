import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { isPublicProduct } from "@/api";
import { CATEGORIES, PRODUCTS } from "@/data";
import { useDebounce } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn } from "@/utils/cn";

export function SearchBar({ className }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(location.pathname === ROUTES.SEARCH_PATTERN ? params.get("q") ?? "" : "");
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(q, 150);
  const boxRef = useRef(null);


  const suggestions = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term.length < 2) return [];
    const cats = CATEGORIES.filter((c) => c.parentId && c.isActive !== false && c.name.toLowerCase().includes(term)).slice(0, 2).map((c) => ({ label: c.name, to: ROUTES.CATEGORY(c.slug), type: "Category" }));
    const prods = PRODUCTS.filter((p) => isPublicProduct(p) && (p.name.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term))).slice(0, 6).map((p) => ({ label: p.name, to: ROUTES.PRODUCT(p.slug), type: p.brand }));
    return [...cats, ...prods];
  }, [debounced]);

  const submit = (e) => {
    e.preventDefault();
    setOpen(false);
    navigate(ROUTES.SEARCH(q.trim()));
  };

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
      {open && suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-line bg-white py-1 text-ink shadow-raised" role="listbox">
          {suggestions.map((s) => (
            <li key={s.to} role="option">
              <button className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-brand-50" onMouseDown={() => navigate(s.to)} type="button">
                <Search aria-hidden className="size-4 shrink-0 text-slate-400" />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="shrink-0 text-xs text-muted">{s.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
