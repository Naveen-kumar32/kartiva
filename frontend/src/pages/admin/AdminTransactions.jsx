import { ArrowDownLeft, ArrowUpRight, CircleCheck, CircleDashed, Landmark } from "lucide-react";
import { useMemo, useState } from "react";

import { getTransactions } from "@/api";
import { Button, DataTable, EmptyState, ErrorState, ExportMenu, MiniStat, PageHeader, PageLoader, Pagination, Panel, SearchInput } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, formatCurrency, formatDate, formatNumber } from "@/utils";
import { downloadTable } from "@/utils/documents";

import { FilterBar, FilterSelect, Pill } from "./opsShared";

const P = EN.ADMIN_PRO.TRANSACTIONS;
const C = EN.ADMIN_PRO.COMMON;
const TYPES = ["payment", "cod", "refund", "payout", "commission", "ad", "membership"];
const STATUS_TONE = { captured: "info", pending: "warning", reconciled: "success" };
const PAGE = 25;

function Amount({ value }) {
  const Icon = value < 0 ? ArrowUpRight : ArrowDownLeft;
  return (
    <span className={cn("inline-flex items-center justify-end gap-1 whitespace-nowrap font-semibold tabular", value < 0 ? "text-red-600" : "text-emerald-700")}>
      <Icon aria-hidden className="size-3.5" /><span className="sr-only">{value < 0 ? P.OUT : P.IN}</span>{value < 0 ? "−" : "+"}{formatCurrency(Math.abs(value), { decimals: true })}
    </span>
  );
}

