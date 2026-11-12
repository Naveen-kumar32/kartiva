import { useState } from "react";

import { getReports } from "@/api";
import { Button, ColumnChart, DataTable, ErrorState, ExportMenu, FormInput, MiniStat, PageHeader, Panel, Skeleton, Tabs } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { downloadTable } from "@/utils/documents";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";

const T = EN.ADMIN_TOOLS;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const PRESETS = [[7, T.LAST_7], [30, T.LAST_30], [90, T.LAST_90]];

const money = (key, header) => ({ align: "right", header, key, money: true, render: (r) => formatCurrency(r[key], { decimals: true }) });
const num = (key, header) => ({ align: "right", header, key, render: (r) => formatNumber(r[key]) });

const REPORTS = {
  byCategory: { columns: [{ header: T.CATEGORY_COL, key: "key" }, num("items", T.UNITS), money("gmv", "GMV")], label: T.BY_CATEGORY },
  byDay: { chart: true, columns: [{ header: EN.TABLE.DATE, key: "key", render: (r) => formatDate(r.key) }, num("orders", T.SHIPMENTS), num("items", T.UNITS), money("gmv", "GMV"), money("tax", "GST"), money("commission", EN.ADMIN.COMMISSION)], label: T.BY_DAY },
  byPayment: { columns: [{ header: EN.TABLE.METHOD, key: "key" }, num("orders", T.SHIPMENTS), money("gmv", "GMV"), money("commission", EN.ADMIN.COMMISSION)], label: T.BY_PAYMENT },
  byStore: { columns: [{ header: EN.ADMIN.STORE, key: "key" }, num("orders", T.SHIPMENTS), num("items", T.UNITS), money("gmv", "GMV"), money("tax", "GST"), money("commission", EN.ADMIN.COMMISSION)], label: T.BY_STORE },
  gst: { columns: [{ header: T.STATE, key: "key" }, money("taxable", T.TAXABLE), money("cgst", "CGST"), money("sgst", "SGST"), money("igst", "IGST")], label: T.GST_REPORT },
  tcsTds: { columns: [{ header: EN.ADMIN.STORE, key: "key" }, { header: "GSTIN", key: "gstin" }, money("gross", T.GROSS), money("taxable", T.TAXABLE), money("tcs", "TCS"), money("tds", "TDS")], label: T.TCS_TDS },
};

export function AdminReports() {
  useDocumentTitle(EN.ADMIN.NAV_REPORTS);
  const [range, setRange] = useState({ from: daysAgo(30), to: daysAgo(0) });
  const [tab, setTab] = useState("byDay");
  const { data, error, loading, reload } = useAsync(() => getReports(range), [range.from, range.to]);
  const report = REPORTS[tab];
  const rows = data?.[tab] ?? [];
  const subtitle = `${formatDate(range.from)} – ${formatDate(range.to)}`;
  const file = `kartiva-${tab}-${range.from}-to-${range.to}`;
  // Excel keeps money as numbers; CSV/PDF get fixed 2-decimal strings.
  const exportReport = (format) => downloadTable(format, `${file}.csv`, report.columns.map((c) => ({ header: c.header, value: (r) => (c.money && format !== "xlsx" ? r[c.key].toFixed(2) : r[c.key]) })), rows, { subtitle, title: report.label });

  return (
    <div className="space-y-6">
      <PageHeader subtitle={T.REPORTS_SUBTITLE} title={EN.ADMIN.NAV_REPORTS} />
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          {PRESETS.map(([n, label]) => (
            <Button key={n} onClick={() => setRange({ from: daysAgo(n), to: daysAgo(0) })} size="sm" variant={range.from === daysAgo(n) && range.to === daysAgo(0) ? "primary" : "outline"}>{label}</Button>
          ))}
          <FormInput className="w-44" label={T.FROM} name="from" onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} type="date" value={range.from} />
          <FormInput className="w-44" label={T.TO} name="to" onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} type="date" value={range.to} />
        </div>
      </Panel>
      {error && <ErrorState message={error} onRetry={reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? Array.from({ length: 4 }, (_, i) => <Skeleton className="h-16 rounded-xl" key={i} />) : (
          <>
            <MiniStat label="GMV" value={formatCurrency(data.totals.gmv)} />
            <MiniStat label={T.ORDERS_COL} value={formatNumber(data.totals.orders)} />
            <MiniStat label={EN.ADMIN.COMMISSION} tone="success" value={formatCurrency(data.totals.commission)} />
            <MiniStat label={T.GST_COLLECTED} value={formatCurrency(data.totals.tax)} />
          </>
        )}
      </div>
      <Panel>
        <Tabs className="mb-4" onChange={setTab} tabs={Object.entries(REPORTS).map(([value, r]) => ({ label: r.label, value }))} value={tab} />
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <ExportMenu disabled={!rows.length} onExport={exportReport} />
        </div>
        {loading ? <Skeleton className="h-64 w-full" /> : (
          <>
            {report.chart && rows.length > 1 && (
              <div className="mb-6"><ColumnChart labels={[...rows].reverse().map((r) => formatDate(r.key, { day: "numeric", month: "short" }))} series={[{ name: "GMV", values: [...rows].reverse().map((r) => r.gmv) }]} /></div>
            )}
            <DataTable columns={report.columns} empty={T.NO_DATA} rowKey="key" rows={rows} />
            {tab === "tcsTds" && <p className="mt-3 text-xs text-muted">{T.TCS_NOTE}</p>}
          </>
        )}
      </Panel>
    </div>
  );
}
