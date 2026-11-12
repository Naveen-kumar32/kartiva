import { ChevronRight, ClipboardList, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { categoryIcon } from "@/constants";
import { CATEGORIES } from "@/data";
import { EN, ROUTES } from "@/locales";
import { cn } from "@/utils/cn";

// Read on every render: admins can add, hide, reorder and pin categories to the top menu at runtime.
const active = (c) => c.isActive !== false;
const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
const childrenOf = (id) => CATEGORIES.filter((c) => c.parentId === id && active(c)).sort(bySort);

// Alibaba-style bar: "All categories" mega menu (every industry) + a few pinned categories (showInNav).
export function CategoryBar() {
  const roots = CATEGORIES.filter((c) => !c.parentId && active(c)).sort(bySort);
  const pinned = roots.filter((c) => c.showInNav).slice(0, 8);
  const [megaOpen, setMegaOpen] = useState(false);
  const [hoverId, setHoverId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const ref = useRef(null);
  const current = roots.find((r) => r.id === hoverId) ?? roots[0];

  useEffect(() => {
    if (!megaOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMegaOpen(false);
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setMegaOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [megaOpen]);

  return (
    <nav aria-label={EN.NAV.ALL_CATEGORIES} className="hidden border-t border-white/10 bg-brand-800 md:block">
      <ul className="relative mx-auto flex max-w-[1440px] items-center gap-1 px-4 sm:px-6 lg:px-8" ref={ref}>
        <li onMouseLeave={() => setMegaOpen(false)}>
          <button
            aria-expanded={megaOpen}
            className={cn("flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-white hover:bg-white/10", megaOpen && "bg-white/15")}
            onClick={() => setMegaOpen(true)}
            onMouseEnter={() => setMegaOpen(true)}
            type="button"
          >
            <LayoutGrid aria-hidden className="size-4" />{EN.NAV.ALL_CATEGORIES}
          </button>
          {megaOpen && current && (
            <div className="absolute left-4 right-4 top-full z-50 grid h-[min(34rem,calc(100vh-9rem))] grid-cols-[17rem_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-b-2xl border border-line bg-white text-ink shadow-raised sm:left-6 sm:right-6 lg:left-8 lg:right-8" onClick={(e) => e.target.closest("a") && setMegaOpen(false)}>
              <ul className="overflow-y-auto border-r border-line bg-slate-50 py-2">
                {roots.map((r) => {
                  const Icon = categoryIcon(r.slug);
                  return (
                    <li key={r.id}>
                      <Link
                        className={cn("flex items-center gap-2.5 px-4 py-2 text-sm", r.id === current.id ? "bg-white font-semibold text-brand-700" : "hover:bg-white")}
                        onFocus={() => setHoverId(r.id)}
                        onMouseEnter={() => setHoverId(r.id)}
                        to={ROUTES.CATEGORY(r.slug)}
                      >
                        <Icon aria-hidden className="size-4 shrink-0 text-brand-600" /><span className="flex-1 truncate">{r.name}</span><ChevronRight aria-hidden className="size-3.5 text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="overflow-y-auto p-6">
                <div className="flex items-center justify-between gap-4">
                  <Link className="text-lg font-bold hover:text-brand-700" to={ROUTES.CATEGORY(current.slug)}>{current.name}</Link>
                  <Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.CATEGORIES}>{EN.NAV.BROWSE_ALL(roots.length)} →</Link>
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                  {childrenOf(current.id).map((c) => (
                    <li key={c.id}>
                      <Link className="flex h-full items-center rounded-xl border border-line px-3 py-3 text-sm font-medium hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700" to={ROUTES.CATEGORY(c.slug)}>{c.name}</Link>
                    </li>
                  ))}
                </ul>
                <Link className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100" to={ROUTES.POST_REQUIREMENT}>
                  <ClipboardList aria-hidden className="size-4" />{EN.CATEGORY_DIR.POST_HINT}
                </Link>
              </div>
            </div>
          )}
        </li>
        {pinned.map((root) => (
          <li className="relative" key={root.id} onMouseEnter={() => setOpenId(root.id)} onMouseLeave={() => setOpenId(null)}>
            <NavLink
              className={({ isActive }) => cn("block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white", isActive && "bg-white/10 text-white")}
              onFocus={() => setOpenId(root.id)}
              to={ROUTES.CATEGORY(root.slug)}
            >
              {root.shortName || root.name}
            </NavLink>
            {openId === root.id && (
              <div className="absolute left-0 top-full z-40 w-64 rounded-xl border border-line bg-white p-2 shadow-raised">
                {childrenOf(root.id).map((c) => (
                  <Link className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-brand-50 hover:text-brand-700" key={c.id} onClick={() => setOpenId(null)} to={ROUTES.CATEGORY(c.slug)}>
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
        <li className="ml-auto">
          <Link aria-label={EN.BUYER_HUB.NAV.POST_REQUIREMENT} className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-white hover:bg-white/10" title={EN.BUYER_HUB.NAV.POST_REQUIREMENT} to={ROUTES.POST_REQUIREMENT}>
            <ClipboardList aria-hidden className="size-4" /><span className="hidden 2xl:inline">{EN.BUYER_HUB.NAV.POST_REQUIREMENT}</span>
          </Link>
        </li>
        <li>
          <Link className="block whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-accent-400 hover:bg-white/10" to={ROUTES.SELL}>{EN.NAV.SELL}</Link>
        </li>
      </ul>
    </nav>
  );
}
