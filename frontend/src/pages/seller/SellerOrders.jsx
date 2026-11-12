import { FileSpreadsheet, FileText, MapPin, Package, Printer, Tag, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getSellerOrders, markSeen, updateSellerOrderStatus } from "@/api";
import { TRANSITIONS } from "@/api/orderOps";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, ExportMenu, FormSelect, KeyValue, Modal, OrderDocumentActions, PageHeader, PageLoader, Panel, PromptDialog, SearchInput, ShipmentTracker, SmartImage, StatusBadge, Tabs, Timeline,
} from "@/components";
import { PLATFORM, STORES } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, formatDateTime, formatRelative, getErrorMessage, successToast } from "@/utils";

const H = EN.SELLER_HUB;
const TABS = ["all", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const CARRIERS = ["Delhivery", "Blue Dart", "Ekart", "DTDC", "India Post", "Own delivery"];
const inTab = (sub, tab) => tab === "all" || sub.status === tab || (tab === "cancelled" && sub.status === "undelivered");

// Shape a seller sub-order row into the { order, store, sub } the document generators expect.
const docArgs = (sub, storeSlug) => ({
  order: { address: sub.shippingAddress, buyer: sub.buyer, createdAt: sub.createdAt, gstin: "", number: sub.orderNumber, paymentMethod: sub.paymentMethod },
  platform: PLATFORM,
  store: STORES.find((s) => s.slug === storeSlug),
  sub,
});

function ShipModal({ onCancel, onConfirm, open, sub }) {
  const [carrier, setCarrier] = useState(CARRIERS[0]);
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const noTracking = ["local_delivery", "store_pickup"].includes(sub?.method.type);
  const invalid = !noTracking && (carrier === "Own delivery" ? false : tracking.trim().length < 6);
  return (
    <Modal onClose={onCancel} open={open} title={H.MARK_SHIPPED}>
      <p className="mb-4 text-sm text-muted">{noTracking ? H.SHIP_LOCAL_HINT : H.SHIP_HINT}</p>
      <div className="space-y-4">
        <FormSelect label={H.CARRIER} name="carrier" onChange={(e) => setCarrier(e.target.value)} options={CARRIERS.map((c) => ({ label: c, value: c }))} value={carrier} />
        <label className="block text-sm font-medium">
          {H.TRACKING_NUMBER}
          <input className="mt-1.5 h-11 w-full rounded-lg border border-line px-3 text-sm uppercase" onChange={(e) => setTracking(e.target.value)} placeholder="DL1234567890" value={tracking} />
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">{EN.COMMON.CANCEL}</Button>
        <Button
          disabled={invalid}
          loading={busy}
          onClick={async () => { setBusy(true); await onConfirm({ carrier, trackingNumber: tracking.trim().toUpperCase() || (noTracking ? sub.method.name : "SELF") }); setBusy(false); }}
        >
          <Truck className="size-4" />{H.MARK_SHIPPED}
        </Button>
      </div>
    </Modal>
  );
}

export function SellerOrders() {
  useDocumentTitle(EN.SELLER.NAV_ORDERS);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerOrders(storeSlug), [storeSlug]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [params] = useSearchParams();
  const [selectedNumber, setSelectedNumber] = useState(() => params.get("order"));
  // Orders placed after the seller's previous visit get a NEW badge (recorded once per page visit).
  const { data: seenSince } = useAsync(() => markSeen(user, "orders"), [storeSlug]);
  const isNew = (r) => Boolean(seenSince) && r.createdAt > seenSince;
  const newCount = (data ?? []).filter(isNew).length;
  const [dialog, setDialog] = useState(null); // "ship" | "cancelled" | "undelivered"
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => TABS.reduce((acc, t) => ({ ...acc, [t]: (data ?? []).filter((s) => inTab(s, t)).length }), {}), [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((s) => inTab(s, tab) && (!q || [s.number, s.buyer.name, s.shippingAddress.city].some((x) => x.toLowerCase().includes(q))));
  }, [data, tab, query]);
  const selected = (data ?? []).find((s) => s.number === selectedNumber);

  const move = async (toStatus, details = {}) => {
    setBusy(true);
    try {
      await updateSellerOrderStatus(storeSlug, selected.number, toStatus, details);
      setData(await getSellerOrders(storeSlug));
      successToast(H.STATUS_UPDATED(EN.ORDER.STATUS[toStatus]));
      setDialog(null);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadDoc = async (kind) => {
    const docs = await import("@/utils/documents");
    const args = docArgs(selected, storeSlug);
    await ({ invoice: docs.downloadTaxInvoice, invoiceExcel: docs.downloadInvoiceExcel, label: docs.downloadShippingLabel, slip: docs.downloadPackingSlip })[kind](args);
  };

  const exportList = async (format) => {
    const { downloadTable } = await import("@/utils/documents");
    await downloadTable(format, `kartiva-orders-${storeSlug}.csv`, [
      { header: "Sub-order", key: "number" }, { header: "Order", key: "orderNumber" }, { header: "Date", value: (r) => r.createdAt.slice(0, 10) },
      { header: "Buyer", value: (r) => r.buyer.name }, { header: "City", value: (r) => r.shippingAddress.city }, { header: "State", value: (r) => r.shippingAddress.state },
      { header: "Payment", key: "paymentMethod" }, { header: "Status", key: "status" }, { header: "Items", value: (r) => r.items.reduce((t, i) => t + i.quantity, 0) },
      { header: "Taxable", value: (r) => r.tax.taxable }, { header: "GST", value: (r) => r.tax.cgst + r.tax.sgst + r.tax.igst },
      { header: "Total", key: "total" }, { header: "Commission", key: "commissionAmount" }, { header: "Invoice", key: "invoiceNumber" }, { header: "Tracking", key: "trackingNumber" },
    ], rows, { title: EN.SELLER.NAV_ORDERS });
  };

  // Invoice register: every invoice this store issued, with the GST split (for the seller's accountant).
  const exportInvoices = async (format) => {
    const { downloadTable, INVOICE_REGISTER_COLUMNS, invoiceRegisterRows } = await import("@/utils/documents");
    const orders = (data ?? []).map((sub) => ({ ...docArgs(sub, storeSlug).order, subOrders: [sub] }));
    await downloadTable(format, `kartiva-invoice-register-${storeSlug}`, INVOICE_REGISTER_COLUMNS, invoiceRegisterRows(orders, STORES), { title: EN.DOWNLOAD.INVOICE_REGISTER });
  };
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const next = selected ? TRANSITIONS[selected.status] ?? [] : [];

  return (
    <div className="space-y-6">
      <PageHeader actions={<><ExportMenu label={EN.DOWNLOAD.INVOICE_REGISTER} onExport={exportInvoices} /><ExportMenu onExport={exportList} /></>} subtitle={H.ORDERS_SUBTITLE} title={EN.SELLER.NAV_ORDERS} />
      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Tabs onChange={setTab} tabs={TABS.map((t) => ({ count: counts[t], label: t === "all" ? EN.COMMON.ALL : EN.ORDER.STATUS[t], value: t }))} value={tab} />
          <SearchInput className="w-full sm:w-72" onChange={setQuery} placeholder={H.SEARCH_ORDERS} value={query} />
        </div>
        {newCount > 0 && <p className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="status"><span aria-hidden className="size-2 animate-pulse rounded-full bg-red-500" />{EN.ORDER.NEW_SINCE(newCount)}</p>}
        {rows.length === 0 ? <EmptyState body={H.NO_ORDERS_BODY} icon={Package} title={H.NO_ORDERS} /> : (
          <DataTable
            rowClassName={(r) => (isNew(r) ? "bg-amber-50/70" : "")}
            columns={[
              { header: EN.TABLE.ORDER, key: "number", render: (r) => <span className="flex flex-wrap items-center gap-1.5"><button className="font-mono text-xs font-semibold text-brand-700 hover:underline" onClick={() => setSelectedNumber(r.number)} type="button">{r.number}</button>{isNew(r) && <Badge tone="danger">{EN.ORDER.NEW}</Badge>}</span> },
              { header: EN.TABLE.BUYER, key: "buyer", render: (r) => <>{r.buyer.name}<span className="block text-xs text-muted">{r.shippingAddress.city}, {r.shippingAddress.state}</span></> },
              { header: EN.TABLE.DATE, key: "createdAt", render: (r) => <><span className={isNew(r) ? "font-semibold text-ink" : ""}>{formatRelative(r.createdAt)}</span><span className="block text-xs text-muted">{formatDateTime(r.createdAt)}</span></> },
              { align: "right", header: EN.TABLE.ITEMS, key: "items", render: (r) => r.items.reduce((t, i) => t + i.quantity, 0) },
              { header: EN.TABLE.METHOD, key: "paymentMethod", render: (r) => <Badge tone={r.paymentMethod === "cod" ? "accent" : "neutral"}>{r.paymentMethod === "cod" ? "COD" : EN.SELLER.ONLINE}</Badge> },
              { header: EN.TABLE.STATUS, key: "status", render: (r) => <StatusBadge status={r.status} /> },
              { align: "right", header: EN.TABLE.TOTAL, key: "total", render: (r) => formatCurrency(r.total) },
              { header: "", key: "view", render: (r) => <Button onClick={() => setSelectedNumber(r.number)} size="sm" variant="ghost">{EN.COMMON.VIEW}</Button> },
            ]}
            rowKey="number"
            rows={rows}
          />
        )}
      </Panel>

      <Drawer onClose={() => setSelectedNumber(null)} open={Boolean(selected)} side="right" size="lg" title={selected?.number ?? ""}>
        {selected && (
          <div className="space-y-6 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <Badge tone={selected.paymentMethod === "cod" ? "accent" : "neutral"}>{selected.paymentMethod === "cod" ? EN.ORDER.METHOD_COD : EN.ORDER.METHOD_ONLINE}</Badge>
              <span className="text-xs text-muted">{formatDateTime(selected.createdAt)}</span>
            </div>

            {next.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {next.includes("processing") && <Button loading={busy} onClick={() => move("processing")} size="sm">{H.START_PROCESSING}</Button>}
                {next.includes("shipped") && <Button onClick={() => setDialog("ship")} size="sm"><Truck className="size-4" />{H.MARK_SHIPPED}</Button>}
                {next.includes("delivered") && <Button loading={busy} onClick={() => move("delivered")} size="sm">{H.MARK_DELIVERED}</Button>}
                {next.includes("undelivered") && <Button onClick={() => setDialog("undelivered")} size="sm" variant="outline">{H.MARK_UNDELIVERED}</Button>}
                {next.includes("cancelled") && <Button onClick={() => setDialog("cancelled")} size="sm" variant="danger">{H.CANCEL_ORDER}</Button>}
              </div>
            )}

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MapPin aria-hidden className="size-4 text-brand-600" />{H.SHIP_TO}</h3>
              <p className="text-sm">{selected.shippingAddress.fullName} · {selected.shippingAddress.phone}</p>
              <p className="text-sm text-muted">{[selected.shippingAddress.line1, selected.shippingAddress.line2, selected.shippingAddress.city, `${selected.shippingAddress.state} ${selected.shippingAddress.pincode}`].filter(Boolean).join(", ")}</p>
              <p className="mt-1 text-xs text-muted">{selected.method.name} · {EN.COMMON.DAYS(selected.method.minDays, selected.method.maxDays)}</p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">{EN.TABLE.ITEMS}</h3>
              <ul className="space-y-3">
                {selected.items.map((it) => (
                  <li className="flex items-center gap-3 text-sm" key={it.variantId}>
                    <SmartImage alt="" className="size-12 rounded-md bg-slate-50 object-contain" src={it.image} />
                    <span className="min-w-0 flex-1"><span className="line-clamp-1 font-medium">{it.name}</span><span className="text-xs text-muted">{it.variantLabel && `${it.variantLabel} · `}{it.sku} · × {it.quantity}</span></span>
                    <span className="tabular">{formatCurrency(it.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <KeyValue items={[
              [EN.CART.SUBTOTAL, formatCurrency(selected.subtotal)],
              [EN.CART.DELIVERY, selected.fee ? formatCurrency(selected.fee) : EN.CART.FREE],
              [EN.CHECKOUT.TAXABLE_VALUE, formatCurrency(selected.tax.taxable, { decimals: true })],
              selected.interstate ? [EN.CHECKOUT.IGST, formatCurrency(selected.tax.igst, { decimals: true })] : [EN.CHECKOUT.CGST_SGST, `${formatCurrency(selected.tax.cgst, { decimals: true })} + ${formatCurrency(selected.tax.sgst, { decimals: true })}`],
              [EN.TABLE.TOTAL, <b key="t">{formatCurrency(selected.total)}</b>],
              [H.COMMISSION, `− ${formatCurrency(selected.commissionAmount, { decimals: true })}`],
              selected.invoiceNumber && [H.INVOICE_NO, selected.invoiceNumber],
              selected.trackingNumber && [H.TRACKING_NUMBER, `${selected.carrier} · ${selected.trackingNumber}`],
            ]} />

            <section>
              <h3 className="mb-2 text-sm font-semibold">{H.DOCUMENTS}</h3>
              <div className="flex flex-wrap gap-2">
                {selected.invoiceNumber
                  ? <><Button onClick={() => downloadDoc("invoice")} size="sm" variant="outline"><FileText className="size-4" />{H.TAX_INVOICE}</Button><Button onClick={() => downloadDoc("invoiceExcel")} size="sm" variant="outline"><FileSpreadsheet className="size-4" />{EN.DOWNLOAD.INVOICE_EXCEL}</Button></>
                  : <span className="text-xs text-muted">{H.INVOICE_ON_SHIP}</span>}
                <Button onClick={() => downloadDoc("slip")} size="sm" variant="outline"><Printer className="size-4" />{H.PACKING_SLIP}</Button>
                <Button onClick={() => downloadDoc("label")} size="sm" variant="outline"><Tag className="size-4" />{H.SHIPPING_LABEL}</Button>
                <OrderDocumentActions
                  audience="seller"
                  order={{ ...docArgs(selected, storeSlug).order, paymentStatus: selected.paymentMethod === "cod" ? "cash on delivery" : "paid", subOrders: [selected] }}
                  subs={[selected]}
                />
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold">{EN.TRACKING.TITLE}</h3>
              <ShipmentTracker address={selected.shippingAddress} sub={selected} />
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold">{H.TIMELINE}</h3>
              <Timeline events={selected.timeline} />
            </section>
          </div>
        )}
      </Drawer>

      {selected && (
        <>
          <ShipModal key={`ship-${selected.number}-${dialog}`} onCancel={() => setDialog(null)} onConfirm={(d) => move("shipped", d)} open={dialog === "ship"} sub={selected} />
          <PromptDialog
            body={dialog === "cancelled" ? (selected.paymentMethod === "online" ? H.CANCEL_REFUND_NOTE : H.CANCEL_COD_NOTE) : H.UNDELIVERED_NOTE}
            confirmLabel={dialog === "cancelled" ? H.CANCEL_ORDER : H.MARK_UNDELIVERED}
            danger
            key={`prompt-${selected.number}-${dialog}`}
            label={H.REASON}
            loading={busy}
            onCancel={() => setDialog(null)}
            onConfirm={(reason) => move(dialog, { note: reason })}
            open={dialog === "cancelled" || dialog === "undelivered"}
            title={dialog === "cancelled" ? H.CANCEL_ORDER : H.MARK_UNDELIVERED}
          />
        </>
      )}
    </div>
  );
}
