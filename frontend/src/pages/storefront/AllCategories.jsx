import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getCategoryDirectory } from "@/api";
import { Button, Container, EmptyState, ErrorState, SearchInput, Skeleton } from "@/components";
import { categoryIcon } from "@/constants";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";

const D = EN.CATEGORY_DIR;

// Alibaba-style category directory: every industry with its sub-categories, counts and a jump list.
export function AllCategories() {
  useDocumentTitle(D.TITLE);
  const { data, error, loading, reload } = useAsync(getCategoryDirectory, []);
  const [query, setQuery] = useState("");
  const roots = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).map((r) => (r.name.toLowerCase().includes(q) ? r : { ...r, children: r.children.filter((c) => c.name.toLowerCase().includes(q)) })).filter((r) => r.name.toLowerCase().includes(q) || r.children.length);
  }, [data, query]);
  const leafCount = (data ?? []).reduce((n, r) => n + r.children.length, 0);

  return (
    <Container className="py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{D.TITLE}</h1>
          {data && <p className="mt-1 text-sm text-muted">{D.SUBTITLE(data.length, leafCount)}</p>}
        </div>
        <SearchInput className="w-full sm:w-80" onChange={setQuery} placeholder={D.SEARCH} value={query} />
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }, (_, i) => <Skeleton className="h-48 rounded-2xl" key={i} />)}</div>}

      {data && (
        <div className="mt-6 lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
          <nav aria-label={D.JUMP_TO} className="hidden lg:block">
            <ul className="sticky top-32 max-h-[calc(100vh-9rem)] space-y-0.5 overflow-y-auto rounded-2xl bg-white p-2 shadow-card">
              {(data ?? []).map((r) => {
                const Icon = categoryIcon(r.slug);
                return (
                  <li key={r.id}>
                    <a className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-ink hover:bg-brand-50 hover:text-brand-700" href={`#cat-${r.slug}`}>
                      <Icon aria-hidden className="size-4 shrink-0 text-brand-600" /><span className="truncate">{r.name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div>
            {roots.length === 0 && <EmptyState actionLabel={D.POST_CTA} actionTo={ROUTES.POST_REQUIREMENT} body={D.POST_HINT} title={D.NO_MATCH} />}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {roots.map((r) => {
                const Icon = categoryIcon(r.slug);
                return (
                  <section aria-labelledby={`h-${r.slug}`} className="scroll-mt-32 rounded-2xl bg-white p-5 shadow-card" id={`cat-${r.slug}`} key={r.id}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon aria-hidden className="size-6" /></span>
                      <div className="min-w-0">
                        <h2 className="font-semibold leading-snug" id={`h-${r.slug}`}><Link className="hover:text-brand-700 hover:underline" to={ROUTES.CATEGORY(r.slug)}>{r.name}</Link></h2>
                        <p className="text-xs text-muted">{r.productCount ? `${D.PRODUCTS(r.productCount)} · ${D.SUPPLIERS(r.supplierCount)}` : D.POST_HINT}</p>
                      </div>
                    </div>
                    <ul className="mt-4 space-y-1">
                      {r.children.map((c) => (
                        <li className="flex items-center justify-between gap-2 text-sm" key={c.id}>
                          <Link className="truncate text-ink hover:text-brand-700 hover:underline" to={ROUTES.CATEGORY(c.slug)}>{c.name}</Link>
                          {c.productCount
                            ? <span className="shrink-0 text-xs text-muted tabular">{c.productCount}</span>
                            : <Link className="shrink-0 text-xs font-medium text-amber-700 hover:underline" to={ROUTES.POST_REQUIREMENT}>{D.EMPTY_LEAF}</Link>}
                        </li>
                      ))}
                    </ul>
                    <Link className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.CATEGORY(r.slug)}>{D.VIEW_CATEGORY} →</Link>
                  </section>
                );
              })}
            </div>
            <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-brand-50 p-6 ring-1 ring-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">{D.POST_HINT}</p>
              <Button to={ROUTES.POST_REQUIREMENT} variant="accent"><ClipboardList aria-hidden className="size-4" />{D.POST_CTA}</Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
