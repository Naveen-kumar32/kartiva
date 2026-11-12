// GST tax invoice, credit note, packing slip and shipping label for a seller sub-order.
import { amountInWords } from "../orderMath";
import { jsPDF } from "jspdf";

import { block, BRAND, finish, footer, INK, MUTED, newDoc, pdfDate, rs, save, table, totals } from "./pdfKit";

const addressLines = (a) => [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} - ${a.pincode}`, a.phone && `Phone: ${a.phone}`];

const hexRgb = (hex = "#0e7c7b") => { const h = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };

// Seller letterhead: the seller is the legal supplier, so the invoice carries the SELLER's name, address,
// GSTIN and contact; a small "Sold via Kartiva" mark identifies the marketplace.
function newInvoiceDoc({ platform, store, sub }) {
  const doc = new jsPDF({ format: "a4", orientation: "portrait", unit: "pt" });
  const W = doc.internal.pageSize.getWidth();
  const color = hexRgb(store.color);
  doc.setFillColor(...color);
  doc.rect(0, 0, W, 6, "F");
  doc.roundedRect(36, 26, 44, 44, 9, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(store.initials ?? store.name.slice(0, 2).toUpperCase(), 58, 54, { align: "center" });
  doc.setTextColor(...INK);
  doc.setFontSize(16);
  doc.text(store.name, 92, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text([store.address ?? `${store.city}, ${store.state}`, `GSTIN ${store.gstin} · State code ${store.gstStateCode}`, [store.phone, store.ownerEmail].filter(Boolean).join(" · ")].filter(Boolean), 92, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text("TAX INVOICE", W - 36, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text([`Invoice ${sub.invoiceNumber ?? "(issued on dispatch)"}`, "Original for recipient"], W - 36, 53, { align: "right" });
  doc.setFillColor(...BRAND);
  doc.roundedRect(W - 128, 70, 92, 15, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text(`Sold via ${platform.website ?? "Kartiva"}`, W - 82, 80, { align: "center" });
  doc.setDrawColor(226, 232, 240);
  doc.line(36, 96, W - 36, 96);
  doc.setTextColor(...INK);
  return { doc, W, y: 112 };
}

/** Tax invoice issued in the SELLER's name (marketplace model), on the seller's letterhead. output "blob" returns { blob, filename }. */
export function downloadTaxInvoice({ order, platform, store, sub }, { output } = {}) {
  const { doc, W, y } = newInvoiceDoc({ platform, store, sub });
  const leftEnd = block(doc, 36, y, "Sold by", [store.name, `${store.city}, ${store.state}`, `GSTIN: ${store.gstin}`, `State code: ${store.gstStateCode}`]);
  block(doc, 300, y, "Invoice details", [
    `Invoice no: ${sub.invoiceNumber ?? "—"}`, `Invoice date: ${pdfDate(sub.shippedAt ?? order.createdAt)}`, `Order no: ${order.number}`,
    `Shipment: ${sub.number}`, `Order date: ${pdfDate(order.createdAt)}`, `Payment: ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Prepaid (Razorpay)"}`,
  ]);
  const y2 = Math.max(leftEnd, y + 90) + 10;
  const billEnd = block(doc, 36, y2, "Bill to / Ship to", [...addressLines(order.address), order.gstin && `Buyer GSTIN: ${order.gstin}`]);
  block(doc, 300, y2, "Place of supply", [order.address.state, sub.interstate ? "Inter-state supply — IGST" : "Intra-state supply — CGST + SGST"]);

  const head = ["#", "Item", "HSN", "Qty", "Rate", "Taxable", ...(sub.interstate ? ["IGST"] : ["CGST", "SGST"]), "Total"];
  const body = sub.items.map((it, i) => [
    i + 1, `${it.name}${it.variantLabel ? `\n${it.variantLabel}` : ""}\nSKU ${it.sku}`, it.hsn, it.quantity, rs(it.price), rs(it.taxable),
    ...(sub.interstate ? [`${rs(it.igst)}\n@${it.gstRate}%`] : [`${rs(it.cgst)}\n@${it.gstRate / 2}%`, `${rs(it.sgst)}\n@${it.gstRate / 2}%`]), rs(it.lineTotal),
  ]);
  if (sub.fee) body.push(["", "Delivery charges", "9965", 1, rs(sub.fee), "", ...(sub.interstate ? [""] : ["", ""]), rs(sub.fee)]);
  const end = table(doc, Math.max(billEnd, y2 + 60) + 8, head, body, { columnStyles: { 1: { cellWidth: 150 } } });

  let yy = totals(doc, end, [
    ["Taxable value", rs(sub.tax.taxable)],
    ...(sub.interstate ? [["IGST", rs(sub.tax.igst)]] : [["CGST", rs(sub.tax.cgst)], ["SGST", rs(sub.tax.sgst)]]),
    ["Delivery", rs(sub.fee)],
    ["Invoice total", rs(sub.total), true],
  ], W);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(amountInWords(sub.total), 36, yy + 4, { maxWidth: W - 72 });
  yy += 34;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Prices are inclusive of GST. Whether tax is payable under reverse charge: No.", 36, yy);
  doc.text(`For ${store.name}`, W - 36, yy + 30, { align: "right" });
  doc.text("Authorised signatory (computer generated, no signature required)", W - 36, yy + 44, { align: "right" });
  footer(doc, `Sold via Kartiva marketplace (${platform.legalName}, GSTIN ${platform.gstin}). Goods sold are the responsibility of the seller. Support: ${platform.supportEmail}`);
  return finish(doc, `Invoice_${sub.invoiceNumber ?? sub.number}.pdf`, output);
}

