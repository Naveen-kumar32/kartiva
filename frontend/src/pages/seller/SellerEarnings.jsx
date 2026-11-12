import { Banknote, CreditCard, FileText, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { getSellerEarnings } from "@/api";
import { Button, DataTable, ErrorState, ExportMenu, MiniStat, PageHeader, PageLoader, Panel, Select, StatusBadge } from "@/components";
import { PLATFORM } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { formatCurrency, formatDate } from "@/utils";

const H = EN.SELLER_HUB;

export function SellerEarnings() {
  useDocumentTitle(EN.SELLER.NAV_EARNINGS);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload } = useAsync(() => getSellerEarnings(storeSlug), [storeSlug]);
  const [type, setType] = useState("all");

  const entries = useMemo(() => (data?.entries ?? []).filter((e) => type === "all" || e.type === type), [data, type]);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { balance, pending, settlements, store } = data;
  const lastPayout = data.entries.find((e) => e.type === "payout");
  const commission = data.entries.filter((e) => e.type === "commission").reduce((t, e) => t + e.amount, 0);
  const types = [...new Set(data.entries.map((e) => e.type))];

  const docs = async (kind, settlement) => {
    const m = await import("@/utils/documents");
    if (kind === "statement") m.downloadSettlementStatement({ entries: data.entries.filter((e) => e.settlementId === settlement.id && e.type !== "payout"), platform: PLATFORM, settlement, store });
    else m.downloadCommissionInvoice({ platform: PLATFORM, settlement, store });
  };
  const exportList = async (format) => {
    const { downloadTable } = await import("@/utils/documents");
    await downloadTable(format, `kartiva-ledger-${storeSlug}.csv`, [
      { header: "Date", value: (e) => e.date.slice(0, 10) }, { header: "Type", key: "type" }, { header: "Description", key: "description" },
      { header: "Amount", key: "amount" }, { header: "Settlement", value: (e) => settlements.find((s) => s.id === e.settlementId)?.number ?? "Unsettled" },
    ], entries, { title: EN.SELLER.NAV_EARNINGS });
  };

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu onExport={exportList} />} subtitle={H.EARNINGS_SUBTITLE} title={EN.SELLER.NAV_EARNINGS} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label={EN.SELLER.BALANCE} tone={balance < 0 ? "danger" : "success"} value={formatCurrency(balance, { decimals: true })} />
        <MiniStat label={H.PENDING_IN_WINDOW} tone="warning" value={formatCurrency(pending, { decimals: true })} />
        <MiniStat label={H.LAST_PAYOUT} value={lastPayout ? `${formatCurrency(-lastPayout.amount)} · ${formatDate(lastPayout.date)}` : "—"} />
        <MiniStat label={H.TOTAL_COMMISSION} value={formatCurrency(-commission, { decimals: true })} />
      </div>

      <Panel title={H.HOW_MONEY_FLOWS}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-brand-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-brand-800"><CreditCard aria-hidden className="size-4" />{H.FLOW_ONLINE_TITLE}</p>
            <p className="mt-1 text-ink/80">{H.FLOW_ONLINE(PLATFORM.defaultReturnWindowDays)}</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-amber-800"><Banknote aria-hidden className="size-4" />{H.FLOW_COD_TITLE}</p>
            <p className="mt-1 text-ink/80">{H.FLOW_COD}</p>
          </div>
        </div>
        <p className="mt-3 flex gap-2 text-xs text-muted"><Info aria-hidden className="size-4 shrink-0" />{H.DEDUCTIONS_NOTE(PLATFORM.commissionGstRate, PLATFORM.tcsRate, PLATFORM.tdsRate)}</p>
      </Panel>

      <Panel title={H.SETTLEMENTS}>
        <DataTable
          columns={[
            { header: H.SETTLEMENT, key: "number", render: (s) => <span className="font-mono text-xs font-semibold">{s.number}</span> },
            { header: H.PERIOD_END, key: "periodEnd", render: (s) => formatDate(s.periodEnd) },
            { header: EN.TABLE.STATUS, key: "status", render: (s) => <StatusBadge status={s.status} /> },
            { header: "UTR", key: "utr", render: (s) => <span className="font-mono text-xs">{s.utr ?? "—"}</span> },
            { align: "right", header: H.NET, key: "net", render: (s) => <span className={s.net < 0 ? "text-red-600" : ""}>{formatCurrency(s.net, { decimals: true })}</span> },
            { header: "", key: "docs", render: (s) => (
              <span className="flex justify-end gap-1">
                <Button onClick={() => docs("statement", s)} size="sm" variant="ghost"><FileText className="size-4" />{H.STATEMENT}</Button>
                <Button onClick={() => docs("commission", s)} size="sm" variant="ghost"><FileText className="size-4" />{H.COMMISSION_INVOICE}</Button>
              </span>
            ) },
          ]}
          empty={H.NO_SETTLEMENTS}
          rows={settlements}
        />
      </Panel>

      <Panel
        action={(
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{EN.TABLE.TYPE}</span>
            <Select ariaLabel={EN.TABLE.TYPE} className="w-48" onChange={setType} options={[{ label: EN.COMMON.ALL, value: "all" }, ...types.map((t) => ({ label: H.LEDGER_TYPES[t] ?? t, value: t }))]} size="sm" value={type} />
          </label>
        )}
        title={EN.SELLER.LEDGER}
      >
        <DataTable
          columns={[
            { header: EN.TABLE.DATE, key: "date", render: (e) => formatDate(e.date) },
            { header: EN.TABLE.TYPE, key: "type", render: (e) => H.LEDGER_TYPES[e.type] ?? e.type },
            { header: EN.TABLE.DESCRIPTION, key: "description" },
            { header: H.SETTLEMENT, key: "settlementId", render: (e) => settlements.find((s) => s.id === e.settlementId)?.number ?? <span className="text-amber-700">{H.UNSETTLED}</span> },
            { align: "right", header: EN.TABLE.AMOUNT, key: "amount", render: (e) => <span className={e.amount < 0 ? "text-red-600" : "text-emerald-700"}>{e.amount < 0 ? "−" : "+"}{formatCurrency(Math.abs(e.amount), { decimals: true })}</span> },
          ]}
          rowKey="key"
          rows={entries.map((e, i) => ({ ...e, key: `${e.type}-${e.date}-${i}` }))}
        />
      </Panel>
    </div>
  );
}
