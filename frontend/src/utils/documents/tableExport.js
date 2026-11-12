// One export for every table in the app: PDF (on the Kartiva letterhead), Excel (.xlsx) or CSV.
// columns: [{ header, key? , value?(row) }] — same shape downloadCsv already uses everywhere.
import { downloadCsv } from "./csv";
import { downloadReportPdf } from "./financeDocuments";

export const EXPORT_FORMATS = ["pdf", "xlsx", "csv"];

const baseName = (filename) => filename.replace(/\.(csv|xlsx|pdf)$/i, "");
const titleFrom = (filename) => baseName(filename).replace(/^kartiva-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const cellOf = (col, row) => (col.value ? col.value(row) : row[col.key]);

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { download: filename, href: url });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Excel sheets: title, subtitle, header row (bold), data (numbers stay numbers so totals/filters work in Excel).
export async function toXlsxBlob(sheets) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const build = ({ columns, rows, subtitle, title }) => {
    const data = [
      [{ fontWeight: "bold", value: title }],
      ...(subtitle ? [[{ value: subtitle }]] : []),
      [],
      columns.map((c) => ({ fontWeight: "bold", value: String(c.header) })),
      ...rows.map((r) => columns.map((c) => {
        const v = cellOf(c, r);
        if (typeof v === "number" && Number.isFinite(v)) return { format: Number.isInteger(v) ? "0" : "#,##0.00", type: Number, value: v };
        return { value: v == null ? "" : String(v) };
      })),
    ];
    const widths = columns.map((c) => ({ width: Math.min(48, Math.max(10, String(c.header).length + 4, ...rows.slice(0, 50).map((r) => String(cellOf(c, r) ?? "").length + 2))) }));
    return { columns: widths, data };
  };
  const built = sheets.map(build);
  const writer = built.length === 1
    ? writeExcelFile(built[0].data, { columns: built[0].columns })
    : writeExcelFile(built.map((b, i) => ({ columns: b.columns, data: b.data, sheet: (sheets[i].sheet ?? `Sheet ${i + 1}`).slice(0, 31) })));
  return writer.toBlob();
}

export async function downloadTable(format, filename, columns, rows, { subtitle, title } = {}) {
  const name = baseName(filename);
  const heading = title ?? titleFrom(filename);
  const generated = `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}`;
  if (format === "csv") return downloadCsv(`${name}.csv`, columns, rows);
  if (format === "xlsx") return saveBlob(await toXlsxBlob([{ columns, rows, subtitle: subtitle ?? generated, title: `Kartiva — ${heading}` }]), `${name}.xlsx`);
  // PDF: letterhead header + table (landscape for wide tables)
  const keyed = rows.map((r) => Object.fromEntries(columns.map((c, i) => [`c${i}`, cellOf(c, r) ?? ""])));
  return downloadReportPdf({ columns: columns.map((c, i) => ({ header: String(c.header), key: `c${i}` })), filename: `${name}.pdf`, rows: keyed, subtitle: subtitle ?? generated, title: heading });
}
