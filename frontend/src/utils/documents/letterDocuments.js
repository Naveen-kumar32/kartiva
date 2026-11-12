// Company letterhead documents: letters, order summaries and payment receipts.
// Every generator accepts { output: "blob" } to return { blob, filename } for emailing instead of downloading.
import { amountInWords } from "../orderMath";
import { BRAND, createDoc, ensureSpace, finish, footer, INK, MUTED, paragraph, pdfDate, rs, table } from "./pdfKit";

// Kartiva letterhead lives in pdfKit (shared by every document); re-exported for older imports.
export { drawLetterhead } from "./pdfKit";

const newLetterDoc = (platform, opts = {}) => createDoc({ platform, ...opts });

/** Blank company letterhead (for printing). */
export function downloadBlankLetterhead({ platform }, { output } = {}) {
  const { doc } = newLetterDoc(platform);
  return finish(doc, "Kartiva_Letterhead.pdf", output);
}

/** letter: { date, reference, toName, toAddress, subject, salutation, body, closing, signatoryName, signatoryTitle } */
export function downloadLetter({ letter, platform }, { output } = {}) {
  const { doc, W, y: startY } = newLetterDoc(platform);
  let y = startY;
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  if (letter.reference) doc.text(`Ref: ${letter.reference}`, 40, y);
  doc.text(`Date: ${pdfDate(letter.date ?? new Date().toISOString())}`, W - 40, y, { align: "right" });
  y += 26;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.text("To,", 40, y);
  y += 14;
  doc.text(letter.toName || "", 40, y);
  doc.setFont("helvetica", "normal");
  const addr = doc.splitTextToSize(letter.toAddress || "", 260);
  doc.text(addr, 40, y + 13);
  y += 13 + addr.length * 12 + 18;
  if (letter.subject) {
    doc.setFont("helvetica", "bold");
    const subj = doc.splitTextToSize(`Subject: ${letter.subject}`, W - 80);
    doc.text(subj, 40, y);
    y += subj.length * 13 + 12;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(letter.salutation || "Dear Sir/Madam,", 40, y);
  y += 20;
  for (const para of String(letter.body ?? "").split(/\n\s*\n/)) {
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    y = paragraph(doc, para.replace(/\n/g, " ").trim(), y, { lineHeight: 15 }) + 8;
  }
  y = ensureSpace(doc, y, 110);
  y += 10;
  doc.text(letter.closing || "Yours sincerely,", 40, y);
  doc.setFont("helvetica", "bold");
  doc.text(`For ${platform.legalName}`, 40, y + 18);
  doc.setDrawColor(203, 213, 225);
  doc.line(40, y + 58, 200, y + 58);
  doc.text(letter.signatoryName || "Authorised Signatory", 40, y + 72);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (letter.signatoryTitle) doc.text(letter.signatoryTitle, 40, y + 85);
  return finish(doc, `Letter_${(letter.reference || letter.subject || "Kartiva").slice(0, 40)}.pdf`, output);
}

const addressText = (a) => [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} - ${a.pincode}`, a.phone && `Phone ${a.phone}`].filter(Boolean);
const PAYMENT_LABEL = { cod: "Cash on Delivery", online: "Online — Razorpay (UPI / card / net banking)" };

function infoGrid(doc, y, W, left, right) {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text(left.title.toUpperCase(), 40, y);
  doc.text(right.title.toUpperCase(), W / 2 + 10, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(left.lines, 40, y + 14);
  doc.text(right.lines, W / 2 + 10, y + 14);
  return y + 14 + Math.max(left.lines.length, right.lines.length) * 12 + 14;
}


/** Order summary on letterhead. Pass `subs` to limit it to some shipments (e.g. a seller's own). */
export function downloadOrderSummary({ order, platform, subs }, { output } = {}) {
  const shipments = subs ?? order.subOrders;
  const { doc, W, y: startY } = newLetterDoc(platform, { date: order.createdAt, number: `Order ${order.number}`, title: "ORDER SUMMARY" });
  let y = startY;
  y = infoGrid(doc, y, W,
    { lines: [order.buyer.name, order.buyer.email, ...addressText(order.address).slice(1)], title: "Customer & delivery address" },
    { lines: [`Order no: ${order.number}`, `Placed: ${pdfDate(order.createdAt)}`, `Payment: ${PAYMENT_LABEL[order.paymentMethod]}`, `Payment status: ${order.paymentStatus.replace(/_/g, " ")}`, `Shipments: ${shipments.length}`, order.gstin && `Buyer GSTIN: ${order.gstin}`].filter(Boolean), title: "Order details" });

  for (const sub of shipments) {
    y = ensureSpace(doc, y, 90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`${sub.number} · ${sub.storeName}`, 40, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`${sub.status.toUpperCase()} · ${sub.method.name}${sub.trackingNumber ? ` · ${sub.carrier} ${sub.trackingNumber}` : ""}${sub.invoiceNumber ? ` · Invoice ${sub.invoiceNumber}` : ""}`, 40, y + 12, { maxWidth: W - 80 });
    y = table(doc, y + 20, ["Item", "Variant", "Qty", "Price", "Amount"], [
      ...sub.items.map((it) => [it.name, it.variantLabel || "—", it.quantity, rs(it.price), rs(it.lineTotal)]),
      ["Delivery", "", "", "", sub.fee ? rs(sub.fee) : "FREE"],
    ], { columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } } }) + 18;
  }
  y = ensureSpace(doc, y, 90);

  const total = shipments.reduce((t, s) => t + s.total, 0);
  const gst = shipments.reduce((t, s) => t + s.tax.cgst + s.tax.sgst + s.tax.igst, 0);
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  [["GST included", rs(gst)], ["Order total", rs(total)]].forEach(([l, v], i) => {
    doc.setFont("helvetica", i === 1 ? "bold" : "normal");
    doc.text(l, W - 220, y + i * 16);
    doc.text(v, W - 40, y + i * 16, { align: "right" });
  });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text(amountInWords(total), 40, y + 44, { maxWidth: W - 80 });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  footer(doc, "This is an order summary, not a tax invoice. GST invoices are issued by each seller when the shipment is dispatched.");
  return finish(doc, `OrderSummary_${order.number}.pdf`, output);
}

/** Payment receipt on letterhead, including refunds for this order. */
export function downloadPaymentReceipt({ order, platform, refunds = [] }, { output } = {}) {
  const { doc, W, y: startY } = newLetterDoc(platform, { date: order.createdAt, number: `Receipt RCPT-${order.number.slice(4)}`, title: "PAYMENT RECEIPT" });
  const orderRefunds = refunds.filter((r) => r.orderNumber === order.number);
  const refunded = orderRefunds.filter((r) => r.status === "processed").reduce((t, r) => t + r.amount, 0);
  const cod = order.paymentMethod === "cod";
  const collected = cod ? order.subOrders.filter((s) => s.status === "delivered").reduce((t, s) => t + s.total, 0) : order.grandTotal;
  let y = startY;
  y = infoGrid(doc, y, W,
    { lines: [order.buyer.name, order.buyer.email, order.buyer.phone && `Phone ${order.buyer.phone}`].filter(Boolean), title: "Received from" },
    { lines: [`Receipt no: RCPT-${order.number.slice(4)}`, `Date: ${pdfDate(order.createdAt)}`, `Against order: ${order.number}`, `Mode: ${PAYMENT_LABEL[order.paymentMethod]}`, `Reference: ${cod ? "Collected by sellers on delivery" : `pay_${order.number.replace(/\W/g, "").slice(-12)}`}`], title: "Payment details" });

  // highlighted amount box
  doc.setFillColor(236, 253, 249);
  doc.setDrawColor(...BRAND);
  doc.roundedRect(40, y, W - 80, 58, 8, 8, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(cod ? "AMOUNT COLLECTED (CASH ON DELIVERY)" : "AMOUNT RECEIVED", 56, y + 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND);
  doc.text(rs(collected), 56, y + 44);
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(order.paymentStatus.replace(/_/g, " ").toUpperCase(), W - 56, y + 36, { align: "right" });
  y += 78;

  y = table(doc, y, ["Shipment", "Seller", "Status", "Amount"], order.subOrders.map((s) => [s.number, s.storeName, s.status, rs(s.total)]), { columnStyles: { 3: { halign: "right" } } }) + 16;
  if (orderRefunds.length) {
    y = table(doc, y, ["Refund", "Reason", "Method", "Status", "Reference", "Amount"], orderRefunds.map((r) => [
      r.subOrderNumber, r.reason.replace(/_/g, " "), r.method === "gateway" ? "Original payment" : "Bank / UPI", r.status, r.utr ?? "pending", rs(r.amount),
    ]), { columnStyles: { 5: { halign: "right" } }, headStyles: { fillColor: [100, 116, 139] } }) + 16;
  }
  y = ensureSpace(doc, y, 110);
  doc.setFontSize(10);
  [["Order total", rs(order.grandTotal)], [cod ? "Collected so far" : "Paid", rs(collected)], ["Refunded", rs(refunded)], ["Net amount", rs(collected - refunded)]].forEach(([l, v], i) => {
    doc.setFont("helvetica", i === 3 ? "bold" : "normal");
    doc.text(l, W - 220, y + i * 16);
    doc.text(v, W - 40, y + i * 16, { align: "right" });
  });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text(amountInWords(Math.max(0, collected - refunded)), 40, y + 80, { maxWidth: W - 80 });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  footer(doc, "Receipt — no signature required. Card and UPI details are never stored by Kartiva.");
  return finish(doc, `PaymentReceipt_${order.number}.pdf`, output);
}
