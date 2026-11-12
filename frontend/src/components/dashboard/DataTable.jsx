// Simple responsive table. columns: [{ key, header, render?, align?, className? }]
// onRowClick (optional) makes rows clickable — keyboard accessible via Enter.
// rowClassName (optional): (row) => extra classes, e.g. to highlight new rows.
export function DataTable({ columns, empty = "—", onRowClick, rowClassName, rowKey = "id", rows }) {
  return (
    <div className="relative -mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-y border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => <th className={`px-5 py-2.5 font-semibold ${c.align === "right" ? "text-right" : ""}`} key={c.key} scope="col">{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 && <tr><td className="px-5 py-8 text-center text-muted" colSpan={columns.length}>{empty}</td></tr>}
          {rows.map((row) => (
            <tr
              className={`hover:bg-slate-50/70 ${onRowClick ? "cursor-pointer" : ""} ${rowClassName?.(row) ?? ""}`}
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((c) => (
                <td className={`px-5 py-3 ${c.align === "right" ? "text-right tabular" : ""} ${c.className ?? ""}`} key={c.key}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
