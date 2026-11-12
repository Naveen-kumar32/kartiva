import { ClipboardList, SearchX, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { getProducts, getSlotAds } from "@/api";
import {
  AdSlot, Breadcrumbs, Button, Container, Drawer, EmptyState, ErrorState, FilterPanel, Pagination, ProductGrid, ProductGridSkeleton, SortSelect,
} from "@/components";
import { AD_SLOT_KEYS } from "@/constants";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { categoryTrail, getCategory } from "@/utils/catalog";

// URL is the source of truth for filters, so results are shareable and survive refresh.
function readFilters(params) {
  const attrs = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith("attr.")) attrs[key.slice(5)] = value.split(",");
  }
  const list = (k) => params.get(k)?.split(",").filter(Boolean) ?? [];
  return {
    attrs, brands: list("brand"), bulk: params.get("bulk") === "1" || undefined, businessTypes: list("btype"), inStock: params.get("in_stock") === "1" || undefined,
    maxPrice: params.get("max_price") ?? undefined, minPrice: params.get("min_price") ?? undefined,
    minRating: params.get("min_rating") ?? undefined, page: Number(params.get("page") ?? 1),
    premium: params.get("premium") === "1" || undefined, q: params.get("q") ?? "", sellers: list("seller"), sort: params.get("sort") ?? "relevance",
    verified: params.get("verified") === "1" || undefined,
  };
}

function writeFilters(filters) {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.sort && filters.sort !== "relevance") p.set("sort", filters.sort);
  if (filters.brands?.length) p.set("brand", filters.brands.join(","));
  if (filters.sellers?.length) p.set("seller", filters.sellers.join(","));
  if (filters.minPrice) p.set("min_price", filters.minPrice);
  if (filters.maxPrice) p.set("max_price", filters.maxPrice);
  if (filters.minRating) p.set("min_rating", filters.minRating);
  if (filters.inStock) p.set("in_stock", "1");
  if (filters.businessTypes?.length) p.set("btype", filters.businessTypes.join(","));
  if (filters.verified) p.set("verified", "1");
  if (filters.premium) p.set("premium", "1");
  if (filters.bulk) p.set("bulk", "1");
  Object.entries(filters.attrs ?? {}).forEach(([k, v]) => v?.length && p.set(`attr.${k}`, v.join(",")));
  if (filters.page > 1) p.set("page", filters.page);
  return p;
}

export function Listing() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = useMemo(() => readFilters(params), [params]);
  const category = slug ? getCategory(slug) : null;
  const hasFilters = [...params.keys()].some((k) => !["page", "sort"].includes(k));
  const title = category?.name ?? (filters.q ? EN.LISTING.RESULTS_FOR(filters.q) : EN.LISTING.ALL_PRODUCTS);
  useDocumentTitle(title);

  const { data, error, loading, reload } = useAsync(() => getProducts({ ...filters, category: slug }), [slug, params.toString()]);
  const { data: sponsored } = useAsync(() => getSlotAds(AD_SLOT_KEYS.LISTING_SPONSORED, { categorySlug: slug, query: filters.q }), [slug, filters.q]);

  const update = (patch) => setParams(writeFilters({ ...filters, ...patch, page: patch.page ?? 1 }));
  const clear = () => setParams(writeFilters({ q: filters.q, sort: filters.sort }));
  const sponsoredProducts = filters.page === 1 ? (sponsored?.items ?? []).map((a) => a.product).filter(Boolean) : [];

  const crumbs = [{ label: EN.COMMON.HOME, to: ROUTES.HOME }, ...(category ? categoryTrail(slug).map((c) => ({ label: c.name, to: ROUTES.CATEGORY(c.slug) })) : [{ label: title }])];
  const panel = <FilterPanel facets={data?.facets} filters={filters} onChange={update} onClear={clear} />;

  return (
    <Container className="pt-4 sm:pt-6">
      <Breadcrumbs items={crumbs} />
      <AdSlot className="mb-6" slotKey={AD_SLOT_KEYS.LISTING_TOP_BANNER} />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="rounded-2xl bg-white p-4 shadow-card">{panel}</div>
          <AdSlot className="mt-6" slotKey={AD_SLOT_KEYS.LISTING_SIDEBAR} variant="tall" />
        </aside>
        <section aria-labelledby="listing-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl" id="listing-title">{title}</h1>
              {data && <p className="text-sm text-muted">{EN.LISTING.RESULTS(data.count)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button className="lg:hidden" onClick={() => setFiltersOpen(true)} size="sm" variant="outline"><SlidersHorizontal className="size-4" />{EN.LISTING.FILTERS}</Button>
              <SortSelect onChange={(sort) => update({ sort })} value={filters.sort} />
            </div>
          </div>
          {error && <ErrorState message={error} onRetry={reload} />}
          {loading && <ProductGridSkeleton count={12} />}
          {!loading && data?.count === 0 && category && !hasFilters && (
            <EmptyState actionLabel={EN.BUYER_HUB.NAV.POST_REQUIREMENT} actionTo={ROUTES.POST_REQUIREMENT} body={EN.LISTING.EMPTY_CATEGORY_BODY} icon={ClipboardList} title={EN.LISTING.EMPTY_CATEGORY_TITLE(category.name)} />
          )}
          {!loading && data?.count === 0 && (!category || hasFilters) && (
            <>
              <EmptyState actionLabel={EN.LISTING.CLEAR_ALL} body={EN.LISTING.NO_RESULTS_BODY} icon={SearchX} onAction={clear} title={EN.LISTING.NO_RESULTS_TITLE} />
              <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-brand-900">{EN.BUYER_HUB.RFQ.LISTING_EMPTY_TITLE}</p>
                  <p className="text-sm text-brand-800/80">{EN.BUYER_HUB.RFQ.LISTING_EMPTY_BODY}</p>
                </div>
                <Button to={ROUTES.POST_REQUIREMENT}><ClipboardList className="size-4" />{EN.BUYER_HUB.NAV.POST_REQUIREMENT}</Button>
              </div>
            </>
          )}
          {!loading && data?.count > 0 && (
            <>
              <ProductGrid products={data.results} sponsored={sponsoredProducts} />
              <Pagination onChange={(page) => update({ page })} page={data.page} pageCount={data.pageCount} />
            </>
          )}
        </section>
      </div>
      <Drawer onClose={() => setFiltersOpen(false)} open={filtersOpen} side="bottom" title={EN.LISTING.FILTERS}>
        <div className="p-4">{panel}</div>
        <div className="sticky bottom-0 border-t border-line bg-white p-4">
          <Button fullWidth onClick={() => setFiltersOpen(false)}>{EN.LISTING.APPLY}{data ? ` (${data.count})` : ""}</Button>
        </div>
      </Drawer>
    </Container>
  );
}
