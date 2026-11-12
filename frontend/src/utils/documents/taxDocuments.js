// Tax centre working papers (admin): GSTR-8 (TCS u/s 52) working for a month. SAMPLE computation.
import { jsPDF } from "jspdf";

import { drawLetterhead } from "./letterDocuments";
import { footer, INK, MUTED, rs, save, table } from "./pdfKit";

const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC", year: "numeric" });

/** rows: [{ name, gstin, gross, returns, net, tcsIgst, tcsCgst, tcsSgst, tcsTotal }] */
export function downloadGstr8Working({ month, platform, rows }) {
  const doc = new jsPDF({ format: "a4", orientation: "landscape", unit: "pt" });
  const W = doc.internal.pageSize.getWidth();
  let y = drawLetterhead(doc, platform);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(`GSTR-8 working — TCS u/s 52 of the CGST Act · ${monthLabel(month)}`, 40, y);
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
    columnStyles: money, didParseCell: (d) => { if (d.section === "body" && d.row.index === body.length - 1) d.cell.styles.fontStyle = "bold"; }, margin: { left: 40, right: 40 },
  });
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text([
    "SAMPLE COMPUTATION — verify with your Chartered Accountant before filing.",
    "Taxable value excludes GST (prices are GST-inclusive). Returns are the taxable portion of refunds processed in the month.",
    `TCS deposited by the 10th of the following month; GSTR-8 due by the 10th. Generated ${new Date().toLocaleDateString("en-IN")}.`,
  ], 40, end + 20);
  footer(doc, `${platform.legalName} · GSTR-8 working ${month} · Internal document`);
  save(doc, `GSTR8_working_${month}.pdf`);
}
