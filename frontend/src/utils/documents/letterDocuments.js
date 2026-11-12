// Company letterhead documents: letters, order summaries and payment receipts.
// Every generator accepts { output: "blob" } to return { blob, filename } for emailing instead of downloading.
import { jsPDF } from "jspdf";

import { amountInWords } from "../orderMath";
import { BRAND, finish, INK, MUTED, pdfDate, rs, table } from "./pdfKit";

/** Draws the Kartiva letterhead on the current page and returns the y where content can start. */
export function drawLetterhead(doc, platform) {
  const W = doc.internal.pageSize.getWidth();
  // logo
  doc.setFillColor(...BRAND);
  doc.roundedRect(40, 34, 40, 40, 9, 9, "F");
  doc.setFillColor(255, 255, 255);
  doc.triangle(50, 47, 70, 47, 66, 64, "F");
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(2.5);
  doc.line(55, 47, 55, 42);
  doc.line(65, 47, 65, 42);
  doc.line(55, 42, 65, 42);
  // company block
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Kartiva", 92, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Every seller. One cart.", 92, 66);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(platform.legalName, W - 40, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const right = [...doc.splitTextToSize(platform.address, 290), `GSTIN ${platform.gstin}${platform.cin ? ` · CIN ${platform.cin}` : ""}`, `${platform.supportPhone} · ${platform.supportEmail}${platform.website ? ` · ${platform.website}` : ""}`];
  doc.text(right, W - 40, 52, { align: "right" });
  // rule
  const ruleY = Math.max(86, 52 + right.length * 10 + 6);
  doc.setFillColor(...BRAND);
  doc.rect(40, ruleY, W - 80, 2.5, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(40, ruleY + 2.5, 90, 2.5, "F");
  doc.setTextColor(...INK);
  return ruleY + 30;
}

function letterFooter(doc, platform) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(40, H - 48, W - 40, H - 48);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${platform.legalName} · Registered office: ${platform.address}`, 40, H - 34, { maxWidth: W - 130 });
    doc.text(`Page ${i} of ${pages}`, W - 40, H - 34, { align: "right" });
  }
}

const newLetterDoc = (platform) => {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  return { doc, W: doc.internal.pageSize.getWidth(), y: drawLetterhead(doc, platform) };
};

/** Blank company letterhead (for printing). */
export function downloadBlankLetterhead({ platform }, { output } = {}) {
  const { doc } = newLetterDoc(platform);
  letterFooter(doc, platform);
  return finish(doc, "Kartiva_Letterhead.pdf", output);
}

/** letter: { date, reference, toName, toAddress, subject, salutation, body, closing, signatoryName, signatoryTitle } */
export function downloadLetter({ letter, platform }, { output } = {}) {
  const { doc, W, y: startY } = newLetterDoc(platform);
  const H = doc.internal.pageSize.getHeight();
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
    const lines = doc.splitTextToSize(para.replace(/\n/g, " ").trim(), W - 80);
    for (const line of lines) {
      if (y > H - 110) { doc.addPage(); y = drawLetterhead(doc, platform); doc.setFontSize(10.5); doc.setTextColor(...INK); }
      doc.text(line, 40, y);
      y += 15;
    }
    y += 8;
  }
  if (y > H - 150) { doc.addPage(); y = drawLetterhead(doc, platform); }
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
  letterFooter(doc, platform);
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

function titleBar(doc, y, W, title, sub) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(title, 40, y);
  if (sub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(sub, W - 40, y, { align: "right" });
  }
  return y + 22;
}

/** Order summary on letterhead. Pass `subs` to limit it to some shipments (e.g. a seller's own). */
export function downloadOrderSummary({ order, platform, subs }, { output } = {}) {
  const shipments = subs ?? order.subOrders;
  const { doc, W, y: startY } = newLetterDoc(platform);
  let y = titleBar(doc, startY, W, "ORDER SUMMARY", `Order ${order.number} · ${pdfDate(order.createdAt)}`);
  y = infoGrid(doc, y, W,
    { lines: [order.buyer.name, order.buyer.email, ...addressText(order.address).slice(1)], title: "Customer & delivery address" },
    { lines: [`Order no: ${order.number}`, `Placed: ${pdfDate(order.createdAt)}`, `Payment: ${PAYMENT_LABEL[order.paymentMethod]}`, `Payment status: ${order.paymentStatus.replace(/_/g, " ")}`, `Shipments: ${shipments.length}`, order.gstin && `Buyer GSTIN: ${order.gstin}`].filter(Boolean), title: "Order details" });

  for (const sub of shipments) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`${sub.number} · ${sub.storeName}`, 40, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`${sub.status.toUpperCase()} · ${sub.method.name}${sub.trackingNumber ? ` · ${sub.carrier} ${sub.trackingNumber}` : ""}${sub.invoiceNumber ? ` · Invoice ${sub.invoiceNumber}` : ""}`, W - 40, y, { align: "right" });
    y = table(doc, y + 8, ["Item", "Variant", "Qty", "Price", "Amount"], [
      ...sub.items.map((it) => [it.name, it.variantLabel || "—", it.quantity, rs(it.price), rs(it.lineTotal)]),
      ["Delivery", "", "", "", sub.fee ? rs(sub.fee) : "FREE"],
    ], { columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } }, margin: { left: 40, right: 40 } }) + 18;
    if (y > doc.internal.pageSize.getHeight() - 160) { doc.addPage(); y = drawLetterhead(doc, platform); }
  }

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
  doc.text("This is an order summary, not a tax invoice. GST invoices are issued by each seller when the shipment is dispatched.", 40, y + 64, { maxWidth: W - 80 });
  letterFooter(doc, platform);
  return finish(doc, `OrderSummary_${order.number}.pdf`, output);
}

/** Payment receipt on letterhead, including refunds for this order. */
export function downloadPaymentReceipt({ order, platform, refunds = [] }, { output } = {}) {
  const { doc, W, y: startY } = newLetterDoc(platform);
  const orderRefunds = refunds.filter((r) => r.orderNumber === order.number);
  const refunded = orderRefunds.filter((r) => r.status === "processed").reduce((t, r) => t + r.amount, 0);
  const cod = order.paymentMethod === "cod";
  const collected = cod ? order.subOrders.filter((s) => s.status === "delivered").reduce((t, s) => t + s.total, 0) : order.grandTotal;
  let y = titleBar(doc, startY, W, "PAYMENT RECEIPT", `Receipt RCPT-${order.number.slice(4)}`);
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

  y = table(doc, y, ["Shipment", "Seller", "Status", "Amount"], order.subOrders.map((s) => [s.number, s.storeName, s.status, rs(s.total)]), { columnStyles: { 3: { halign: "right" } }, margin: { left: 40, right: 40 } }) + 16;
  if (orderRefunds.length) {
    y = table(doc, y, ["Refund", "Reason", "Method", "Status", "Reference", "Amount"], orderRefunds.map((r) => [
      r.subOrderNumber, r.reason.replace(/_/g, " "), r.method === "gateway" ? "Original payment" : "Bank / UPI", r.status, r.utr ?? "pending", rs(r.amount),
    ]), { columnStyles: { 5: { halign: "right" } }, headStyles: { fillColor: [100, 116, 139] }, margin: { left: 40, right: 40 } }) + 16;
  }
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
  doc.text("Computer-generated receipt — no signature required. Card and UPI details are never stored by Kartiva.", 40, y + 98, { maxWidth: W - 80 });
  letterFooter(doc, platform);
  return finish(doc, `PaymentReceipt_${order.number}.pdf`, output);
}
