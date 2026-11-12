import { BadgeCheck, ClipboardList, FileSpreadsheet, LayoutGrid, RotateCcw, ShieldCheck, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

import { getHome } from "@/api";
import { AdSlot, Button, Container, ErrorState, ProductGridSkeleton, ProductRail, SectionHeader, StoreCard } from "@/components";
import { AD_SLOT_KEYS, categoryIcon } from "@/constants";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";

const TRUST_ICONS = [BadgeCheck, Wallet, RotateCcw, ShieldCheck];
const HB = EN.BUYER_HUB.HOME_BANNER;

export function Home() {
  useDocumentTitle();
  const { data, error, loading, reload } = useAsync(getHome, []);

  return (
    <Container className="space-y-10 pt-4 sm:pt-6">
      <AdSlot slotKey={AD_SLOT_KEYS.HOME_HERO_CAROUSEL} variant="carousel" />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {EN.HOME.TRUST.map((t, i) => {
          const Icon = TRUST_ICONS[i];
          return (
            <li className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card sm:p-4" key={t.title}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon aria-hidden className="size-5" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="block truncate text-xs text-muted">{t.body}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {error && <ErrorState message={error} onRetry={reload} />}

      <section>
        <SectionHeader action={EN.HOME.VIEW_ALL_CATEGORIES} title={EN.HOME.CATEGORIES_FOR_YOU} to={ROUTES.CATEGORIES} />
        <div className="scrollbar-none -mx-4 grid grid-flow-col grid-rows-2 gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid-flow-row sm:grid-cols-4 sm:grid-rows-none sm:px-0 md:grid-cols-6 lg:grid-cols-8">
          {(data?.rootCategories ?? []).slice(0, 23).map((c) => {
            const Icon = categoryIcon(c.slug);
            return (
              <Link className="group flex w-24 flex-col items-center gap-2 rounded-xl bg-white p-3 text-center shadow-card transition hover:shadow-raised sm:w-auto" key={c.slug} to={ROUTES.CATEGORY(c.slug)}>
                <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700 transition group-hover:scale-110 group-hover:bg-brand-100"><Icon aria-hidden className="size-6" /></span>
                <span className="line-clamp-2 text-xs font-medium leading-snug">{c.name}</span>
              </Link>
            );
          })}
          <Link className="flex w-24 flex-col items-center justify-center gap-2 rounded-xl bg-brand-700 p-3 text-center text-white shadow-card transition hover:bg-brand-800 sm:w-auto" to={ROUTES.CATEGORIES}>
            <span className="grid size-12 place-items-center rounded-full bg-white/15"><LayoutGrid aria-hidden className="size-6" /></span>
            <span className="text-xs font-semibold leading-snug">{EN.HOME.VIEW_ALL_CATEGORIES}</span>
          </Link>
        </div>
      </section>

      {data?.showBuyRequestBanner && (
        <section className="grid items-center gap-6 overflow-hidden rounded-2xl bg-gradient-to-r from-amber-50 to-brand-50 p-6 ring-1 ring-amber-100 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{HB.EYEBROW}</p>
            <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{HB.TITLE}</h2>
            <p className="mt-2 max-w-xl text-muted">{HB.BODY}</p>
            <Button className="mt-5" size="lg" to={ROUTES.POST_REQUIREMENT} variant="accent"><ClipboardList className="size-5" />{HB.CTA}</Button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {HB.POINTS.map((point, i) => {
              const Icon = [ClipboardList, Users, FileSpreadsheet][i];
              return (
                <li className="flex items-center gap-3 rounded-xl bg-white/80 p-3 text-sm shadow-sm" key={point}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon aria-hidden className="size-4" /></span>{point}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <SectionHeader title={EN.HOME.FEATURED} to={ROUTES.SEARCH("")} />
        {loading ? <ProductGridSkeleton count={6} /> : <ProductRail products={data?.featuredProducts ?? []} />}
      </section>

      <AdSlot slotKey={AD_SLOT_KEYS.HOME_MID_BANNER} />

      <section>
        <SectionHeader title={EN.HOME.TRENDING} to={`${ROUTES.SEARCH("")}&sort=popular`} />
        {loading ? <ProductGridSkeleton count={6} /> : <ProductRail products={data?.trendingProducts ?? []} />}
      </section>

      <AdSlot slotKey={AD_SLOT_KEYS.HOME_SPONSORED_ROW} />

      <section>
        <SectionHeader title={EN.HOME.NEW_ARRIVALS} to={`${ROUTES.SEARCH("")}&sort=newest`} />
        {loading ? <ProductGridSkeleton count={6} /> : <ProductRail products={data?.newArrivals ?? []} />}
      </section>

      <section>
        <SectionHeader title={EN.HOME.FEATURED_STORES} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(data?.featuredStores ?? []).map((s) => <StoreCard key={s.slug} store={s} />)}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl bg-brand-800 px-6 py-10 text-white sm:px-12">
        <span aria-hidden className="absolute -right-20 -top-20 size-72 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="relative max-w-xl">
          <h2 className="text-2xl font-extrabold sm:text-3xl">{EN.HOME.SELL_TITLE}</h2>
          <p className="mt-2 text-white/80">{EN.HOME.SELL_BODY}</p>
          <Button className="mt-6" size="lg" to={ROUTES.SELL} variant="accent">{EN.HOME.SELL_CTA}</Button>
        </div>
      </section>
    </Container>
  );
}
