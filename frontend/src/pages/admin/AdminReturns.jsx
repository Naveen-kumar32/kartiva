import { Eye, FileText, Gavel, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";

import { adminActOnReturn, getAdminRefunds, getAdminReturns, markRefundPaid } from "@/api";
import { getDb } from "@/api/mockDb";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, ExportMenu, KeyValue, MiniStat, PageHeader, PageLoader, Panel, PromptDialog, SearchInput, StatusBadge, Tabs, Timeline,
} from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, formatDate, formatDateTime, getErrorMessage, successToast } from "@/utils";
import { downloadCreditNote, downloadTable } from "@/utils/documents";

import { DrawerSection, SrHeader } from "./opsShared";

const O = EN.ADMIN_OPS;
const load = async () => {
  const [returns, refunds] = await Promise.all([getAdminReturns(), getAdminRefunds()]);
  return { refunds, returns };
};
const storeName = (slug) => getDb().stores.find((s) => s.slug === slug)?.name ?? slug;
const buyerOf = (orderNumber) => getDb().orders.find((o) => o.number === orderNumber)?.buyer;

export function AdminReturns() {
  useDocumentTitle(O.RETURNS_TITLE);
  const { data, error, loading, reload, setData } = useAsync(load, []);
  const [tab, setTab] = useState("escalated");
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState(null);
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(false);

  const term = q.trim().toLowerCase();
  const lists = useMemo(() => {
    if (!data) return null;
    const matchR = (r) => !term || r.number.toLowerCase().includes(term) || r.buyer.name.toLowerCase().includes(term) || r.items[0].name.toLowerCase().includes(term);
    const matchF = (f) => !term || f.subOrderNumber.toLowerCase().includes(term) || (buyerOf(f.orderNumber)?.name ?? "").toLowerCase().includes(term);
    return {
      all: data.returns.filter(matchR),
      cod: data.refunds.filter((f) => f.status === "pending" && f.method === "bank_transfer").filter(matchF),
      escalated: data.returns.filter((r) => r.escalated).filter(matchR),
      history: data.refunds.filter((f) => f.status === "processed").filter(matchF),
    };
  }, [data, term]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const refresh = async () => setData(await load());
  const overrule = async (ret) => {
    setBusy(true);
    try {
      await adminActOnReturn(ret.id, "override", { reason: O.OVERRULED_NOTE });
      await refresh();
      successToast(O.OVERRULED_TOAST(ret.number));
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const exportList = (format) => {
    if (tab === "cod" || tab === "history") {
      return downloadTable(format, `kartiva-refunds-${tab}.csv`, [
        { header: "ID", key: "id" }, { header: O.COL_ORDER, key: "orderNumber" }, { header: O.COL_SUB_ORDER, key: "subOrderNumber" }, { header: O.COL_STORE, value: (f) => storeName(f.storeSlug) },
        { header: O.COL_BUYER, value: (f) => buyerOf(f.orderNumber)?.name }, { header: O.COL_METHOD, key: "method" }, { header: O.COL_PAY_TO, key: "payoutTo" }, { header: O.COL_AMOUNT, key: "amount" },
        { header: O.COL_REASON, key: "reason" }, { header: O.COL_STATUS, key: "status" }, { header: "UTR", key: "utr" }, { header: O.COL_DATE, value: (f) => f.processedAt ?? f.createdAt },
      ], lists[tab], { title: O.RETURNS_TITLE });
    }
    return downloadTable(format, `kartiva-returns-${tab}.csv`, [
        { header: O.COL_RETURN, key: "number" }, { header: O.COL_SUB_ORDER, key: "subOrderNumber" }, { header: O.COL_ITEM, value: (r) => r.items[0].name }, { header: O.COL_QTY, value: (r) => r.items[0].quantity },
        { header: O.COL_REASON, key: "reasonCode" }, { header: O.COL_BUYER, value: (r) => r.buyer.name }, { header: O.COL_STORE, value: (r) => storeName(r.storeSlug) },
        { header: O.COL_AMOUNT, key: "refundAmount" }, { header: O.COL_STATUS, key: "status" }, { header: O.TAB_ESCALATED, value: (r) => (r.escalated ? "Yes" : "No") }, { header: O.CREDIT_NOTE, key: "creditNoteNumber" },
    ], lists[tab], { title: O.RETURNS_TITLE });
  };

  const viewed = data.returns.find((r) => r.id === viewId);
  const codTotal = lists.cod.reduce((t, f) => t + f.amount, 0);

  const returnColumns = [
    { header: O.COL_RETURN, key: "number", render: (r) => <button className="text-left" onClick={() => setViewId(r.id)} type="button"><span className="font-mono text-xs font-semibold hover:text-brand-700">{r.number}</span><span className="block text-xs text-muted">{formatDate(r.createdAt)}</span></button> },
    { header: O.COL_ITEM, key: "item", render: (r) => <><span className="line-clamp-1">{r.items[0].name}</span><span className="text-xs text-muted">{r.items[0].variantLabel && `${r.items[0].variantLabel} · `}× {r.items[0].quantity}</span></> },
    { header: O.COL_REASON, key: "reasonCode", render: (r) => O.REASONS[r.reasonCode] ?? r.reasonCode },
    { header: O.COL_BUYER, key: "buyer", render: (r) => r.buyer.name },
    { header: O.COL_STORE, key: "storeSlug", render: (r) => storeName(r.storeSlug) },
    { align: "right", header: O.COL_AMOUNT, key: "refundAmount", render: (r) => formatCurrency(r.refundAmount) },
    { header: O.COL_STATUS, key: "status", render: (r) => <span className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{r.escalated && <StatusBadge status="escalated" />}</span> },
    { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "actions", render: (r) => (
      <span className="flex justify-end gap-1">
        {r.escalated && r.status === "rejected" && <Button loading={busy} onClick={() => overrule(r)} size="sm"><Gavel className="size-4" />{O.OVERRULE}</Button>}
        <Button aria-label={O.VIEW_ITEM(r.number)} onClick={() => setViewId(r.id)} size="sm" variant="ghost"><Eye className="size-4" /></Button>
      </span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu onExport={exportList} size="md" />} subtitle={O.RETURNS_SUBTITLE} title={O.RETURNS_TITLE} />
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label={O.TAB_ESCALATED} tone={lists.escalated.length ? "danger" : undefined} value={data.returns.filter((r) => r.escalated).length} />
        <MiniStat label={O.OPEN_RETURNS} value={data.returns.filter((r) => ["requested", "approved", "in_transit", "received"].includes(r.status)).length} />
        <MiniStat label={O.COD_QUEUE_COUNT} tone={lists.cod.length ? "warning" : undefined} value={data.refunds.filter((f) => f.status === "pending").length} />
        <MiniStat label={O.COD_QUEUE_AMOUNT} value={formatCurrency(codTotal)} />
      </div>
      <Panel>
        <Tabs
          onChange={setTab}
          tabs={[
            { count: data.returns.filter((r) => r.escalated).length, label: O.TAB_ESCALATED, value: "escalated" },
            { count: data.returns.length, label: O.TAB_ALL_RETURNS, value: "all" },
            { count: data.refunds.filter((f) => f.status === "pending" && f.method === "bank_transfer").length, label: O.TAB_COD_QUEUE, value: "cod" },
            { count: data.refunds.filter((f) => f.status === "processed").length, label: O.TAB_REFUND_HISTORY, value: "history" },
          ]}
          value={tab}
        />
        <SearchInput className="my-4 max-w-sm" onChange={setQ} placeholder={O.SEARCH_RETURNS} value={q} />
        {tab === "cod" && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{O.COD_QUEUE_HINT}</p>}
        {lists[tab].length === 0 ? <EmptyState icon={Undo2} title={tab === "escalated" ? O.NO_ESCALATIONS : O.NO_RESULTS} /> : (
          (tab === "escalated" || tab === "all") ? <DataTable columns={returnColumns} rows={lists[tab]} /> : (
            <DataTable
              columns={[
                { header: O.COL_SUB_ORDER, key: "subOrderNumber", render: (f) => <><span className="font-mono text-xs">{f.subOrderNumber}</span><span className="block text-xs text-muted">{formatDateTime(f.processedAt ?? f.createdAt)}</span></> },
                { header: O.COL_BUYER, key: "buyer", render: (f) => buyerOf(f.orderNumber)?.name ?? "—" },
                { header: O.COL_STORE, key: "storeSlug", render: (f) => storeName(f.storeSlug) },
                { header: O.COL_REASON, key: "reason", render: (f) => O.REFUND_REASONS[f.reason] ?? f.reason },
                { header: tab === "cod" ? O.COL_PAY_TO : O.COL_METHOD, key: "method", render: (f) => (tab === "cod" ? <span className="font-mono text-xs">{f.payoutTo}</span> : <Badge tone={f.method === "gateway" ? "info" : "accent"}>{O.METHODS[f.method]}</Badge>) },
                { align: "right", header: O.COL_AMOUNT, key: "amount", render: (f) => formatCurrency(f.amount) },
                tab === "history"
                  ? { header: "UTR", key: "utr", render: (f) => <span className="font-mono text-xs">{f.utr ?? "—"}</span> }
                  : { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "pay", render: (f) => <Button onClick={() => setPaying(f)} size="sm">{O.MARK_PAID}</Button> },
              ]}
              rows={lists[tab]}
            />
          )
        )}
      </Panel>

      <Drawer onClose={() => setViewId(null)} open={Boolean(viewed)} side="right" size="lg" title={viewed?.number ?? ""}>
        {viewed && <ReturnDetail busy={busy} onOverrule={overrule} ret={viewed} />}
      </Drawer>

      {paying && (
        <PromptDialog
          body={O.MARK_PAID_BODY(formatCurrency(paying.amount), paying.payoutTo)}
          confirmLabel={O.MARK_PAID}
          key={paying.id}
          label={O.UTR_LABEL}
          loading={busy}
          multiline={false}
          onCancel={() => setPaying(null)}
          onConfirm={async (utr) => {
            setBusy(true);
            try {
              await markRefundPaid(paying.id, utr);
              await refresh();
              successToast(O.REFUND_PAID_TOAST(formatCurrency(paying.amount)));
              setPaying(null);
            } catch (err) {
              errorToast(getErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
          open
          placeholder="HDFC0000123456"
          title={O.MARK_REFUND_PAID}
        />
      )}
    </div>
  );
}

function ReturnDetail({ busy, onOverrule, ret }) {
  const creditNote = () => {
    try {
      const db = getDb();
      const order = db.orders.find((o) => o.number === ret.orderNumber);
      const sub = order.subOrders.find((s) => s.number === ret.subOrderNumber);
      downloadCreditNote({ order, platform: db.platform, ret, store: db.stores.find((s) => s.slug === ret.storeSlug), sub });
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };
  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap gap-2"><StatusBadge status={ret.status} />{ret.escalated && <StatusBadge status="escalated" />}</div>
      <KeyValue items={[
        [O.COL_ITEM, `${ret.items[0].name}${ret.items[0].variantLabel ? ` (${ret.items[0].variantLabel})` : ""} × ${ret.items[0].quantity}`],
        [O.COL_REASON, O.REASONS[ret.reasonCode] ?? ret.reasonCode], [O.COL_BUYER, `${ret.buyer.name} · ${ret.buyer.email}`],
        [O.COL_STORE, storeName(ret.storeSlug)], [O.COL_SUB_ORDER, ret.subOrderNumber],
        [O.COL_PAYMENT, ret.paymentMethod === "cod" ? EN.ORDER.METHOD_COD : EN.ORDER.METHOD_ONLINE],
        [O.REFUND_AMOUNT, formatCurrency(ret.refundAmount)], ret.returnTracking && [O.TRACKING, ret.returnTracking],
        ret.creditNoteNumber && [O.CREDIT_NOTE, ret.creditNoteNumber],
      ]} />
      <DrawerSection title={O.BUYER_SAYS}><p className="rounded-lg bg-slate-50 p-3 text-sm">“{ret.description}”</p></DrawerSection>
      {ret.rejectionReason && <DrawerSection title={O.SELLER_REJECTED}><p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{ret.rejectionReason}</p></DrawerSection>}
      <DrawerSection title={O.TIMELINE}><Timeline events={ret.timeline} /></DrawerSection>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {ret.escalated && ret.status === "rejected" && <Button loading={busy} onClick={() => onOverrule(ret)}><Gavel className="size-4" />{O.OVERRULE}</Button>}
        {ret.creditNoteNumber && <Button onClick={creditNote} variant="subtle"><FileText className="size-4" />{O.DOWNLOAD_CREDIT_NOTE}</Button>}
      </div>
    </div>
  );
}
