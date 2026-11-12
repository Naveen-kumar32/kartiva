import { BadgeCheck, Building2, Clock, FileCheck2, MapPin, MessageSquareText, RotateCcw, Truck } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { getStoreWithProducts } from "@/api";
import { Container, EnquiryButton, ErrorState, KeyValue, PageLoader, ProductGrid, Rating, ReviewList, StoreAvatar, Tabs, VerifiedBadges } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { formatCurrency } from "@/utils/format";

const B = EN.BUYER_HUB.STORE;
const THIS_YEAR = new Date().getFullYear();
const maskGstin = (g) => (g && g.length === 15 ? `${g.slice(0, 7)}****${g.slice(-3)}` : g || "—");

function CompanyProfile({ store, verifiedDocuments }) {
  const years = store.yearEstablished ? Math.max(1, THIS_YEAR - store.yearEstablished) : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl bg-white p-5 shadow-card">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Building2 aria-hidden className="size-5 text-brand-600" />{B.COMPANY_DETAILS}</h2>
        <KeyValue items={[
          [EN.MARKET.BUSINESS_TYPE, store.businessType],
          [B.YEAR_ESTABLISHED, store.yearEstablished ? `${store.yearEstablished} (${EN.MARKET.YEARS_IN_BUSINESS(years)})` : null],
          [B.EMPLOYEES, store.employees],
          [B.TURNOVER, store.annualTurnover],
          [B.MAIN_MARKETS, store.mainMarkets?.join(", ")],
          [B.LOCATION, `${store.city}, ${store.state}`],
          [B.GSTIN, <span className="font-mono" key="g">{maskGstin(store.gstin)}</span>],
          [B.CONTACT_PERSON, store.contactPerson],
        ]} />
      </section>
      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><FileCheck2 aria-hidden className="size-5 text-brand-600" />{B.VERIFIED_DOCS}</h2>
          {verifiedDocuments.length ? (
            <ul className="space-y-2 text-sm">
              {verifiedDocuments.map((t) => <li className="flex items-center gap-2" key={t}><BadgeCheck aria-hidden className="size-4 text-emerald-600" />{B.DOC_TYPES[t] ?? t.replace(/_/g, " ")}</li>)}
            </ul>
          ) : <p className="text-sm text-muted">{B.NO_DOCS}</p>}
          <p className="mt-3 text-xs text-muted">{B.DOCS_NOTE}</p>
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="mb-3 font-semibold">{B.CERTIFICATIONS}</h2>
          {store.certifications?.length ? (
            <ul className="flex flex-wrap gap-2">{store.certifications.map((c) => <li className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium" key={c}>{c}</li>)}</ul>
          ) : <p className="text-sm text-muted">{B.NO_CERTIFICATIONS}</p>}
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Clock aria-hidden className="size-5 text-brand-600" />{B.RESPONSE}</h2>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold tabular">{store.responseRate != null ? `${store.responseRate}%` : "—"}</p><p className="text-xs text-muted">{B.RESPONSE_RATE}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold tabular">{store.responseHours != null ? B.HOURS(store.responseHours) : "—"}</p><p className="text-xs text-muted">{B.RESPONSE_TIME}</p></div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function StorePage() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync(() => getStoreWithProducts(slug), [slug]);
  const [tab, setTab] = useState("products");
  useDocumentTitle(data?.store.name);
  if (loading) return <PageLoader />;
  if (error) return <Container className="py-10"><ErrorState message={error} onRetry={reload} /></Container>;
  const { products, reviews = [], store, verifiedDocuments = [] } = data;
  const tabs = [
    { count: products.length, label: B.TAB_PRODUCTS, value: "products" },
    { label: B.TAB_PROFILE, value: "profile" },
    ...(reviews.length ? [{ count: store.ratingCount, label: B.TAB_REVIEWS, value: "reviews" }] : []),
  ];

  return (
    <>
      <div className="h-36 sm:h-48" style={{ background: store.banner }} />
      <Container>
        <div className="-mt-12 rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <StoreAvatar size="size-20 text-2xl" store={store} />
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">{store.name} {store.kycStatus === "verified" && <BadgeCheck aria-label={EN.COMMON.VERIFIED_SELLER} className="size-6 text-brand-600" />}</h1>
              <p className="text-muted">{store.tagline}</p>
              <VerifiedBadges className="mt-2" store={store} />
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span className="flex items-center gap-1"><MapPin aria-hidden className="size-4" />{store.city}, {store.state}</span>
                {store.businessType && <span>{store.businessType}</span>}
                <span>{EN.STORE.SELLING_SINCE(store.since)}</span>
                <span>{EN.MARKET.RESPONDS_IN(store.responseHours)}</span>
              </p>
            </div>
            <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
              <Rating count={store.ratingCount} value={store.rating} />
              <EnquiryButton store={store} variant="accent"><MessageSquareText className="size-4" />{EN.BUYER_HUB.SUPPLIER.CONTACT}</EnquiryButton>
            </div>
          </div>
          <div className="mt-5 grid gap-4 border-t border-line pt-5 md:grid-cols-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Truck aria-hidden className="size-4 text-brand-600" /> {EN.CHECKOUT.DELIVERY_METHOD}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {store.shippingMethods.map((m) => (
                  <li key={m.id}>{m.name} · {EN.COMMON.DAYS(m.minDays, m.maxDays)} · {m.fee === 0 ? EN.CART.FREE : formatCurrency(m.fee)}{m.freeAbove ? ` (${EN.PRODUCT.FREE_ABOVE(formatCurrency(m.freeAbove))})` : ""}{m.codAllowed ? " · COD" : ""}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><RotateCcw aria-hidden className="size-4 text-brand-600" /> {EN.STORE.RETURN_POLICY}</p>
              <p className="mt-2 text-sm text-muted">{store.returnPolicy}</p>
            </div>
          </div>
        </div>
        <Tabs className="mt-6" onChange={setTab} tabs={tabs} value={tab} />
        <div className="mt-6">
          {tab === "products" && <ProductGrid products={products} />}
          {tab === "profile" && <CompanyProfile store={store} verifiedDocuments={verifiedDocuments} />}
          {tab === "reviews" && (
            <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
              <ReviewList rating={store.rating} reviewCount={store.ratingCount} reviews={reviews} />
            </section>
          )}
        </div>
      </Container>
    </>
  );
}
