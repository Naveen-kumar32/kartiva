import { ClipboardList, FileSpreadsheet, FileText, Printer, ReceiptText, Tag, Truck } from "lucide-react";
import { useMemo, useState } from "react";

import { getAdminOrders, getAdminReturns, getAdminSettlements, getStoreLedger } from "@/api";
import {
  Badge, Button, DataTable, ExportMenu, OrderDocumentActions, PageHeader, PageLoader, Panel, SearchInput, StatusBadge, Tabs,
} from "@/components";
import { PLATFORM, STORES } from "@/data";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { getStore } from "@/utils/catalog";
import {
  downloadCommissionInvoice, downloadCreditNote, downloadPackingSlip, downloadSettlementStatement, downloadInvoiceExcel, downloadShippingLabel, downloadTable, downloadTaxInvoice, INVOICE_REGISTER_COLUMNS, invoiceRegisterRows,
} from "@/utils/documents";
import { formatCurrency, formatDate } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

const T = EN.ADMIN_TOOLS;
const load = () => Promise.all([getAdminOrders(), getAdminReturns(), getAdminSettlements()]).then(([orders, returns, settlements]) => ({ orders, returns, settlements: settlements.settlements }));

export function AdminDocuments() {
  useDocumentTitle(EN.ADMIN.NAV_DOCUMENTS);
  const { data, loading } = useAsync(load, []);
  const [tab, setTab] = useState("orders");
  const [q, setQ] = useState("");

  const subs = useMemo(() => (data?.orders ?? []).flatMap((order) => order.subOrders.map((sub) => ({ order, sub }))), [data]);
  const match = (text) => text.toLowerCase().includes(q.toLowerCase());
  if (loading) return <PageLoader />;

  const make = (fn, label) => {
    try { fn(); successToast(T.DOC_READY(label)); } catch (err) { errorToast(getErrorMessage(err)); }
  };
  const invoices = subs.filter(({ order, sub }) => sub.invoiceNumber && match(`${sub.invoiceNumber} ${sub.number} ${order.buyer.name} ${sub.storeName}`));
  const toShip = subs.filter(({ order, sub }) => ["confirmed", "processing", "shipped"].includes(sub.status) && match(`${sub.number} ${order.buyer.name} ${sub.storeName}`));
  const creditNotes = data.returns.filter((r) => r.creditNoteNumber && match(`${r.creditNoteNumber} ${r.number} ${r.buyer.name}`));
  const settlements = data.settlements.filter((s) => match(`${s.number} ${getStore(s.storeSlug)?.name}`));

  const orderRows = data.orders.filter((o) => match(`${o.number} ${o.buyer.name} ${o.buyer.email}`));
  const families = [
    { count: orderRows.length, icon: ClipboardList, label: EN.DOCS.ORDER_DOCS, value: "orders" },
    { count: invoices.length, icon: ReceiptText, label: T.DOC_INVOICES, value: "invoices" },
    { count: toShip.length, icon: Truck, label: T.DOC_SHIPPING, value: "shipping" },
    { count: creditNotes.length, icon: FileText, label: T.DOC_CREDIT_NOTES, value: "credit" },
    { count: settlements.length, icon: Tag, label: T.DOC_SETTLEMENTS, value: "settlements" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader subtitle={T.DOCUMENTS_SUBTITLE} title={EN.ADMIN.NAV_DOCUMENTS} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {families.map(({ count, icon: Icon, label, value }) => (
          <button className={`flex items-center gap-3 rounded-2xl p-4 text-left shadow-card transition ${tab === value ? "bg-brand-700 text-white" : "bg-white hover:shadow-raised"}`} key={value} onClick={() => setTab(value)} type="button">
            <Icon aria-hidden className={`size-8 ${tab === value ? "text-accent-400" : "text-brand-600"}`} />
            <span><span className="block font-semibold">{label}</span><span className={`text-sm ${tab === value ? "text-white/80" : "text-muted"}`}>{T.DOC_COUNT(count)}</span></span>
          </button>
        ))}
      </div>
      <Panel>
        <Tabs className="mb-4" onChange={setTab} tabs={families.map(({ count, label, value }) => ({ count, label, value }))} value={tab} />
        <SearchInput className="mb-4" onChange={setQ} placeholder={T.SEARCH_DOCS} value={q} />

        {tab === "orders" && (
          <DataTable columns={[
            { header: T.ORDERS_COL, key: "number", render: (o) => <span className="font-mono text-xs">{o.number}</span> },
            { header: EN.TABLE.DATE, key: "createdAt", render: (o) => formatDate(o.createdAt) },
            { header: EN.TABLE.BUYER, key: "buyer", render: (o) => o.buyer.name },
            { align: "right", header: EN.TABLE.TOTAL, key: "grandTotal", render: (o) => formatCurrency(o.grandTotal) },
            { header: "", key: "docs", render: (o) => <span className="flex flex-wrap gap-2"><OrderDocumentActions audience="admin" order={o} /></span> },
          ]} rowKey="number" rows={orderRows.slice(0, 50)} />
        )}

        {tab === "invoices" && (
          <>
          <div className="mb-3 flex justify-end">
            <ExportMenu disabled={!invoices.length} label={EN.DOWNLOAD.INVOICE_REGISTER} onExport={(format) => downloadTable(format, "kartiva-invoice-register", INVOICE_REGISTER_COLUMNS, invoiceRegisterRows(data.orders, STORES, (x) => invoices.some(({ sub }) => sub.number === x.number)), { title: EN.DOWNLOAD.INVOICE_REGISTER })} />
          </div>
          <DataTable columns={[
            { header: T.INVOICE_NO, key: "inv", render: ({ sub }) => <span className="font-mono text-xs">{sub.invoiceNumber}</span> },
            { header: EN.TABLE.DATE, key: "date", render: ({ order, sub }) => formatDate(sub.shippedAt ?? order.createdAt) },
            { header: EN.ADMIN.STORE, key: "store", render: ({ sub }) => sub.storeName },
            { header: EN.TABLE.BUYER, key: "buyer", render: ({ order }) => order.buyer.name },
            { header: "GST", key: "gst", render: ({ sub }) => <Badge tone={sub.interstate ? "info" : "brand"}>{sub.interstate ? "IGST" : "CGST+SGST"}</Badge> },
            { align: "right", header: EN.TABLE.TOTAL, key: "total", render: ({ sub }) => formatCurrency(sub.total) },
            { header: "", key: "dl", render: ({ order, sub }) => (
              <span className="flex gap-2">
                <Button onClick={() => make(() => downloadTaxInvoice({ order, platform: PLATFORM, store: getStore(sub.storeSlug), sub }), T.DOC_INVOICE)} size="sm" variant="outline"><Printer className="size-4" />PDF</Button>
                <Button onClick={() => downloadInvoiceExcel({ order, platform: PLATFORM, store: getStore(sub.storeSlug), sub }).catch((err) => errorToast(getErrorMessage(err)))} size="sm" variant="outline"><FileSpreadsheet className="size-4" />Excel</Button>
              </span>
            ) },
          ]} rowKey="key" rows={invoices.map((r) => ({ ...r, key: r.sub.number }))} />
          </>
        )}

        {tab === "shipping" && (
          <DataTable columns={[
            { header: T.SHIPMENT_COL, key: "n", render: ({ sub }) => <span className="font-mono text-xs">{sub.number}</span> },
            { header: EN.ADMIN.STORE, key: "store", render: ({ sub }) => sub.storeName },
            { header: T.SHIP_TO, key: "to", render: ({ order }) => `${order.address.city}, ${order.address.pincode}` },
            { header: EN.TABLE.STATUS, key: "s", render: ({ sub }) => <StatusBadge status={sub.status} /> },
            { header: EN.TABLE.METHOD, key: "m", render: ({ order }) => (order.paymentMethod === "cod" ? "COD" : T.PREPAID) },
            { header: "", key: "dl", render: ({ order, sub }) => (
              <span className="flex gap-2">
                <Button onClick={() => make(() => downloadPackingSlip({ order, store: getStore(sub.storeSlug), sub }), T.DOC_PACKING)} size="sm" variant="outline">{T.DOC_PACKING}</Button>
                <Button onClick={() => make(() => downloadShippingLabel({ order, store: getStore(sub.storeSlug), sub }), T.DOC_LABEL)} size="sm" variant="outline">{T.DOC_LABEL}</Button>
              </span>
            ) },
          ]} rowKey="key" rows={toShip.map((r) => ({ ...r, key: r.sub.number }))} />
        )}

        {tab === "credit" && (
          <DataTable columns={[
            { header: T.CREDIT_NOTE_NO, key: "c", render: (r) => <span className="font-mono text-xs">{r.creditNoteNumber}</span> },
            { header: T.RETURN_NO, key: "number" },
            { header: EN.TABLE.BUYER, key: "b", render: (r) => r.buyer.name },
            { header: EN.TABLE.STATUS, key: "s", render: (r) => <StatusBadge status={r.status} /> },
            { align: "right", header: EN.TABLE.AMOUNT, key: "a", render: (r) => formatCurrency(r.refundAmount) },
            { header: "", key: "dl", render: (r) => {
              const found = subs.find(({ sub }) => sub.number === r.subOrderNumber);
              return <Button onClick={() => make(() => downloadCreditNote({ order: found.order, platform: PLATFORM, ret: r, store: getStore(r.storeSlug), sub: found.sub }), T.DOC_CREDIT_NOTE)} size="sm" variant="outline"><Printer className="size-4" />PDF</Button>;
            } },
          ]} rows={creditNotes} />
        )}

        {tab === "settlements" && (
          <DataTable columns={[
            { header: T.SETTLEMENT_NO, key: "number" },
            { header: EN.ADMIN.STORE, key: "st", render: (s) => getStore(s.storeSlug)?.name },
            { header: T.PERIOD_END, key: "p", render: (s) => formatDate(s.periodEnd) },
            { header: EN.TABLE.STATUS, key: "s", render: (s) => <StatusBadge status={s.status} /> },
            { align: "right", header: T.NET, key: "net", render: (s) => formatCurrency(s.net, { decimals: true }) },
            { header: "", key: "dl", render: (s) => (
              <span className="flex gap-2">
                <Button onClick={async () => { const { entries } = await getStoreLedger(s.storeSlug); make(() => downloadSettlementStatement({ entries: entries.filter((e) => e.settlementId === s.id), platform: PLATFORM, settlement: s, store: getStore(s.storeSlug) }), T.DOC_STATEMENT); }} size="sm" variant="outline">{T.DOC_STATEMENT}</Button>
                <Button onClick={() => make(() => downloadCommissionInvoice({ platform: PLATFORM, settlement: s, store: getStore(s.storeSlug) }), T.DOC_COMMISSION)} size="sm" variant="outline">{T.DOC_COMMISSION}</Button>
              </span>
            ) },
          ]} rows={settlements} />
        )}
      </Panel>
    </div>
  );
}
