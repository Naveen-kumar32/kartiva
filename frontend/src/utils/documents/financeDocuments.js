// Settlement statement (to seller), commission tax invoice (platform → seller) and generic PDF report.
import { amountInWords } from "../orderMath";
import { block, footer, newDoc, pdfDate, rs, save, table, totals } from "./pdfKit";

const LABELS = {
  ad_charge: "Advertising charges", cod_collected_by_seller: "COD cash collected by seller", commission: "Marketplace commission",
  commission_gst: "GST on commission", payout: "Payout", refund: "Refunds to buyers", sale: "Item sales", shipping: "Delivery fees", tcs: "TCS (GST s.52)", tds: "TDS (s.194-O)",
};

export function downloadSettlementStatement({ entries, platform, settlement, store }) {
  const { doc, W, y } = newDoc({ subtitle: settlement.number, title: "SETTLEMENT STATEMENT" });
  block(doc, 36, y, "Seller", [store.name, `GSTIN: ${store.gstin}`, `${store.city}, ${store.state}`]);
  block(doc, 300, y, "Settlement", [`No: ${settlement.number}`, `Period ending: ${pdfDate(settlement.periodEnd)}`, `Status: ${settlement.status.replace(/_/g, " ")}`, settlement.utr && `UTR: ${settlement.utr}`, settlement.paidAt && `Paid on: ${pdfDate(settlement.paidAt)}`]);
  const summary = Object.entries(settlement.breakdown ?? entries.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + e.amount }), {}));
  let end = table(doc, y + 96, ["Summary", "Amount"], summary.map(([k, v]) => [LABELS[k] ?? k, rs(v)]), { columnStyles: { 1: { halign: "right" } } });
  end = totals(doc, end, [...(settlement.carriedIn ? [["Carried forward in", rs(settlement.carriedIn)]] : []), ["Net payable", rs(settlement.net), true]], W);
  doc.setFontSize(9);
  doc.text(amountInWords(Math.abs(settlement.net)), 36, end + 4, { maxWidth: W - 72 });
  if (entries.length) table(doc, end + 22, ["Date", "Type", "Description", "Amount"], entries.map((e) => [pdfDate(e.date), LABELS[e.type] ?? e.type, e.description, rs(e.amount)]), { columnStyles: { 3: { halign: "right" } } });
  footer(doc, `${platform.legalName} · GSTIN ${platform.gstin} · Statement generated ${pdfDate(new Date().toISOString())}. Questions: ${platform.supportEmail}`);
  save(doc, `Settlement_${settlement.number}_${store.slug}.pdf`);
}

export function downloadCommissionInvoice({ platform, settlement, store }) {
  const commission = Math.abs(settlement.breakdown?.commission ?? 0);
  const interstate = store.gstStateCode !== platform.gstin.slice(0, 2);
  const gst = (commission * platform.commissionGstRate) / 100;
  const { doc, W, y } = newDoc({ subtitle: `KTV/COM/26-27/${String(settlement.id).padStart(5, "0")}`, title: "TAX INVOICE — COMMISSION" });
  block(doc, 36, y, "Supplier (service provider)", [platform.legalName, platform.address, `GSTIN: ${platform.gstin}`]);
  block(doc, 300, y, "Recipient", [store.name, `GSTIN: ${store.gstin}`, `${store.city}, ${store.state}`]);
  const end = table(doc, y + 100, ["Description", "SAC", "Taxable", interstate ? "IGST" : "CGST + SGST", "Total"], [[
    `Marketplace commission for settlement ${settlement.number}`, "998599", rs(commission), `${rs(gst)} @${platform.commissionGstRate}%`, rs(commission + gst),
  ]]);
  totals(doc, end, [["Taxable value", rs(commission)], [interstate ? "IGST" : "CGST + SGST", rs(gst)], ["Total", rs(commission + gst), true]], W);
  doc.setFontSize(9);
  doc.text(amountInWords(commission + gst), 36, end + 70, { maxWidth: W - 72 });
  footer(doc, "Commission and GST on commission are deducted from the seller payout. Computer generated invoice.");
  save(doc, `CommissionInvoice_${settlement.number}.pdf`);
}

/** Generic tabular PDF report: columns [{ header, key, money? }] */
export function downloadReportPdf({ columns, filename, rows, subtitle, title }) {
  const { doc, y } = newDoc({ orientation: columns.length > 6 ? "landscape" : "portrait", subtitle, title: title.toUpperCase() });
  table(doc, y, columns.map((c) => c.header), rows.map((r) => columns.map((c) => (c.money ? rs(r[c.key]) : r[c.key] ?? ""))), {
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, c.money ? { halign: "right" } : {}])),
  });
  footer(doc, `Kartiva admin report · generated ${pdfDate(new Date().toISOString())}`);
  save(doc, filename);
}
