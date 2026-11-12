import { ArrowRight, BadgeIndianRupee, Boxes, ClipboardList, Crown, Inbox, LifeBuoy, Megaphone, ShieldCheck, ShoppingBag, Store, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { getAdminDashboard, getGrowthSummary } from "@/api";
import { ColumnChart, DataTable, ErrorState, PageHeader, PageLoader, Panel, ShareBars, StatCard, StoreAvatar } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { formatCompactInr, formatCurrency, formatDateTime, formatNumber } from "@/utils/format";

const A = EN.ADMIN;
const T = EN.ADMIN_TOOLS;
const G = EN.ADMIN_PRO.DASHBOARD;
const load = async () => {
  const [dash, growth] = await Promise.all([getAdminDashboard(), getGrowthSummary()]);
  return { ...dash, growth };
};

export function AdminDashboard() {
  useDocumentTitle(A.DASHBOARD);
  const { data, error, loading, reload } = useAsync(load, []);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { alerts, kpis } = data;

  const actionItems = [
    [alerts.pendingSellers, T.ALERT_SELLERS, ROUTES.ADMIN.SELLERS],
    [alerts.pendingProducts, T.ALERT_PRODUCTS, ROUTES.ADMIN.PRODUCTS],
    [alerts.pendingAds, T.ALERT_ADS, ROUTES.ADMIN.ADS],
    [alerts.escalatedReturns, T.ALERT_RETURNS, ROUTES.ADMIN.RETURNS],
    [alerts.codRefunds, T.ALERT_COD_REFUNDS, ROUTES.ADMIN.RETURNS],
    [alerts.settlementsToPay, T.ALERT_SETTLEMENTS, ROUTES.ADMIN.SETTLEMENTS],
    [alerts.lowStockVariants, T.ALERT_OUT_OF_STOCK, ROUTES.ADMIN.PRODUCTS],
  ];

  return (
    <div className="space-y-6">
      <PageHeader subtitle={T.DASHBOARD_SUBTITLE} title={A.DASHBOARD} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard hint={T.AOV(formatCurrency(kpis.aov))} icon={ShoppingBag} label={T.GMV_30} value={formatCompactInr(kpis.gmv)} />
        <StatCard hint={T.ORDERS_30(formatNumber(kpis.orders))} icon={BadgeIndianRupee} label={T.COMMISSION_30} tone="info" value={formatCompactInr(kpis.commissionRevenue)} />
        <StatCard hint={T.AD_REVENUE_HINT} icon={Megaphone} label={T.AD_REVENUE} tone="accent" value={formatCompactInr(kpis.adRevenue)} />
        <StatCard hint={T.MARKETPLACE_HINT(kpis.liveProducts, kpis.buyers)} icon={Store} label={T.ACTIVE_SELLERS} tone="warning" value={kpis.activeSellers} />
      </div>

      <section aria-label={T.NEEDS_ATTENTION}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{T.NEEDS_ATTENTION}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {actionItems.map(([count, label, to]) => (
            <Link className={`group rounded-xl p-4 shadow-card transition hover:shadow-raised ${count ? "bg-white" : "bg-white/60"}`} key={label} to={to}>
              <p className={`text-2xl font-bold tabular ${count ? "text-ink" : "text-slate-400"}`}>{count}</p>
              <p className="mt-1 flex items-center justify-between gap-1 text-xs text-muted">{label}<ArrowRight aria-hidden className="size-3.5 opacity-0 transition group-hover:opacity-100" /></p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label={G.TITLE}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{G.TITLE}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            [ShieldCheck, data.growth.pendingKyc, G.PENDING_KYC, null, ROUTES.ADMIN.VERIFICATION],
            [LifeBuoy, data.growth.openTickets, G.OPEN_TICKETS, data.growth.overdueTickets ? G.OVERDUE(data.growth.overdueTickets) : null, ROUTES.ADMIN.SUPPORT],
            [Inbox, data.growth.leadsToday, G.LEADS_TODAY, null, ROUTES.ADMIN.LEADS],
            [ClipboardList, data.growth.openRfqs, G.OPEN_RFQS, null, ROUTES.ADMIN.LEADS],
            [Crown, formatCompactInr(data.growth.arr), G.ARR, null, ROUTES.ADMIN.PLANS],
          ].map(([Icon, value, label, alert, to]) => (
            <Link className="group rounded-xl bg-white p-4 shadow-card transition hover:shadow-raised" key={label} to={to}>
              <span className="flex items-center justify-between gap-2"><Icon aria-hidden className="size-5 text-brand-600" /><ArrowRight aria-hidden className="size-3.5 text-muted opacity-0 transition group-hover:opacity-100" /></span>
              <p className="mt-2 text-2xl font-bold tabular">{value}</p>
              <p className="text-xs text-muted">{label}</p>
              {alert && <p className="mt-1 text-xs font-semibold text-red-600">{alert}</p>}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title={T.REVENUE_WEEKLY}>
          <ColumnChart labels={data.revenueByWeek.map((w) => w.label)} series={[{ name: A.COMMISSION, values: data.revenueByWeek.map((w) => w.commission) }, { name: A.SERIES_ADS, values: data.revenueByWeek.map((w) => w.ads) }]} />
        </Panel>
        <div className="space-y-6">
          <Panel title={A.PAYMENT_MIX}><ShareBars items={data.paymentMix} /></Panel>
          <Panel action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.ADMIN.AUDIT}>{EN.COMMON.SEE_ALL}</Link>} title={T.RECENT_ACTIVITY}>
            <ul className="space-y-3 text-sm">
              {data.recentAudit.map((e) => (
                <li className="flex gap-3" key={e.id}>
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />
                  <span className="min-w-0"><span className="block truncate">{e.details}</span><span className="text-xs text-muted">{e.actor} · {formatDateTime(e.at)}</span></span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.ADMIN.REPORTS}>{T.FULL_REPORTS} →</Link>} title={A.TOP_STORES}>
        <DataTable
          columns={[
            { header: A.STORE, key: "slug", render: (r) => <span className="flex items-center gap-3"><StoreAvatar size="size-8 text-xs" store={r.store} />{r.store.name}</span> },
            { align: "right", header: "GMV", key: "gmv", render: (r) => formatCurrency(r.gmv) },
            { align: "right", header: T.SHIPMENTS, key: "orders", render: (r) => formatNumber(r.orders) },
            { align: "right", header: A.COMMISSION, key: "commission", render: (r) => formatCurrency(r.commission) },
          ]}
          rowKey="gmv"
          rows={data.topStores}
        />
      </Panel>
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink icon={Boxes} label={T.QUICK_CATEGORIES} to={ROUTES.ADMIN.CATEGORIES} />
        <QuickLink icon={Megaphone} label={T.QUICK_AD} to={ROUTES.ADMIN.ADS} />
        <QuickLink icon={Users} label={T.QUICK_DOCUMENTS} to={ROUTES.ADMIN.DOCUMENTS} />
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, to }) {
  return (
    <Link className="flex items-center gap-3 rounded-xl bg-brand-800 p-4 text-white shadow-card transition hover:bg-brand-700" to={to}>
      <Icon aria-hidden className="size-5 text-accent-400" /> <span className="font-semibold">{label}</span> <ArrowRight aria-hidden className="ml-auto size-4" />
    </Link>
  );
}
