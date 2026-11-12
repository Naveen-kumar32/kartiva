// One layout for every Kartiva PDF (invoices, receipts, credit notes, statements, letters, reports, tax sheets):
//   • page 1: full letterhead of the issuer (Kartiva, or the seller for seller-issued GST documents) + title row
//   • pages 2…n: compact running header (logo, name, document title + number)
//   • every page: footer with the issuer's legal line, the document note and "Page X of Y"
//   • tables repeat their header row on each page and never run into the footer
// jsPDF's built-in fonts have no ₹ glyph, so PDFs print amounts as "Rs. 1,234.00".
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

import { PLATFORM } from "@/data";

export const BRAND = [14, 124, 123];
export const ACCENT = [245, 158, 11];
export const INK = [15, 23, 42];
export const MUTED = [100, 116, 139];
export const RULE = [226, 232, 240];
export const M = 40; // left/right page margin
const CONT_TOP = 78; // where content starts on pages 2…n (below the running header)
const FOOTER_SPACE = 66; // reserved at the bottom of every page for the footer

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export const rs = (n) => `Rs. ${inr.format(Number(n) || 0)}`;
export const pdfDate = (iso) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(iso));
const hexRgb = (hex = "#0e7c7b") => { const h = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };
const meta = (doc) => doc.__kartiva;

// ---------- Letterheads ----------
function kartivaMark(doc, x, y, size) {
  doc.setFillColor(...BRAND);
  doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, "F");
  doc.setFillColor(255, 255, 255);
  doc.triangle(x + size * 0.25, y + size * 0.32, x + size * 0.75, y + size * 0.32, x + size * 0.65, y + size * 0.75, "F");
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(size * 0.06);
  doc.line(x + size * 0.37, y + size * 0.32, x + size * 0.37, y + size * 0.2);
  doc.line(x + size * 0.63, y + size * 0.32, x + size * 0.63, y + size * 0.2);
  doc.line(x + size * 0.37, y + size * 0.2, x + size * 0.63, y + size * 0.2);
  doc.setLineWidth(1);
}

/** Kartiva company letterhead (logo, legal name, registered office, GSTIN/CIN, contact). Returns content y. */
export function drawLetterhead(doc, platform = PLATFORM) {
  const W = doc.internal.pageSize.getWidth();
  kartivaMark(doc, M, 34, 40);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Kartiva", M + 52, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Every seller. One cart.", M + 52, 66);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(platform.legalName ?? "Kartiva", W - M, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const right = [
    ...doc.splitTextToSize(platform.address ?? "", 290),
    [platform.gstin && `GSTIN ${platform.gstin}`, platform.cin && `CIN ${platform.cin}`].filter(Boolean).join(" · "),
    [platform.supportPhone, platform.supportEmail, platform.website].filter(Boolean).join(" · "),
  ].filter(Boolean);
  doc.text(right, W - M, 52, { align: "right" });
  const ruleY = Math.max(86, 52 + right.length * 10 + 6);
  doc.setFillColor(...BRAND);
  doc.rect(M, ruleY, W - 2 * M, 2.5, "F");
  doc.setFillColor(...ACCENT);
  doc.rect(M, ruleY + 2.5, 90, 2.5, "F");
  doc.setTextColor(...INK);
  return ruleY + 28;
}

