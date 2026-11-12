// CSV export that opens cleanly in Excel (UTF-8 BOM, quoted cells, formula-injection guard).
const cell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** columns: [{ header, key | value(row) }] */
export function downloadCsv(filename, columns, rows) {
  const lines = [columns.map((c) => cell(c.header)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value ? c.value(r) : r[c.key])).join(","))];
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { download: filename, href: url });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
