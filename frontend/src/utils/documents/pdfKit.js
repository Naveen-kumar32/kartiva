// Shared jsPDF building blocks for every Kartiva document (invoices, slips, statements, reports).
// jsPDF's built-in fonts have no ₹ glyph, so PDFs print amounts as "Rs. 1,234.00".
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export const BRAND = [14, 124, 123];
export const INK = [15, 23, 42];
export const MUTED = [100, 116, 139];
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export const rs = (n) => `Rs. ${inr.format(Number(n) || 0)}`;
export const pdfDate = (iso) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(iso));

export function newDoc({ orientation = "portrait", subtitle, title }) {
  const doc = new jsPDF({ format: "a4", orientation, unit: "pt" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 64, "F");
  // logo mark
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(36, 18, 28, 28, 6, 6, "F");
  doc.setFillColor(...BRAND);
  doc.triangle(43, 27, 57, 27, 54, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Kartiva", 72, 39);
  doc.setFontSize(13);
  doc.text(title, W - 36, 33, { align: "right" });
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle, W - 36, 48, { align: "right" });
  }
  doc.setTextColor(...INK);
  return { doc, W, y: 88 };
}

export function block(doc, x, y, heading, lines, width = 240) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(heading.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  let yy = y + 14;
  lines.filter(Boolean).forEach((line, i) => {
    if (i === 0) doc.setFont("helvetica", "bold");
    const wrapped = doc.splitTextToSize(String(line), width);
    doc.text(wrapped, x, yy);
    yy += wrapped.length * 12;
    doc.setFont("helvetica", "normal");
  });
  return yy;
}

export function table(doc, y, head, body, opts = {}) {
  autoTable(doc, {
    body, head: [head], margin: { left: 36, right: 36 }, startY: y,
    headStyles: { fillColor: BRAND, fontSize: 8.5, textColor: 255 }, styles: { cellPadding: 5, fontSize: 8.5, textColor: INK },
    alternateRowStyles: { fillColor: [246, 248, 250] }, theme: "grid", ...opts,
  });
  return doc.lastAutoTable.finalY;
}

export function totals(doc, y, rows, W) {
  let yy = y + 14;
  rows.forEach(([label, value, bold]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.text(label, W - 200, yy);
    doc.text(value, W - 36, yy, { align: "right" });
    yy += bold ? 18 : 14;
  });
  return yy;
}

export function footer(doc, text) {
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(36, H - 44, W - 36, H - 44);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(text, 36, H - 30, { maxWidth: W - 140 });
    doc.text(`Page ${i} of ${pages}`, W - 36, H - 30, { align: "right" });
  }
}

const cleanName = (filename) => filename.replace(/[^\w.-]+/g, "_");
export const save = (doc, filename) => doc.save(cleanName(filename));

// Download the PDF, or return { blob, filename } when the caller wants to email/attach it.
export function finish(doc, filename, output) {
  if (output === "blob") return { blob: doc.output("blob"), filename: cleanName(filename) };
  doc.save(cleanName(filename));
  return null;
}
