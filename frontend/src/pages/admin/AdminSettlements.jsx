import { FileText, Receipt, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { generateSettlement, getAdminSettlements, getStoreLedger, markSettlementPaid } from "@/api";
import { getDb } from "@/api/mockDb";
import { Button, DataTable, EmptyState, ErrorState, ExportMenu, MiniStat, PageHeader, PageLoader, Panel, PromptDialog, StatusBadge, StoreAvatar, Tabs } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, formatDate, getErrorMessage, successToast } from "@/utils";
import { downloadCommissionInvoice, downloadSettlementStatement, downloadTable } from "@/utils/documents";

import { Money, SrHeader } from "./opsShared";

const O = EN.ADMIN_OPS;
const TABS = [
  ["all", O.TAB_ALL, () => true],
  ["approved", O.TAB_TO_PAY, (s) => s.status === "approved"],
  ["paid", O.TAB_PAID, (s) => s.status === "paid"],
  ["carried_forward", O.TAB_CARRIED, (s) => s.status === "carried_forward"],
];
const storeOf = (slug) => getDb().stores.find((s) => s.slug === slug);

// Seeded settlements have no frozen breakdown — derive it from their ledger entries.
async function settlementDocs(settlement) {
  const { entries } = await getStoreLedger(settlement.storeSlug);
  const own = entries.filter((e) => e.settlementId === settlement.id && e.type !== "payout");
  const breakdown = settlement.breakdown ?? own.reduce((acc, e) => ({ ...acc, [e.type]: Math.round(((acc[e.type] ?? 0) + e.amount) * 100) / 100 }), {});
  return { entries: own, platform: getDb().platform, settlement: { ...settlement, breakdown }, store: storeOf(settlement.storeSlug) };
}