/** Seller letterhead for seller-issued GST documents (the seller is the legal supplier). Returns content y. */
export function drawSellerLetterhead(doc, store, platform = PLATFORM) {
  const W = doc.internal.pageSize.getWidth();
  const color = hexRgb(store.color);
  doc.setFillColor(...color);
  doc.rect(0, 0, W, 6, "F");
  doc.roundedRect(M, 30, 42, 42, 9, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(store.initials ?? String(store.name).slice(0, 2).toUpperCase(), M + 21, 57, { align: "center" });
  doc.setTextColor(...INK);
  doc.setFontSize(16);
  doc.text(store.name, M + 54, 45);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text([store.address ?? `${store.city}, ${store.state}`, `GSTIN ${store.gstin}${store.gstStateCode ? ` · State code ${store.gstStateCode}` : ""}`, [store.phone, store.ownerEmail].filter(Boolean).join(" · ")].filter(Boolean), M + 54, 58);
  doc.setFillColor(...BRAND);
  doc.roundedRect(W - M - 104, 34, 104, 16, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text(`Sold via ${platform.website ?? "Kartiva"}`, W - M - 52, 45, { align: "center" });
  doc.setDrawColor(...RULE);
  doc.line(M, 94, W - M, 94);
  doc.setTextColor(...INK);
  return 116;
}

/** Compact header on pages 2…n (and on labels). */
function drawRunningHeader(doc) {
  const { issuer, number, title } = meta(doc);
  const W = doc.internal.pageSize.getWidth();
  if (issuer.kind === "seller") {
    doc.setFillColor(...hexRgb(issuer.store.color));
    doc.rect(0, 0, W, 4, "F");
    doc.roundedRect(M, 22, 24, 24, 5, 5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(issuer.store.initials ?? String(issuer.store.name).slice(0, 2).toUpperCase(), M + 12, 38, { align: "center" });
  } else {
    kartivaMark(doc, M, 22, 24);
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(issuer.kind === "seller" ? issuer.store.name : "Kartiva", M + 32, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text([title, number].filter(Boolean).join(" · "), W - M, 38, { align: "right" });
  doc.setDrawColor(...RULE);
  doc.line(M, 56, W - M, 56);
  doc.setTextColor(...INK);
}

/**
 * Start a document. issuer: { kind: "platform" } (default) or { kind: "seller", store }.
 * title/number/date appear in the title row on page 1 and in the running header after that.
 * compact: true → running header only (shipping labels). Returns { doc, W, H, y }.
 */
export function createDoc({ compact = false, date, issuer = { kind: "platform" }, number, orientation = "portrait", platform = PLATFORM, title }) {
  const doc = new jsPDF({ format: "a4", orientation, unit: "pt" });
  doc.__kartiva = { finalized: false, issuer, note: "", number, platform, title };
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  if (compact) {
    drawRunningHeader(doc);
    return { doc, H, W, y: CONT_TOP };
  }
  let y = issuer.kind === "seller" ? drawSellerLetterhead(doc, issuer.store, platform) : drawLetterhead(doc, platform);
  if (title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text(title, M, y);
    const right = [number, date && pdfDate(date)].filter(Boolean).join(" · ");
    if (right) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(right, W - M, y, { align: "right" });
    }
    doc.setTextColor(...INK);
    y += 24;
  }
  return { doc, H, W, y };
}

/** Back-compat: Kartiva-letterhead document with a title (subtitle = document number). */
export const newDoc = ({ orientation = "portrait", subtitle, title }) => createDoc({ number: subtitle, orientation, title });

/** Start a new page if `needed` points don't fit above the footer. Returns the y to continue at. */
export function ensureSpace(doc, y, needed = 40) {
  const H = doc.internal.pageSize.getHeight();
  if (y + needed <= H - FOOTER_SPACE) return y;
  doc.addPage();
  return CONT_TOP;
}

/** Wrapped paragraph that flows onto new pages. Returns the y after it. */
export function paragraph(doc, text, y, { lineHeight = 13, maxWidth } = {}) {
  const W = doc.internal.pageSize.getWidth();
  const lines = doc.splitTextToSize(String(text ?? ""), maxWidth ?? W - 2 * M);
  let yy = y;
  for (const line of lines) {
    yy = ensureSpace(doc, yy, lineHeight);
    doc.text(line, M, yy);
    yy += lineHeight;
  }
  return yy;
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
  const { margin, ...rest } = opts;
  autoTable(doc, {
    body, head: [head], margin: { bottom: FOOTER_SPACE, left: M, right: M, top: CONT_TOP, ...margin }, rowPageBreak: "avoid", showHead: "everyPage",
    startY: ensureSpace(doc, y, 60),
    headStyles: { fillColor: BRAND, fontSize: 8.5, textColor: 255 }, styles: { cellPadding: 5, fontSize: 8.5, textColor: INK },
    alternateRowStyles: { fillColor: [246, 248, 250] }, theme: "grid", ...rest,
  });
  return doc.lastAutoTable.finalY;
}

export function totals(doc, y, rows, W) {
  let yy = ensureSpace(doc, y + 14, rows.length * 16 + 10);
  rows.forEach(([label, value, bold]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(...INK);
    doc.text(label, W - M - 180, yy);
    doc.text(value, W - M, yy, { align: "right" });
    yy += bold ? 18 : 14;
  });
  return yy;
}

// ---------- Footer + finishing ----------
function legalLine(doc) {
  const { issuer, platform } = meta(doc);
  if (issuer.kind === "seller") {
    const s = issuer.store;
    return `${s.name} · GSTIN ${s.gstin} · ${s.address ?? `${s.city}, ${s.state}`} · Sold via Kartiva (${platform.legalName}, GSTIN ${platform.gstin})`;
  }
  return [platform.legalName, platform.cin && `CIN ${platform.cin}`, platform.gstin && `GSTIN ${platform.gstin}`, platform.address, platform.supportEmail].filter(Boolean).join(" · ");
}

/** Draws running headers (pages 2…n) and the footer on every page. Called automatically by save()/finish(). */
export function finalize(doc) {
  const m = meta(doc);
  if (!m || m.finalized) return;
  m.finalized = true;
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const legal = doc.splitTextToSize(legalLine(doc), W - 2 * M - 70);
  const note = m.note ? doc.splitTextToSize(`${m.note} This is a computer-generated document.`, W - 2 * M - 70) : doc.splitTextToSize("This is a computer-generated document.", W - 2 * M - 70);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) drawRunningHeader(doc);
    doc.setDrawColor(...RULE);
    doc.line(M, H - 54, W - M, H - 54);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(legal.slice(0, 2), M, H - 42);
    doc.text(note.slice(0, 2), M, H - 42 + Math.min(2, legal.length) * 8.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 42, { align: "right" });
  }
  doc.setTextColor(...INK);
}

/** Back-compat: set the document note shown in every footer, then finalize. */
export function footer(doc, note) {
  if (meta(doc)) meta(doc).note = note ?? "";
  finalize(doc);
}

const cleanName = (filename) => filename.replace(/[^\w.-]+/g, "_");
export const save = (doc, filename) => { finalize(doc); doc.save(cleanName(filename)); };

// Download the PDF, or return { blob, filename } when the caller wants to email/attach it.
export function finish(doc, filename, output) {
  finalize(doc);
  if (output === "blob") return { blob: doc.output("blob"), filename: cleanName(filename) };
  doc.save(cleanName(filename));
  return null;
}
