import { FileDown, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { getTaxCentre } from "@/api";
import { Button, DataTable, ErrorState, ExportMenu, MiniStat, PageHeader, Panel, Select, Skeleton } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, getErrorMessage } from "@/utils";
import { downloadGstr8Working, downloadTable } from "@/utils/documents";

const P = EN.ADMIN_PRO.TAX;
const money = (key, header) => ({ align: "right", header, key, render: (r) => formatCurrency(r[key], { decimals: true }) });
const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC", year: "numeric" });
const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);
const withTotal = (rows, keys, label) => (rows.length ? [...rows, { ...Object.fromEntries(keys.map((k) => [k, sum(rows, k)])), isTotal: true, name: label, slug: "_total", stream: "_total" }] : rows);

// Excel keeps amounts as numbers; CSV/PDF get fixed 2-decimal strings.
function TableExport({ columns, file, rows, subtitle, title }) {
  const run = (format) => downloadTable(format, file, columns.map((c) => ({ header: c.header, value: (r) => (typeof r[c.key] === "number" && format !== "xlsx" ? r[c.key].toFixed(2) : r[c.key]) })), rows, { subtitle, title });
  return <ExportMenu disabled={!rows.length} onExport={run} />;
}

export function AdminTax() {
  useDocumentTitle(P.TITLE);
  const [month, setMonth] = useState("");
  const { data, error, loading, reload } = useAsync(() => getTaxCentre(month), [month]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  const m = data.month;
  const gstRows = data.platformGst.map((r) => ({ ...r, label: P.STREAM[r.stream], total: r.cgst + r.sgst + r.igst }));
  const gstCols = [{ header: P.STREAM_COL, key: "label", render: (r) => (r.isTotal ? <b>{P.TOTAL}</b> : r.label) }, money("taxable", P.TAXABLE), money("cgst", "CGST 9%"), money("sgst", "SGST 9%"), money("igst", "IGST 18%"), money("total", P.GST_TOTAL)];
  const tcsCols = [
    { header: P.SELLER, key: "name", render: (r) => (r.isTotal ? <b>{r.name}</b> : <>{r.name}<span className="block font-mono text-xs text-muted">{r.gstin}</span></>) },
    money("gross", P.GROSS), money("returns", P.RETURNS), money("net", P.NET), money("tcsIgst", "TCS IGST"), money("tcsCgst", "TCS CGST"), money("tcsSgst", "TCS SGST"), money("tcsTotal", P.TCS_TOTAL),
  ];
  const tdsCols = [{ header: P.SELLER, key: "name", render: (r) => (r.isTotal ? <b>{r.name}</b> : r.name) }, { header: "PAN", key: "pan", render: (r) => <span className="font-mono text-xs">{r.pan ?? ""}</span> }, money("grossSales", P.GROSS_SALES), money("tds", P.TDS_COL(data.platform.tdsRate))];
  const summaryCols = [
    { header: P.SELLER, key: "name", render: (r) => (r.isTotal ? <b>{r.name}</b> : <>{r.name}<span className="block text-xs text-muted">{r.state}</span></>) },
    { header: "GSTIN", key: "gstin", render: (r) => <span className="font-mono text-xs">{r.gstin ?? ""}</span> },
    { header: P.PAN_COL, key: "pan", render: (r) => <span className="font-mono text-xs">{r.pan ?? ""}</span> },
    { align: "right", header: P.SHIPMENTS, key: "orders" }, money("net", P.NET), money("tcsTotal", "TCS"), money("tds", "TDS"), money("withheld", P.WITHHELD),
  ];
  const sellers = data.sellers.map((r) => ({ ...r, withheld: r.tcsTotal + r.tds }));
  const totalTcs = sum(sellers, "tcsTotal");
  const totalTds = sum(sellers, "tds");
  const totalGst = sum(gstRows, "total");
  const file = (name) => `kartiva-${name}-${m}.csv`;
  const pdf = () => {
    try { downloadGstr8Working({ month: m, platform: data.platform, rows: sellers }); } catch (err) { errorToast(getErrorMessage(err)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={(
          <>
            <label className="flex items-center gap-2 text-sm"><span className="text-muted">{P.MONTH}</span>
              <Select ariaLabel={P.MONTH} className="w-44" onChange={setMonth} options={data.months.map((x) => ({ label: monthLabel(x), value: x }))} size="sm" value={m} />
            </label>
            <Button disabled={!sellers.length} onClick={pdf}><FileDown className="size-4" />{P.GSTR8_PDF}</Button>
          </>
        )}
        subtitle={P.SUBTITLE}
        title={P.TITLE}
      />
      <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{P.SAMPLE_NOTE}</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat label={P.KPI_GST} value={formatCurrency(totalGst)} />
        <MiniStat label={P.KPI_TCS} value={formatCurrency(totalTcs)} />
        <MiniStat label={P.KPI_TDS} value={formatCurrency(totalTds)} />
        <MiniStat label={P.KPI_SELLERS} value={sellers.length} />
      </div>

      <Panel action={<TableExport columns={gstCols} file={file("gst-platform-fees")} rows={gstRows} subtitle={monthLabel(m)} title={P.GST_TITLE} />} title={P.GST_TITLE}>
        <p className="mb-3 text-xs text-muted">{P.GST_NOTE(data.platform.commissionGstRate)}</p>
        <DataTable columns={gstCols} rowKey="stream" rows={withTotal(gstRows, ["taxable", "cgst", "sgst", "igst", "total"], P.TOTAL)} />
      </Panel>

      <Panel action={<TableExport columns={tcsCols} file={file("gstr8-tcs")} rows={sellers} subtitle={monthLabel(m)} title={P.TCS_TITLE} />} title={P.TCS_TITLE}>
        <p className="mb-3 text-xs text-muted">{P.TCS_NOTE(data.platform.tcsRate, data.platform.tcsRate / 2)}</p>
        <DataTable columns={tcsCols} empty={P.NO_SALES} rowKey="slug" rows={withTotal(sellers, ["gross", "returns", "net", "tcsIgst", "tcsCgst", "tcsSgst", "tcsTotal"], P.TOTAL)} />
      </Panel>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel className="min-w-0" action={<TableExport columns={tdsCols} file={file("tds-194o")} rows={sellers} subtitle={monthLabel(m)} title={P.TDS_TITLE} />} title={P.TDS_TITLE}>
          <p className="mb-3 text-xs text-muted">{P.TDS_NOTE(data.platform.tdsRate)}</p>
          <DataTable columns={tdsCols} empty={P.NO_SALES} rowKey="slug" rows={withTotal(sellers, ["grossSales", "tds"], P.TOTAL)} />
        </Panel>
        <Panel className="min-w-0" action={<TableExport columns={summaryCols} file={file("seller-tax-summary")} rows={sellers} subtitle={monthLabel(m)} title={P.SUMMARY_TITLE} />} title={P.SUMMARY_TITLE}>
          <p className="mb-3 text-xs text-muted">{P.PAN_NOTE}</p>
          <DataTable columns={summaryCols} empty={P.NO_SALES} rowKey="slug" rows={withTotal(sellers, ["orders", "net", "tcsTotal", "tds", "withheld"], P.TOTAL)} />
        </Panel>
      </div>
    </div>
  );
}