export function AdminSettlements() {
  useDocumentTitle(O.SETTLEMENTS_TITLE);
  const { data, error, loading, reload, setData } = useAsync(getAdminSettlements, []);
  const [tab, setTab] = useState("all");
  const [busy, setBusy] = useState(null);
  const [paying, setPaying] = useState(null);

  const rows = useMemo(() => (data ? data.settlements.filter(TABS.find(([k]) => k === tab)[2]) : []), [data, tab]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const refresh = async () => setData(await getAdminSettlements());
  const generate = async (store) => {
    setBusy(store.slug);
    try {
      const s = await generateSettlement(store.slug);
      await refresh();
      successToast(s.status === "carried_forward" ? O.SETTLEMENT_CARRIED(s.number, store.name) : O.SETTLEMENT_CREATED(s.number, formatCurrency(s.net)));
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const download = async (settlement, kind) => {
    try {
      const args = await settlementDocs(settlement);
      if (kind === "statement") downloadSettlementStatement(args);
      else downloadCommissionInvoice(args);
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };

  const toPay = data.settlements.filter((s) => s.status === "approved");
  const openTotal = data.stores.reduce((t, s) => t + Math.max(0, s.openAmount), 0);
  const exportList = (format) => downloadTable(format, `kartiva-settlements-${tab}.csv`, [
    { header: O.COL_SETTLEMENT, key: "number" }, { header: O.COL_STORE, value: (s) => storeOf(s.storeSlug)?.name }, { header: "GSTIN", value: (s) => storeOf(s.storeSlug)?.gstin },
    { header: O.COL_PERIOD_END, key: "periodEnd" }, { header: O.COL_NET, key: "net" }, { header: O.COL_STATUS, key: "status" }, { header: "UTR", key: "utr" }, { header: O.COL_PAID_ON, key: "paidAt" },
    { header: O.COL_SHIPMENTS, value: (s) => s.subOrderNumbers.length },
  ], rows, { title: O.SETTLEMENTS_TITLE });

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu onExport={exportList} size="md" />} subtitle={O.SETTLEMENTS_SUBTITLE} title={O.SETTLEMENTS_TITLE} />
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label={O.READY_TO_SETTLE} value={formatCurrency(openTotal)} />
        <MiniStat label={O.TAB_TO_PAY} tone={toPay.length ? "warning" : undefined} value={`${toPay.length} · ${formatCurrency(toPay.reduce((t, s) => t + s.net, 0))}`} />
        <MiniStat label={O.PAID_TOTAL} tone="success" value={formatCurrency(data.settlements.filter((s) => s.status === "paid").reduce((t, s) => t + s.net, 0))} />
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <p className="rounded-xl bg-brand-50 p-4 text-brand-900"><b className="block">{O.CYCLE_TITLE}</b>{O.CYCLE_BODY(getDb().platform.defaultReturnWindowDays)}</p>
        <p className="rounded-xl bg-amber-50 p-4 text-amber-900"><b className="block">{O.NEGATIVE_TITLE}</b>{O.NEGATIVE_BODY}</p>
      </div>

      <Panel title={O.STORE_BALANCES}>
        <DataTable
          columns={[
            { header: O.COL_STORE, key: "store", render: (r) => <span className="flex items-center gap-3"><StoreAvatar size="size-8 text-xs" store={r.store} />{r.store.name}</span> },
            { align: "right", header: O.COL_OPEN_ENTRIES, key: "openEntries" },
            { align: "right", header: O.COL_OPEN_AMOUNT, key: "openAmount", render: (r) => <Money value={r.openAmount} /> },
            { align: "right", header: O.IN_RETURN_WINDOW, key: "pending", render: (r) => formatCurrency(r.pending) },
            { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "generate", render: (r) => (
              <span className="flex justify-end">
                <Button disabled={r.openEntries === 0} loading={busy === r.store.slug} onClick={() => generate(r.store)} size="sm" variant={r.openEntries ? "primary" : "ghost"}>
                  <Receipt className="size-4" />{O.GENERATE}
                </Button>
              </span>
            ) },
          ]}
          rowKey="key"
          rows={[...data.stores].sort((a, b) => b.openAmount - a.openAmount).map((r) => ({ ...r, key: r.store.slug }))}
        />
      </Panel>

      <Panel title={O.SETTLEMENT_HISTORY}>
        <Tabs onChange={setTab} tabs={TABS.map(([value, label, test]) => ({ count: data.settlements.filter(test).length, label, value }))} value={tab} />
        <div className="mt-4">
          {rows.length === 0 ? <EmptyState icon={Wallet} title={O.NO_RESULTS} /> : (
            <DataTable
              columns={[
                { header: O.COL_SETTLEMENT, key: "number", render: (s) => <><span className="font-mono text-xs font-semibold">{s.number}</span><span className="block text-xs text-muted">{O.SHIPMENT_COUNT(s.subOrderNumbers.length)}</span></> },
                { header: O.COL_STORE, key: "storeSlug", render: (s) => storeOf(s.storeSlug)?.name ?? s.storeSlug },
                { header: O.COL_PERIOD_END, key: "periodEnd", render: (s) => formatDate(s.periodEnd) },
                { align: "right", header: O.COL_NET, key: "net", render: (s) => <Money className="font-semibold" value={s.net} /> },
                { header: O.COL_STATUS, key: "status", render: (s) => <StatusBadge status={s.status} /> },
                { header: "UTR", key: "utr", render: (s) => <span className="font-mono text-xs">{s.utr ?? "—"}</span> },
                { header: O.COL_PAID_ON, key: "paidAt", render: (s) => (s.paidAt && s.status === "paid" ? formatDate(s.paidAt) : "—") },
                { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "actions", render: (s) => (
                  <span className="flex justify-end gap-1">
                    {s.status === "approved" && <Button onClick={() => setPaying(s)} size="sm">{O.MARK_PAID}</Button>}
                    <Button aria-label={`${O.STATEMENT} ${s.number}`} onClick={() => download(s, "statement")} size="sm" title={O.STATEMENT} variant="ghost"><FileText className="size-4" /><span className="hidden 2xl:inline">{O.STATEMENT}</span></Button>
                    <Button aria-label={`${O.COMMISSION_INVOICE} ${s.number}`} onClick={() => download(s, "invoice")} size="sm" title={O.COMMISSION_INVOICE} variant="ghost"><Receipt className="size-4" /><span className="hidden 2xl:inline">{O.COMMISSION_INVOICE}</span></Button>
                  </span>
                ) },
              ]}
              rows={rows}
            />
          )}
        </div>
      </Panel>

      {paying && (
        <PromptDialog
          body={O.PAY_SETTLEMENT_BODY(formatCurrency(paying.net), storeOf(paying.storeSlug)?.name)}
          confirmLabel={O.MARK_PAID}
          key={paying.id}
          label={O.UTR_LABEL}
          loading={busy === "pay"}
          multiline={false}
          onCancel={() => setPaying(null)}
          onConfirm={async (utr) => {
            setBusy("pay");
            try {
              await markSettlementPaid(paying.id, utr);
              await refresh();
              successToast(O.SETTLEMENT_PAID(paying.number));
              setPaying(null);
            } catch (err) {
              errorToast(getErrorMessage(err));
            } finally {
              setBusy(null);
            }
          }}
          open
          placeholder="HDFC0000918273"
          title={O.MARK_SETTLEMENT_PAID}
        />
      )}
    </div>
  );
}
