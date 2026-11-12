// GST tax invoice, credit note, packing slip and shipping label for a seller sub-order.
import { amountInWords } from "../orderMath";
import { block, createDoc, ensureSpace, finish, footer, MUTED, pdfDate, rs, save, table, totals } from "./pdfKit";

const addressLines = (a) => [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} - ${a.pincode}`, a.phone && `Phone: ${a.phone}`];

/** Tax invoice issued in the SELLER's name (marketplace model), on the seller's letterhead. output "blob" returns { blob, filename }. */
export function downloadTaxInvoice({ order, platform, store, sub }, { output } = {}) {
  const { doc, W, y } = createDoc({ date: sub.shippedAt ?? order.createdAt, issuer: { kind: "seller", store }, number: sub.invoiceNumber ?? "Invoice issued on dispatch", platform, title: "TAX INVOICE" });
  const leftEnd = block(doc, 40, y, "Sold by", [store.name, `${store.city}, ${store.state}`, `GSTIN: ${store.gstin}`, `State code: ${store.gstStateCode}`]);
  block(doc, 300, y, "Invoice details", [
    `Invoice no: ${sub.invoiceNumber ?? "—"}`, `Invoice date: ${pdfDate(sub.shippedAt ?? order.createdAt)}`, `Order no: ${order.number}`,
    `Shipment: ${sub.number}`, `Order date: ${pdfDate(order.createdAt)}`, `Payment: ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Prepaid (Razorpay)"}`,
  ]);
  const y2 = Math.max(leftEnd, y + 90) + 10;
  const billEnd = block(doc, 40, y2, "Bill to / Ship to", [...addressLines(order.address), order.gstin && `Buyer GSTIN: ${order.gstin}`]);
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
  yy = ensureSpace(doc, yy, 90);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(amountInWords(sub.total), 40, yy + 4, { maxWidth: W - 80 });
  yy += 34;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`For ${store.name}`, W - 40, yy + 10, { align: "right" });
  doc.text("Authorised signatory", W - 40, yy + 24, { align: "right" });
  footer(doc, "Original for recipient. Prices are inclusive of GST. Tax payable on reverse charge: No. Goods sold are the responsibility of the seller.");
  return finish(doc, `Invoice_${sub.invoiceNumber ?? sub.number}.pdf`, output);
}

export function downloadCreditNote({ order, platform, ret, store, sub }) {
  const { doc, W, y } = createDoc({ date: ret.timeline.at(-1).at, issuer: { kind: "seller", store }, number: ret.creditNoteNumber ?? ret.number, platform, title: "CREDIT NOTE" });
  block(doc, 40, y, "Issued by", [store.name, `GSTIN: ${store.gstin}`, `${store.city}, ${store.state}`]);
  block(doc, 300, y, "Reference", [`Credit note: ${ret.creditNoteNumber ?? "—"}`, `Against invoice: ${sub.invoiceNumber ?? "—"}`, `Return: ${ret.number}`, `Date: ${pdfDate(ret.timeline.at(-1).at)}`]);
  const by = block(doc, 40, y + 90, "Customer", addressLines(order.address));
  const item = sub.items.find((i) => i.variantId === ret.items[0].variantId) ?? sub.items[0];
  const share = (ret.items[0].quantity * item.price) / item.lineTotal;
  const end = table(doc, by + 10, ["Item", "HSN", "Qty", "Taxable", sub.interstate ? "IGST" : "CGST + SGST", "Credit"], [[
    `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}`, item.hsn, ret.items[0].quantity, rs(item.taxable * share),
    rs((sub.interstate ? item.igst : item.cgst + item.sgst) * share), rs(ret.refundAmount),
  ]]);
  totals(doc, end, [["Total credit", rs(ret.refundAmount), true]], W);
  doc.setFontSize(9);
  doc.text(amountInWords(ret.refundAmount), 40, end + 50, { maxWidth: W - 80 });
  footer(doc, `Reason: ${ret.reasonCode.replace(/_/g, " ")}. Refund via ${order.paymentMethod === "cod" ? "bank/UPI transfer" : "original payment method"}. ${platform.legalName}`);
  save(doc, `CreditNote_${ret.creditNoteNumber ?? ret.number}.pdf`);
}

export function downloadPackingSlip({ order, platform, store, sub }) {
  const { doc, W, y } = createDoc({ date: order.createdAt, issuer: { kind: "seller", store }, number: sub.number, platform, title: "PACKING SLIP" });
  block(doc, 40, y, "Ship to", addressLines(order.address));
  block(doc, 300, y, "From", [store.name, `${store.city}, ${store.state}`, `Order ${order.number}`, `Placed ${pdfDate(order.createdAt)}`, `Delivery: ${sub.method.name}`]);
  const end = table(doc, y + 110, ["", "Item", "Variant", "SKU", "Qty"], sub.items.map((it) => ["[  ]", it.name, it.variantLabel || "—", it.sku, it.quantity]));
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(order.paymentMethod === "cod" ? `COLLECT CASH: ${rs(sub.total)}` : "PREPAID — do not collect cash", 40, end + 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Packed by: ____________________     Checked by: ____________________", 40, end + 60);
  footer(doc, "Tick each item as you pack it. Include the tax invoice inside the parcel.");
  save(doc, `PackingSlip_${sub.number}.pdf`);
  return W;
}

export function downloadShippingLabel({ order, platform, store, sub }) {
  const { doc } = createDoc({ compact: true, issuer: { kind: "seller", store }, number: sub.number, platform, title: "SHIPPING LABEL" });
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
  footer(doc, "Stick on the outside of the parcel.");
  save(doc, `Label_${sub.number}.pdf`);
}
