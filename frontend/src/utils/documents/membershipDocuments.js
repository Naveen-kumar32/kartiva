// Membership (Gold / Platinum plan) tax invoice on the Kartiva letterhead. Kartiva is the supplier (Tamil Nadu):
// CGST + SGST for sellers registered in Tamil Nadu, IGST for everyone else.
import { amountInWords } from "../orderMath";
import { createDoc, ensureSpace, finish, footer, INK, MUTED, pdfDate, rs, table } from "./pdfKit";

const GST_RATE = 18;

/** subscription: { invoiceNumber, amount, startsAt, endsAt, paymentRef? }, plan: { name, code, leadCredits }, store, platform */
export function downloadMembershipInvoice({ plan, platform, store, subscription }, { output } = {}) {
  const { doc, W, y: startY } = createDoc({ date: subscription.startsAt, number: `Invoice ${subscription.invoiceNumber ?? "—"}`, platform, title: "TAX INVOICE" });
  let y = startY;

  const taxable = Number(subscription.amount) || 0;
  const intraState = (store.gstStateCode ?? store.gstin?.slice(0, 2)) === platform.gstin.slice(0, 2) || store.state === "Tamil Nadu";
  const gst = Math.round(taxable * GST_RATE) / 100;
  const half = Math.round((gst / 2) * 100) / 100;
  const total = taxable + gst;


  const left = [store.name, store.contactPerson && `Attn: ${store.contactPerson}`, store.address ?? `${store.city}, ${store.state}`, `GSTIN: ${store.gstin ?? "Unregistered"}`, `State: ${store.state} (${store.gstStateCode ?? "—"})`].filter(Boolean);
  const right = [
    `Invoice no: ${subscription.invoiceNumber ?? "—"}`, `Invoice date: ${pdfDate(subscription.startsAt)}`, `Place of supply: ${store.state}`,
    `Period: ${pdfDate(subscription.startsAt)} – ${subscription.endsAt ? pdfDate(subscription.endsAt) : "—"}`, subscription.paymentRef && `Payment ref: ${subscription.paymentRef}`,
  ].filter(Boolean);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text("BILLED TO", 40, y);
  doc.text("INVOICE DETAILS", W / 2 + 10, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(left, 40, y + 14);
  doc.text(right, W / 2 + 10, y + 14);
  y += 14 + Math.max(left.length, right.length) * 12 + 16;

  const taxCols = intraState ? ["CGST 9%", "SGST 9%"] : ["IGST 18%"];
  const taxVals = intraState ? [rs(half), rs(gst - half)] : [rs(gst)];
  y = table(doc, y, ["Description", "SAC", "Taxable value", ...taxCols, "Total"], [[
    `Kartiva ${plan.name} membership — 12 months${plan.leadCredits == null ? " (unlimited buy-request quotes)" : ` (${plan.leadCredits} buy-request quotes / month)`}`, "998599", rs(taxable), ...taxVals, rs(total),
  ]], { columnStyles: Object.fromEntries([2, 3, 4, 5].map((i) => [i, { halign: "right" }])), margin: { left: 40, right: 40 } }) + 18;

  y = ensureSpace(doc, y, 120);
  const rows = [["Taxable value", rs(taxable)], ...(intraState ? [["CGST @ 9%", rs(half)], ["SGST @ 9%", rs(gst - half)]] : [["IGST @ 18%", rs(gst)]]), ["Invoice total", rs(total)]];
  doc.setFontSize(10);
  rows.forEach(([label, value], i) => {
    doc.setFont("helvetica", i === rows.length - 1 ? "bold" : "normal");
    doc.text(label, W - 230, y + i * 16);
    doc.text(value, W - 40, y + i * 16, { align: "right" });
  });
  y += rows.length * 16 + 14;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text(amountInWords(total), 40, y, { maxWidth: W - 80 });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  footer(doc, "Membership fees are non-refundable. Tax is not payable on reverse charge basis. No signature required.");
  return finish(doc, `MembershipInvoice_${(subscription.invoiceNumber ?? "draft").replace(/\//g, "-")}.pdf`, output);
}
