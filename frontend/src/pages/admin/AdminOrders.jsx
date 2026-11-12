import { Eye, FileSpreadsheet, FileText, Package, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { adminUpdateSubOrder, getAdminOrders, markSeen } from "@/api";
import { getDb } from "@/api/mockDb";
import { TRANSITIONS } from "@/api/orderOps";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, ExportMenu, KeyValue, Modal, OrderDocumentActions, PageHeader, PageLoader, Panel, PromptDialog, SearchInput, Select, ShipmentTracker, SmartImage, StatusBadge, Tabs, Timeline,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, formatDateTime, formatRelative, getErrorMessage, successToast } from "@/utils";
import { downloadInvoiceExcel, downloadPackingSlip, downloadShippingLabel, downloadTable, downloadTaxInvoice } from "@/utils/documents";

import { DrawerSection, SrHeader } from "./opsShared";

const O = EN.ADMIN_OPS;
const CARRIERS = ["Delhivery", "Blue Dart", "Ekart", "DTDC", "India Post", "Xpressbees"];
const needsShipping = (o) => o.subOrders.some((s) => s.status === "confirmed" || s.status === "processing");
const TABS = [
  ["all", O.TAB_ALL, () => true],
  ["ship", O.TAB_NEEDS_SHIPPING, needsShipping],
  ["cod", O.TAB_COD, (o) => o.paymentMethod === "cod"],
  ["issues", O.TAB_CANCELLED_REFUNDED, (o) => o.subOrders.some((s) => s.status === "cancelled" || s.status === "undelivered") || o.paymentStatus.includes("refunded")],
];
const commissionOf = (o) => o.subOrders.filter((s) => s.status !== "cancelled").reduce((t, s) => t + s.commissionAmount, 0);

