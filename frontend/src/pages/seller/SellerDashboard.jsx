import {
  ArrowRight, CheckCircle2, Circle, ClipboardList, Clock, Crown, Inbox, IndianRupee, MessagesSquare, PackageCheck, Plus, ShoppingBag, Store, TriangleAlert, Truck, Undo2, Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

import { getSellerDashboard, getSellerGrowthSummary } from "@/api";
import {
  Button, ColumnChart, DataTable, ErrorState, PageHeader, PageLoader, Panel, SmartImage, StatCard, StatusBadge,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { formatCompactInr, formatCurrency, formatDateTime, formatNumber } from "@/utils";

const H = EN.SELLER_HUB;
const D = EN.SELLER_PRO.DASHBOARD;
const CHECKLIST = [
  ["profile", ROUTES.SELLER.BUSINESS], ["kyc", ROUTES.SELLER.BUSINESS], ["product", ROUTES.SELLER.PRODUCT_NEW], ["shipping", ROUTES.SELLER.SHIPPING], ["plan", ROUTES.SELLER.PLAN],
];

function LeadTile({ hint, icon: Icon, label, to, tone, value }) {
  return (
    <Link className="group flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card transition hover:ring-2 hover:ring-brand-200" to={to}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon aria-hidden className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block text-xl font-bold tabular">{value}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      <ArrowRight aria-hidden className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
    </Link>
  );
}

function Onboarding({ checklist }) {
  const done = CHECKLIST.filter(([k]) => checklist[k]).length;
  if (done === CHECKLIST.length) return null;
  const pct = Math.round((done / CHECKLIST.length) * 100);
  return (
    <section className="rounded-2xl bg-gradient-to-br from-brand-50 via-white to-amber-50 p-5 shadow-card ring-1 ring-brand-100">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">{D.READY_TITLE}</h2>
          <p className="text-sm text-muted">{D.READY_BODY(done, CHECKLIST.length)}</p>
        </div>
        <span className="text-2xl font-bold tabular text-brand-700">{pct}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-100"><div className="h-full rounded-full bg-[#14a397]" style={{ width: `${pct}%` }} /></div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {CHECKLIST.map(([key, to]) => (
          <li key={key}>
            <Link className={`flex h-full items-start gap-2 rounded-xl px-3 py-2.5 text-sm ring-1 ring-inset ${checklist[key] ? "bg-white/60 text-muted ring-line" : "bg-white font-medium ring-brand-200 hover:ring-brand-400"}`} to={to}>
              {checklist[key] ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-500" />}
              <span><span className={checklist[key] ? "line-through" : ""}>{D.CHECK[key]}</span>{!checklist[key] && <span className="block text-xs font-normal text-muted">{D.CHECK_HINT[key]}</span>}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
const PIPELINE = ["confirmed", "processing", "shipped", "delivered", "cancelled", "undelivered"];

export function SellerDashboard() {
  useDocumentTitle(EN.SELLER.NAV_DASHBOARD);
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => getSellerDashboard(user.storeSlug), [user.storeSlug]);
  const growth = useAsync(() => getSellerGrowthSummary(user.storeSlug), [user.storeSlug]).data;
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { kpis, lowStock, recentOrders, salesByWeek, statusCounts, store } = data;
  const pipelineMax = Math.max(1, ...PIPELINE.map((s) => statusCounts[s] ?? 0));

  const alerts = [
    kpis.toShip > 0 && { icon: Truck, label: H.ALERT_TO_SHIP(kpis.toShip), to: ROUTES.SELLER.ORDERS, tone: "bg-sky-50 text-sky-800 ring-sky-200" },
    lowStock.length > 0 && { icon: TriangleAlert, label: H.ALERT_LOW_STOCK(lowStock.length), to: ROUTES.SELLER.INVENTORY, tone: "bg-amber-50 text-amber-800 ring-amber-200" },
    kpis.openReturns > 0 && { icon: Undo2, label: H.ALERT_RETURNS(kpis.openReturns), to: ROUTES.SELLER.RETURNS, tone: "bg-red-50 text-red-800 ring-red-200" },
    growth?.newLeads > 0 && { icon: Inbox, label: H.ALERT_ENQUIRIES(growth.newLeads), to: ROUTES.SELLER.LEADS, tone: "bg-violet-50 text-violet-800 ring-violet-200" },
    growth?.unreadMessages > 0 && { icon: MessagesSquare, label: H.ALERT_MESSAGES(growth.unreadMessages), to: ROUTES.SELLER.MESSAGES, tone: "bg-brand-50 text-brand-800 ring-brand-200" },
    kpis.pendingProducts > 0 && { icon: Clock, label: H.ALERT_IN_REVIEW(kpis.pendingProducts), to: ROUTES.SELLER.PRODUCTS, tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={(
          <>
            <Button size="sm" to={ROUTES.SELLER.PRODUCT_NEW}><Plus className="size-4" />{H.ADD_PRODUCT}</Button>
            <Button size="sm" to={ROUTES.SELLER.SHIPPING} variant="outline"><Truck className="size-4" />{H.MANAGE_DELIVERY}</Button>
            <Button size="sm" to={ROUTES.STORE(store.slug)} variant="ghost"><Store className="size-4" />{H.VIEW_STORE}</Button>
          </>
        )}
        subtitle={store.rating ? H.DASHBOARD_SUBTITLE(store.name, store.rating) : D.NEW_STORE(store.name)}
        title={H.DASHBOARD_TITLE(user.firstName)}
      />

      {alerts.length > 0 && (
        <ul aria-label={H.ALERTS} className="flex flex-wrap gap-2">
          {alerts.map(({ icon: Icon, label, to, tone }) => (
            <li key={label}>
              <Link className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset hover:opacity-90 ${tone}`} to={to}>
                <Icon aria-hidden className="size-4" />{label}<ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {growth && <Onboarding checklist={growth.checklist} />}

      {growth && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LeadTile hint={D.LEADS_HINT} icon={Inbox} label={D.NEW_LEADS} to={ROUTES.SELLER.LEADS} tone="bg-sky-50 text-sky-700" value={formatNumber(growth.newLeads)} />
          <LeadTile hint={D.RFQS_HINT} icon={ClipboardList} label={D.OPEN_RFQS} to={ROUTES.SELLER.RFQS} tone="bg-violet-50 text-violet-700" value={formatNumber(growth.openRfqs)} />
          <LeadTile hint={D.MESSAGES_HINT} icon={MessagesSquare} label={D.UNREAD} to={ROUTES.SELLER.MESSAGES} tone="bg-orange-50 text-orange-600" value={formatNumber(growth.unreadMessages)} />
          <LeadTile hint={growth.credits.total == null ? D.UNLIMITED : D.CREDITS_OF(growth.credits.total)} icon={Crown} label={D.CREDITS_LEFT} to={ROUTES.SELLER.PLAN} tone="bg-amber-50 text-amber-700" value={growth.credits.total == null ? "∞" : formatNumber(growth.credits.left)} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IndianRupee} label={EN.SELLER.TODAY_SALES} value={formatCurrency(kpis.todaySales)} />
        <StatCard hint={H.ORDERS_THIS_WEEK(kpis.weekOrders)} icon={ShoppingBag} label={H.SALES_30D} tone="info" value={formatCompactInr(kpis.monthSales)} />
        <StatCard icon={PackageCheck} label={EN.SELLER.PENDING_ORDERS} tone="warning" value={formatNumber(kpis.toShip)} />
        <StatCard hint={H.PENDING_WINDOW(formatCurrency(kpis.pendingInWindow))} icon={Wallet} label={EN.SELLER.BALANCE} tone="accent" value={formatCurrency(kpis.balance)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel className="min-w-0" title={H.WEEKLY_SALES}>
          {salesByWeek.some((w) => w.value > 0) ? <ColumnChart labels={salesByWeek.map((w) => w.label)} series={[{ name: H.SALES, values: salesByWeek.map((w) => w.value) }]} /> : <p className="grid h-48 place-items-center rounded-xl bg-slate-50 px-4 text-center text-sm text-muted">{D.NO_SALES}</p>}
        </Panel>
        <Panel className="min-w-0" action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.SELLER.ORDERS}>{EN.COMMON.SEE_ALL}</Link>} title={H.PIPELINE}>
          <ul className="space-y-3">
            {PIPELINE.map((status) => (
              <li className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-sm" key={status}>
                <span>{EN.ORDER.STATUS[status]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-[#14a397]" style={{ width: `${((statusCounts[status] ?? 0) / pipelineMax) * 100}%` }} />
                </span>
                <span className="text-right font-semibold tabular">{statusCounts[status] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <Panel className="min-w-0" action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.SELLER.INVENTORY}>{H.MANAGE_STOCK}</Link>} title={EN.SELLER.LOW_STOCK}>
          {lowStock.length === 0 ? <p className="text-sm text-muted">{H.NO_LOW_STOCK}</p> : (
            <ul className="divide-y divide-line">
              {lowStock.map(({ product, variant }) => (
                <li className="flex items-center gap-3 py-2.5 text-sm" key={variant.id}>
                  <SmartImage alt="" className="size-10 rounded-md bg-slate-50 object-contain" src={product.thumbnail} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-medium">{product.name}</span>
                    <span className="text-xs text-muted">{Object.values(variant.attributes).join(" / ") || variant.sku}</span>
                  </span>
                  <span className={variant.stock === 0 ? "font-semibold text-red-600" : "font-semibold text-amber-700"}>{variant.stock === 0 ? EN.PRODUCT.OUT_OF_STOCK : variant.stock}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="min-w-0" action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.SELLER.ORDERS}>{EN.COMMON.SEE_ALL}</Link>} title={EN.SELLER.RECENT_ORDERS}>
          <DataTable
            columns={[
              { header: EN.TABLE.ORDER, key: "number", render: (r) => <span className="font-mono text-xs">{r.number}</span> },
              { header: EN.TABLE.BUYER, key: "buyer", render: (r) => <>{r.buyer.name}<span className="block text-xs text-muted">{r.shippingAddress.city}</span></> },
              { header: EN.TABLE.DATE, key: "createdAt", render: (r) => formatDateTime(r.createdAt) },
              { header: EN.TABLE.STATUS, key: "status", render: (r) => <StatusBadge status={r.status} /> },
              { align: "right", header: EN.TABLE.TOTAL, key: "total", render: (r) => formatCurrency(r.total) },
            ]}
            empty={H.NO_ORDERS}
            rowKey="number"
            rows={recentOrders}
          />
        </Panel>
      </div>
    </div>
  );
}
