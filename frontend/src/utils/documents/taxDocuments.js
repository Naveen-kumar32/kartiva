// Tax centre working papers (admin): GSTR-8 (TCS u/s 52) working for a month. SAMPLE computation.
import { createDoc, ensureSpace, footer, INK, MUTED, rs, save, table } from "./pdfKit";

const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC", year: "numeric" });

/** rows: [{ name, gstin, gross, returns, net, tcsIgst, tcsCgst, tcsSgst, tcsTotal }] */
export function downloadGstr8Working({ month, platform, rows }) {
  const { doc, W, y: startY } = createDoc({ number: monthLabel(month), orientation: "landscape", platform, title: "GSTR-8 WORKING — TCS u/s 52" });
  let y = startY - 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`E-commerce operator: ${platform.legalName} · GSTIN ${platform.gstin} · TCS rate ${platform.tcsRate}% (IGST ${platform.tcsRate}% inter-state; CGST ${platform.tcsRate / 2}% + SGST ${platform.tcsRate / 2}% intra-state)`, 40, y + 16, { maxWidth: W - 80 });
  doc.setTextColor(...INK);
  y += 34;
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  const body = rows.map((r, i) => [i + 1, r.name, r.gstin, rs(r.gross), rs(r.returns), rs(r.net), rs(r.tcsIgst), rs(r.tcsCgst), rs(r.tcsSgst), rs(r.tcsTotal)]);
  body.push(["", "Total", "", rs(sum("gross")), rs(sum("returns")), rs(sum("net")), rs(sum("tcsIgst")), rs(sum("tcsCgst")), rs(sum("tcsSgst")), rs(sum("tcsTotal"))]);
  const money = Object.fromEntries([3, 4, 5, 6, 7, 8, 9].map((i) => [i, { halign: "right" }]));
  const end = table(doc, y, ["#", "Supplier (seller)", "GSTIN", "Gross taxable supplies", "Returns", "Net taxable", "TCS IGST", "TCS CGST", "TCS SGST", "Total TCS"], body, {
    columnStyles: money, didParseCell: (d) => { if (d.section === "body" && d.row.index === body.length - 1) d.cell.styles.fontStyle = "bold"; },
  });
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text([
    "SAMPLE COMPUTATION — verify with your Chartered Accountant before filing.",
    "Taxable value excludes GST (prices are GST-inclusive). Returns are the taxable portion of refunds processed in the month.",
    `TCS deposited by the 10th of the following month; GSTR-8 due by the 10th. Generated ${new Date().toLocaleDateString("en-IN")}.`,
  ], 40, ensureSpace(doc, end + 20, 40));
  footer(doc, `GSTR-8 working ${month} · Internal document — sample computation, verify with your CA.`);
  save(doc, `GSTR8_working_${month}.pdf`);
}