export function AdminOrders() {
  useDocumentTitle(O.ORDERS_TITLE);
  const { data, error, loading, reload, setData } = useAsync(getAdminOrders, []);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [params] = useSearchParams();
  const [viewNumber, setViewNumber] = useState(() => params.get("order"));
  const { user } = useAuth();
  const { data: seenSince } = useAsync(() => markSeen(user, "orders"), []);
  const isNew = (o) => Boolean(seenSince) && o.createdAt > seenSince;
  const [pending, setPending] = useState(null); // { sub, to }
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const test = TABS.find(([k]) => k === tab)[2];
    const term = q.trim().toLowerCase();
    return data.filter((o) => test(o) && (!term || o.number.toLowerCase().includes(term) || o.buyer.name.toLowerCase().includes(term) || o.buyer.email.toLowerCase().includes(term) || o.subOrders.some((s) => s.number.toLowerCase().includes(term))));
  }, [data, tab, q]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const runTransition = async (sub, to, details = {}) => {
    setBusy(true);
    try {
      await adminUpdateSubOrder(sub.number, to, details);
      setData(await getAdminOrders());
      successToast(O.SUB_ORDER_UPDATED(sub.number, EN.ORDER.STATUS[to] ?? to));
      setPending(null);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const startTransition = (sub, to) => (["shipped", "cancelled", "undelivered"].includes(to) ? setPending({ sub, to }) : runTransition(sub, to));

  const exportList = (format) => downloadTable(format, `kartiva-orders-${tab}.csv`, [
    { header: O.COL_ORDER, value: (r) => r.order.number }, { header: O.COL_SUB_ORDER, value: (r) => r.sub.number }, { header: O.COL_DATE, value: (r) => r.order.createdAt },
    { header: O.COL_BUYER, value: (r) => r.order.buyer.name }, { header: O.COL_EMAIL, value: (r) => r.order.buyer.email }, { header: O.COL_STATE, value: (r) => r.order.address.state },
    { header: O.COL_STORE, value: (r) => r.sub.storeName }, { header: O.COL_STATUS, value: (r) => r.sub.status }, { header: O.COL_PAYMENT, value: (r) => r.order.paymentMethod },
    { header: O.COL_TAXABLE, value: (r) => r.sub.tax.taxable }, { header: "CGST", value: (r) => r.sub.tax.cgst }, { header: "SGST", value: (r) => r.sub.tax.sgst }, { header: "IGST", value: (r) => r.sub.tax.igst },
    { header: O.COL_DELIVERY_FEE, value: (r) => r.sub.fee }, { header: O.COL_TOTAL, value: (r) => r.sub.total }, { header: O.COL_COMMISSION, value: (r) => r.sub.commissionAmount },
    { header: O.COL_INVOICE, value: (r) => r.sub.invoiceNumber ?? "" },
  ], rows.flatMap((order) => order.subOrders.map((sub) => ({ order, sub }))), { title: O.ORDERS_TITLE });

  const viewed = data.find((o) => o.number === viewNumber);
  const totals = rows.reduce((t, o) => ({ commission: t.commission + commissionOf(o), gmv: t.gmv + o.grandTotal }), { commission: 0, gmv: 0 });

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu onExport={exportList} size="md" />} subtitle={O.ORDERS_SUBTITLE} title={O.ORDERS_TITLE} />
      <Panel>
        <Tabs onChange={setTab} tabs={TABS.map(([value, label, test]) => ({ count: data.filter(test).length, label, value }))} value={tab} />
        <div className="my-4 flex flex-wrap items-center justify-between gap-3">
          <SearchInput className="w-full max-w-sm" onChange={setQ} placeholder={O.SEARCH_ORDERS} value={q} />
          <p className="text-sm text-muted">{O.ORDERS_SUMMARY(rows.length, formatCurrency(totals.gmv), formatCurrency(totals.commission))}</p>
        </div>
        {data.filter(isNew).length > 0 && <p className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="status"><span aria-hidden className="size-2 animate-pulse rounded-full bg-red-500" />{EN.ORDER.NEW_SINCE(data.filter(isNew).length)}</p>}
        {rows.length === 0 ? <EmptyState icon={Package} title={O.NO_RESULTS} /> : (
          <DataTable
            rowClassName={(o) => (isNew(o) ? "bg-amber-50/70" : "")}
            columns={[
              { header: O.COL_ORDER, key: "number", render: (o) => <button className="text-left" onClick={() => setViewNumber(o.number)} type="button"><span className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-xs font-semibold hover:text-brand-700">{o.number}</span>{isNew(o) && <Badge tone="danger">{EN.ORDER.NEW}</Badge>}</span><span className={`block text-xs ${isNew(o) ? "font-semibold text-ink" : "text-muted"}`}>{formatRelative(o.createdAt)} · {formatDateTime(o.createdAt)}</span></button> },
              { header: O.COL_BUYER, key: "buyer", render: (o) => <>{o.buyer.name}<span className="block text-xs text-muted">{o.address.city}, {o.address.state}</span></> },
              { header: O.COL_SHIPMENTS, key: "subs", render: (o) => <span className="flex flex-wrap gap-1">{o.subOrders.map((s) => <span className="flex items-center gap-1 text-xs" key={s.number} title={s.storeName}><StatusBadge status={s.status} /></span>)}</span> },
              { header: O.COL_PAYMENT, key: "payment", render: (o) => <>{o.paymentMethod === "cod" ? "COD" : O.ONLINE}<span className="block text-xs text-muted">{O.PAYMENT_STATUS[o.paymentStatus] ?? o.paymentStatus}</span></> },
              { align: "right", header: O.COL_TOTAL, key: "grandTotal", render: (o) => formatCurrency(o.grandTotal) },
              { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "view", render: (o) => <Button aria-label={O.VIEW_ITEM(o.number)} onClick={() => setViewNumber(o.number)} size="sm" variant="ghost"><Eye className="size-4" /></Button> },
            ]}
            rowKey="number"
            rows={rows}
          />
        )}
      </Panel>

      <Drawer onClose={() => setViewNumber(null)} open={Boolean(viewed)} side="right" size="lg" title={viewed?.number ?? ""}>
        {viewed && <OrderDetail busy={busy} onTransition={startTransition} order={viewed} />}
      </Drawer>

      {pending?.to === "shipped" && <ShipDialog busy={busy} key={pending.sub.number} onCancel={() => setPending(null)} onConfirm={(details) => runTransition(pending.sub, "shipped", details)} sub={pending.sub} />}
      {pending && pending.to !== "shipped" && (
        <PromptDialog
          body={pending.to === "cancelled" ? O.CANCEL_SUB_BODY : O.UNDELIVERED_BODY}
          confirmLabel={pending.to === "cancelled" ? O.CANCEL_SHIPMENT : O.MARK_UNDELIVERED}
          danger
          key={`${pending.sub.number}-${pending.to}`}
          label={O.REASON}
          loading={busy}
          onCancel={() => setPending(null)}
          onConfirm={(note) => runTransition(pending.sub, pending.to, { note })}
          open
          title={`${pending.to === "cancelled" ? O.CANCEL_SHIPMENT : O.MARK_UNDELIVERED} · ${pending.sub.number}`}
        />
      )}
    </div>
  );
}