export function downloadCreditNote({ order, platform, ret, store, sub }) {
  const { doc, W, y } = newDoc({ subtitle: `Credit note ${ret.creditNoteNumber ?? "—"}`, title: "CREDIT NOTE" });
  block(doc, 36, y, "Issued by", [store.name, `GSTIN: ${store.gstin}`, `${store.city}, ${store.state}`]);
  block(doc, 300, y, "Reference", [`Credit note: ${ret.creditNoteNumber ?? "—"}`, `Against invoice: ${sub.invoiceNumber ?? "—"}`, `Return: ${ret.number}`, `Date: ${pdfDate(ret.timeline.at(-1).at)}`]);
  const by = block(doc, 36, y + 90, "Customer", addressLines(order.address));
  const item = sub.items.find((i) => i.variantId === ret.items[0].variantId) ?? sub.items[0];
  const share = (ret.items[0].quantity * item.price) / item.lineTotal;
  const end = table(doc, by + 10, ["Item", "HSN", "Qty", "Taxable", sub.interstate ? "IGST" : "CGST + SGST", "Credit"], [[
    `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}`, item.hsn, ret.items[0].quantity, rs(item.taxable * share),
    rs((sub.interstate ? item.igst : item.cgst + item.sgst) * share), rs(ret.refundAmount),
  ]]);
  totals(doc, end, [["Total credit", rs(ret.refundAmount), true]], W);
  doc.setFontSize(9);
  doc.text(amountInWords(ret.refundAmount), 36, end + 50, { maxWidth: W - 72 });
  footer(doc, `Reason: ${ret.reasonCode.replace(/_/g, " ")}. Refund via ${order.paymentMethod === "cod" ? "bank/UPI transfer" : "original payment method"}. ${platform.legalName}`);
  save(doc, `CreditNote_${ret.creditNoteNumber ?? ret.number}.pdf`);
}

export function downloadPackingSlip({ order, store, sub }) {
  const { doc, W, y } = newDoc({ subtitle: sub.number, title: "PACKING SLIP" });
  block(doc, 36, y, "Ship to", addressLines(order.address));
  block(doc, 300, y, "From", [store.name, `${store.city}, ${store.state}`, `Order ${order.number}`, `Placed ${pdfDate(order.createdAt)}`, `Delivery: ${sub.method.name}`]);
  const end = table(doc, y + 110, ["", "Item", "Variant", "SKU", "Qty"], sub.items.map((it) => ["[  ]", it.name, it.variantLabel || "—", it.sku, it.quantity]));
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(order.paymentMethod === "cod" ? `COLLECT CASH: ${rs(sub.total)}` : "PREPAID — do not collect cash", 36, end + 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Packed by: ____________________     Checked by: ____________________", 36, end + 60);
  footer(doc, "Tick each item as you pack it. Include the tax invoice inside the parcel.");
  save(doc, `PackingSlip_${sub.number}.pdf`);
  return W;
}

export function downloadShippingLabel({ order, store, sub }) {
  const { doc } = newDoc({ subtitle: sub.number, title: "SHIPPING LABEL" });
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.5);
  doc.rect(36, 84, 300, 330);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("DELIVER TO", 48, 104);
  doc.setFontSize(13);
  const a = order.address;
  doc.text([a.fullName, a.line1, a.line2, `${a.city}, ${a.state}`].filter(Boolean), 48, 122);
  doc.setFontSize(26);
  doc.text(a.pincode, 48, 200);
  doc.setFontSize(10);
  doc.text(`Phone: ${a.phone}`, 48, 220);
  doc.line(36, 236, 336, 236);
  doc.setFontSize(9);
  doc.text("FROM", 48, 254);
  doc.setFont("helvetica", "normal");
  doc.text([store.name, `${store.city}, ${store.state}`], 48, 268);
  doc.line(36, 290, 336, 290);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`${sub.carrier ?? sub.method.name}  ${sub.trackingNumber ?? ""}`, 48, 312);
  doc.setFontSize(18);
  doc.text(order.paymentMethod === "cod" ? `COD ${rs(sub.total)}` : "PREPAID", 48, 346);
  // simple barcode-style stripes from the sub-order number
  [...sub.number].forEach((ch, i) => {
    const w = (ch.charCodeAt(0) % 3) + 1;
    doc.setFillColor(15, 23, 42);
    doc.rect(48 + i * 9, 362, w, 40, "F");
  });
  save(doc, `Label_${sub.number}.pdf`);
}
