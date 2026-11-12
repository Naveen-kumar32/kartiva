import { ArrowDownRight, ArrowUpRight, Eye, IndianRupee, Info, MousePointerClick, Search, ShoppingBag, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { getSellerAnalytics } from "@/api";
import {
  ColumnChart, DataTable, EmptyState, ErrorState, PageHeader, PageLoader, Panel, ShareBars, SmartImage, StatCard,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, formatCompactInr, formatCurrency, formatNumber, formatPercent } from "@/utils";

const P = EN.SELLER_PRO;
const A = P.ANALYTICS;
const RANGES = [7, 30, 90];

function Delta({ current, previous }) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-emerald-700" : "text-red-600")}>
      {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}{formatPercent(Math.abs(pct), 0)} {A.VS_PREV}
    </span>
  );
}

function Funnel({ steps }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span>{s.label}</span>
            <span className="tabular"><b>{formatNumber(s.value)}</b>{i > 0 && <span className="ml-2 text-xs text-muted">{formatPercent(steps[i - 1].value ? (s.value / steps[i - 1].value) * 100 : 0)}</span>}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ background: i === steps.length - 1 ? "#eb6834" : "#14a397", width: `${Math.max(s.value ? 1.5 : 0, (s.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SellerAnalytics() {
  useDocumentTitle(EN.SELLER.NAV_ANALYTICS);
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAsync(() => getSellerAnalytics(user.storeSlug, days), [user.storeSlug, days]);

  const rangePicker = (
    <div aria-label={A.RANGE} className="flex rounded-lg bg-white p-0.5 text-sm shadow-card" role="group">
      {RANGES.map((d) => (
        <button aria-pressed={days === d} className={cn("rounded-md px-3 py-1.5 font-medium", days === d ? "bg-brand-600 text-white" : "text-muted hover:text-ink")} key={d} onClick={() => setDays(d)} type="button">{A.DAYS(d)}</button>
      ))}
    </div>
  );

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { customers, funnel, keywords, kpis, leadFunnel, revenueSeries, salesByState, topProducts } = data;
  const totalCustomers = customers.new + customers.repeat;

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      <PageHeader actions={rangePicker} subtitle={A.SUBTITLE(days)} title={EN.SELLER.NAV_ANALYTICS} />
      <p className="flex gap-2 rounded-xl bg-sky-50 px-4 py-2.5 text-xs text-sky-900 ring-1 ring-sky-100"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{P.COMMON.SAMPLE_DATA}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard hint={<Delta current={kpis.revenue} previous={kpis.prevRevenue} />} icon={IndianRupee} label={A.REVENUE} value={formatCompactInr(kpis.revenue)} />
        <StatCard hint={<Delta current={kpis.orders} previous={kpis.prevOrders} />} icon={ShoppingBag} label={A.ORDERS} tone="info" value={formatNumber(kpis.orders)} />
        <StatCard hint={A.SAMPLE} icon={Eye} label={A.STORE_VIEWS} tone="accent" value={formatNumber(funnel.storeViews)} />
        <StatCard hint={A.AOV(formatCurrency(kpis.aov))} icon={MousePointerClick} label={A.CONVERSION} tone="warning" value={formatPercent(kpis.conversion, 2)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title={days === 7 ? A.REVENUE_BY_DAY : A.REVENUE_BY_WEEK}>
          {kpis.revenue > 0
            ? <ColumnChart labels={revenueSeries.map((w) => w.label)} series={[{ name: A.REVENUE, values: revenueSeries.map((w) => w.value) }]} />
            : <p className="grid h-48 place-items-center rounded-xl bg-slate-50 text-sm text-muted">{A.NO_SALES}</p>}
        </Panel>
        <Panel title={A.FUNNEL}>
          <Funnel steps={[
            { label: A.PRODUCT_VIEWS, value: funnel.productViews }, { label: A.ADD_TO_CART, value: funnel.addToCarts },
            { label: A.CHECKOUTS, value: funnel.checkouts }, { label: A.ORDERS, value: funnel.orders },
          ]}
          />
          <p className="mt-3 text-xs text-muted">{A.FUNNEL_NOTE}</p>
        </Panel>
      </div>

      <Panel title={A.TOP_PRODUCTS}>
        {topProducts.length === 0 ? <EmptyState body={A.NO_PRODUCTS_BODY} icon={ShoppingCart} title={A.NO_PRODUCTS} /> : (
          <DataTable
            columns={[
              { header: EN.SELLER.PRODUCT, key: "name", render: (p) => <span className="flex items-center gap-3"><SmartImage alt="" className="size-9 shrink-0 rounded-md bg-slate-50 object-contain" src={p.thumbnail} /><span className="line-clamp-1 font-medium">{p.name}</span></span> },
              { align: "right", header: A.VIEWS, key: "views", render: (p) => formatNumber(p.views) },
              { align: "right", header: A.ORDERS, key: "orders", render: (p) => formatNumber(p.orders) },
              { align: "right", header: A.UNITS, key: "units", render: (p) => formatNumber(p.units) },
              { align: "right", header: A.REVENUE, key: "revenue", render: (p) => formatCurrency(p.revenue) },
              { align: "right", header: A.CONVERSION, key: "conversion", render: (p) => formatPercent(p.conversion) },
            ]}
            rows={topProducts}
          />
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title={A.SALES_BY_STATE}>
          {salesByState.length === 0 ? <p className="text-sm text-muted">{A.NO_SALES}</p> : <ShareBars items={salesByState} />}
        </Panel>
        <Panel title={A.CUSTOMERS}>
          {totalCustomers === 0 ? <p className="text-sm text-muted">{A.NO_SALES}</p> : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                <span className="h-full bg-[#14a397]" style={{ width: `${(customers.new / totalCustomers) * 100}%` }} />
                <span className="h-full border-l-2 border-white bg-[#eb6834]" style={{ width: `${(customers.repeat / totalCustomers) * 100}%` }} />
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-[#14a397]" />{A.NEW_CUSTOMERS}</span><b className="tabular">{customers.new}</b></li>
                <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-[#eb6834]" />{A.REPEAT_CUSTOMERS}</span><b className="tabular">{customers.repeat}</b></li>
              </ul>
            </>
          )}
        </Panel>
        <Panel title={A.LEAD_FUNNEL}>
          <Funnel steps={[{ label: A.ENQUIRIES, value: leadFunnel.enquiries }, { label: A.QUOTED, value: leadFunnel.quoted }, { label: A.WON, value: leadFunnel.won }]} />
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">{A.AVG_RESPONSE}: <b>{P.COMMON.HOURS(leadFunnel.avgResponseHours)}</b></p>
        </Panel>
      </div>

      <Panel title={A.KEYWORDS}>
        {keywords.length === 0 ? <p className="text-sm text-muted">{A.NO_KEYWORDS}</p> : (
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {keywords.map((k) => (
              <li className="flex items-center gap-3 border-b border-line py-2 text-sm" key={k.keyword}>
                <Search aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{k.keyword}</span>
                <span className="whitespace-nowrap tabular text-muted">{A.SEARCHES(formatNumber(k.searches))}</span>
                <span className="w-20 shrink-0 whitespace-nowrap text-right tabular">{A.CLICKS(formatNumber(k.clicks))}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