function OrderDetail({ busy, onTransition, order }) {
  const tax = order.subOrders.reduce((t, s) => t + s.tax.cgst + s.tax.sgst + s.tax.igst, 0);
  const a = order.address;
  return (
    <div className="space-y-5 p-4">
      <KeyValue items={[
        [O.COL_BUYER, <>{order.buyer.name}<span className="block text-xs text-muted">{order.buyer.email}</span></>],
        [O.SHIP_TO, `${a.line1}${a.line2 ? `, ${a.line2}` : ""}, ${a.city}, ${a.state} ${a.pincode} · ${a.phone}`],
        [O.COL_PAYMENT, `${order.paymentMethod === "cod" ? EN.ORDER.METHOD_COD : EN.ORDER.METHOD_ONLINE} · ${O.PAYMENT_STATUS[order.paymentStatus] ?? order.paymentStatus}`],
        order.gstin && [O.BUYER_GSTIN, order.gstin],
        [O.PLACED, formatDateTime(order.createdAt)],
      ]} />
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Figure label={O.GRAND_TOTAL} value={formatCurrency(order.grandTotal)} />
        <Figure label={O.GST_INCLUDED} value={formatCurrency(tax)} />
        <Figure label={O.PLATFORM_COMMISSION} value={formatCurrency(commissionOf(order))} />
      </div>
      <div className="flex flex-wrap gap-2"><OrderDocumentActions audience="admin" order={order} /></div>
      {order.subOrders.map((sub) => <SubOrderCard busy={busy} key={sub.number} onTransition={onTransition} order={order} sub={sub} />)}
    </div>
  );
}

function Figure({ label, value }) {
  return <div className="rounded-lg bg-slate-50 px-2 py-2"><p className="text-muted">{label}</p><p className="mt-0.5 font-bold tabular text-ink">{value}</p></div>;
}