export function AdminTransactions() {
  useDocumentTitle(P.TITLE);
  const { data, error, loading, reload } = useAsync(getTransactions, []);
  const [f, setF] = useState({ from: "", q: "", status: "", to: "", type: "" });
  const [page, setPage] = useState(1);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };

  const rows = useMemo(() => {
    const term = f.q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => (!f.type || r.type === f.type) && (!f.status || r.status === f.status)
      && (!f.from || r.date.slice(0, 10) >= f.from) && (!f.to || r.date.slice(0, 10) <= f.to)
      && (!term || r.reference.toLowerCase().includes(term) || r.party.toLowerCase().includes(term)));
  }, [data, f]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const inflow = rows.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0);
  const outflow = rows.filter((r) => r.amount < 0).reduce((t, r) => t + r.amount, 0);
  const pending = rows.filter((r) => r.status === "pending").length;
  const rec = data.reconciliation;
  const exportList = (format) => downloadTable(format, `kartiva-transactions${f.type ? `-${f.type}` : ""}.csv`, [
    { header: C.DATE, value: (r) => r.date.slice(0, 10) }, { header: P.COL_TYPE, value: (r) => P.TYPE[r.type] }, { header: P.COL_REF, key: "reference" }, { header: P.COL_PARTY, key: "party" },
    { header: P.COL_METHOD, value: (r) => P.METHOD[r.method] ?? r.method }, { header: P.COL_AMOUNT, value: (r) => r.amount.toFixed(2) }, { header: C.STATUS, value: (r) => P.STATUS[r.status] },
  ], rows, { title: P.TITLE });
  const filtered = Object.values(f).some(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu onExport={exportList} size="md" />} subtitle={P.SUBTITLE} title={P.TITLE} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat label={P.MONEY_IN} tone="success" value={formatCurrency(inflow)} />
        <MiniStat label={P.MONEY_OUT} tone="danger" value={formatCurrency(Math.abs(outflow))} />
        <MiniStat label={P.NET} value={formatCurrency(inflow + outflow)} />
        <MiniStat label={P.PENDING} tone={pending ? "warning" : undefined} value={`${formatNumber(pending)} / ${formatNumber(rows.length)}`} />
      </div>

      <Panel title={P.RECON}>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_2fr]">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4"><CircleCheck aria-hidden className="size-8 text-emerald-600" /><div><p className="text-2xl font-bold tabular">{formatNumber(rec.matched)}</p><p className="text-xs text-emerald-900">{P.MATCHED}</p></div></div>
          <div className={cn("flex items-center gap-3 rounded-xl p-4", rec.unmatched.length ? "bg-amber-50" : "bg-slate-50")}><CircleDashed aria-hidden className={cn("size-8", rec.unmatched.length ? "text-amber-600" : "text-slate-400")} /><div><p className="text-2xl font-bold tabular">{formatNumber(rec.unmatched.length)}</p><p className="text-xs">{P.UNMATCHED}</p></div></div>
          <div className="text-sm">
            <p>{P.RECON_BODY(formatNumber(rec.onlineOrders), formatCurrency(rec.capturedAmount))}</p>
            {rec.unmatched.length > 0 ? (
              <ul className="mt-2 space-y-1">{rec.unmatched.map((u) => <li className="flex justify-between gap-2 rounded bg-amber-50 px-2 py-1 text-xs" key={u.number}><span className="font-mono">{u.number}</span><span>{P.PENDING_CAPTURE} · {formatCurrency(u.amount)}</span></li>)}</ul>
            ) : <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CircleCheck aria-hidden className="size-4" />{P.ALL_MATCHED}</p>}
          </div>
        </div>
      </Panel>

      <Panel>
        <FilterBar>
          <SearchInput className="w-full sm:w-64" onChange={set("q")} placeholder={P.SEARCH} value={f.q} />
          <FilterSelect label={P.ALL_TYPES} onChange={set("type")} options={TYPES.map((t) => [t, P.TYPE[t]])} value={f.type} />
          <FilterSelect label={C.ALL_STATUSES} onChange={set("status")} options={Object.keys(STATUS_TONE).map((s) => [s, P.STATUS[s]])} value={f.status} />
          <label className="flex items-center gap-1.5 text-sm text-muted">{P.FROM}<input aria-label={P.FROM} className="h-10 rounded-lg border border-line bg-white px-2 text-sm text-ink" onChange={(e) => set("from")(e.target.value)} type="date" value={f.from} /></label>
          <label className="flex items-center gap-1.5 text-sm text-muted">{P.TO}<input aria-label={P.TO} className="h-10 rounded-lg border border-line bg-white px-2 text-sm text-ink" onChange={(e) => set("to")(e.target.value)} type="date" value={f.to} /></label>
          {filtered && <Button onClick={() => { setF({ from: "", q: "", status: "", to: "", type: "" }); setPage(1); }} size="sm" variant="ghost">{C.CLEAR_FILTERS}</Button>}
        </FilterBar>
        {rows.length === 0 ? <EmptyState body={C.NO_MATCHES_BODY} icon={Landmark} title={C.NO_MATCHES} /> : (
          <>
            <DataTable
              columns={[
                { header: C.DATE, key: "date", render: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.date)}</span> },
                { header: P.COL_TYPE, key: "type", render: (r) => <span className="whitespace-nowrap font-medium">{P.TYPE[r.type]}</span> },
                { header: P.COL_REF, key: "reference", render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
                { header: P.COL_PARTY, key: "party", render: (r) => <span className="block max-w-56 truncate" title={r.party}>{r.party}</span> },
                { header: P.COL_METHOD, key: "method", render: (r) => <span className="whitespace-nowrap text-xs text-muted">{P.METHOD[r.method] ?? r.method}</span> },
                { align: "right", header: P.COL_AMOUNT, key: "amount", render: (r) => <Amount value={r.amount} /> },
                { header: C.STATUS, key: "status", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{P.STATUS[r.status]}</Pill> },
              ]}
              rows={rows.slice((page - 1) * PAGE, page * PAGE)}
            />
            <p className="mt-3 text-xs text-muted">{P.SHOWING((page - 1) * PAGE + 1, Math.min(page * PAGE, rows.length), rows.length)}</p>
            <Pagination onChange={setPage} page={page} pageCount={Math.ceil(rows.length / PAGE)} />
          </>
        )}
      </Panel>
    </div>
  );
}