function SubOrderCard({ busy, onTransition, order, sub }) {
  const store = getDb().stores.find((s) => s.slug === sub.storeSlug);
  const platform = getDb().platform;
  const doc = (fn) => { try { fn({ order, platform, store, sub }); } catch (err) { errorToast(getErrorMessage(err)); } };
  const next = TRANSITIONS[sub.status] ?? [];
  return (
    <article className="rounded-xl border border-line">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50 px-3 py-2">
        <div>
          <p className="text-sm font-semibold">{sub.storeName}</p>
          <p className="font-mono text-[11px] text-muted">{sub.number}</p>
        </div>
        <StatusBadge status={sub.status} />
      </header>
      <div className="space-y-3 p-3">
        <ul className="space-y-2">
          {sub.items.map((it) => (
            <li className="flex items-center gap-2 text-xs" key={it.variantId}>
              <SmartImage alt="" className="size-10 shrink-0 rounded bg-slate-50 object-contain" src={it.image} />
              <span className="min-w-0 flex-1"><span className="line-clamp-1 font-medium">{it.name}</span><span className="text-muted">{it.variantLabel && `${it.variantLabel} · `}× {it.quantity} · {it.commissionRate}%</span></span>
              <span className="tabular">{formatCurrency(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <KeyValue items={[
          [O.DELIVERY_METHOD, `${sub.method.name}${sub.fee ? ` · ${formatCurrency(sub.fee)}` : ` · ${EN.CART.FREE}`}`],
          sub.trackingNumber && [O.TRACKING, `${sub.carrier} · ${sub.trackingNumber}`],
          [sub.interstate ? "IGST" : "CGST + SGST", `${formatCurrency(sub.interstate ? sub.tax.igst : sub.tax.cgst + sub.tax.sgst, { decimals: true })} ${O.ON_TAXABLE(formatCurrency(sub.tax.taxable, { decimals: true }))}`],
          [O.COL_COMMISSION, formatCurrency(sub.commissionAmount, { decimals: true })],
          sub.refundedAmount > 0 && [O.REFUNDED, formatCurrency(sub.refundedAmount)],
          sub.invoiceNumber && [O.COL_INVOICE, sub.invoiceNumber],
          [O.COL_TOTAL, <b key="t">{formatCurrency(sub.total)}</b>],
        ]} />
        <DrawerSection title={EN.TRACKING.TITLE}><ShipmentTracker address={order.address} sub={sub} /></DrawerSection>
        <DrawerSection title={O.TIMELINE}><Timeline events={sub.timeline} /></DrawerSection>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {next.map((to) => (
            <Button disabled={busy} key={to} onClick={() => onTransition(sub, to)} size="sm" variant={to === "cancelled" || to === "undelivered" ? "outline" : "primary"}>
              {O.MOVE_TO[to]}
            </Button>
          ))}
          {sub.invoiceNumber && <Button onClick={() => doc(downloadTaxInvoice)} size="sm" variant="subtle"><FileText className="size-4" />{O.TAX_INVOICE}</Button>}
          {sub.invoiceNumber && <Button onClick={() => downloadInvoiceExcel({ order, platform, store, sub }).catch((err) => errorToast(getErrorMessage(err)))} size="sm" variant="subtle"><FileSpreadsheet className="size-4" />{EN.DOWNLOAD.INVOICE_EXCEL}</Button>}
          <Button onClick={() => doc(downloadPackingSlip)} size="sm" variant="ghost"><Package className="size-4" />{O.PACKING_SLIP}</Button>
          <Button onClick={() => doc(downloadShippingLabel)} size="sm" variant="ghost"><Tag className="size-4" />{O.SHIPPING_LABEL}</Button>
        </div>
        {sub.status === "cancelled" && order.paymentMethod === "online" && <Badge tone="info">{O.AUTO_REFUND_NOTE}</Badge>}
      </div>
    </article>
  );
}

function ShipDialog({ busy, onCancel, onConfirm, sub }) {
  const [carrier, setCarrier] = useState(CARRIERS[0]);
  const [tracking, setTracking] = useState("");
  const selfDelivery = sub.method.type === "local_delivery" || sub.method.type === "store_pickup";
  const valid = selfDelivery || tracking.trim().length >= 6;
  return (
    <Modal onClose={onCancel} open title={`${O.MARK_SHIPPED} · ${sub.number}`}>
      <p className="mb-4 text-sm text-muted">{selfDelivery ? O.SELF_DELIVERY_NOTE(sub.method.name) : O.SHIP_BODY}</p>
      <div className="space-y-4">
        <div className="text-sm font-medium"><p className="mb-1.5">{O.CARRIER}</p>
          <Select ariaLabel={O.CARRIER} onChange={setCarrier} options={CARRIERS.map((c) => ({ label: c, value: c }))} value={carrier} />
        </div>
        <label className="block text-sm font-medium">
          {O.TRACKING_NUMBER}
          <input className="mt-1.5 h-11 w-full rounded-lg border border-line px-3 font-mono text-sm uppercase" onChange={(e) => setTracking(e.target.value.toUpperCase())} placeholder="DL1234567890" value={tracking} />
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">{EN.COMMON.CANCEL}</Button>
        <Button disabled={!valid} loading={busy} onClick={() => onConfirm({ carrier, trackingNumber: tracking.trim() })}>{O.MARK_SHIPPED}</Button>
      </div>
    </Modal>
  );
}
