// GST invoice as an Excel workbook (same content as the PDF: seller letterhead block, buyer, line items with
// HSN / taxable / CGST+SGST or IGST, totals) and an invoice register (one row per invoice) for accounts / CA.
import { saveBlob, toXlsxBlob } from "./tableExport";

const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export async function downloadInvoiceExcel({ order, platform, store, sub }) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const b = (value) => ({ fontWeight: "bold", value });
  const num = (v) => ({ format: "#,##0.00", type: Number, value: n2(v) });
  const a = order.address;
  const taxCols = sub.interstate ? ["IGST"] : ["CGST", "SGST"];
  const rows = [
    [b(store.name)], [{ value: `${store.address ?? `${store.city}, ${store.state}`}` }], [{ value: `GSTIN ${store.gstin} · State code ${store.gstStateCode}` }],
    [{ value: `Sold via Kartiva (${platform.legalName}, GSTIN ${platform.gstin})` }], [],
    [b("TAX INVOICE")], [b("Invoice no"), { value: sub.invoiceNumber ?? "(issued on dispatch)" }], [b("Invoice date"), { value: new Date(sub.shippedAt ?? order.createdAt).toLocaleDateString("en-IN") }],
    [b("Order no"), { value: order.number }], [b("Shipment"), { value: sub.number }], [b("Payment"), { value: order.paymentMethod === "cod" ? "Cash on Delivery" : "Prepaid (Razorpay)" }], [],
    [b("Bill to / Ship to")], [{ value: a.fullName }], [{ value: [a.line1, a.line2].filter(Boolean).join(", ") }], [{ value: `${a.city}, ${a.state} - ${a.pincode}` }],
    ...(order.gstin ? [[{ value: `Buyer GSTIN: ${order.gstin}` }]] : []), [b("Place of supply"), { value: `${a.state} (${sub.interstate ? "inter-state, IGST" : "intra-state, CGST + SGST"})` }], [],
    ["#", "Item", "SKU", "HSN", "Qty", "Rate", "Taxable", ...taxCols, "Total"].map(b),
    ...sub.items.map((it, i) => [
      { type: Number, value: i + 1 }, { value: `${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ""}` }, { value: it.sku }, { value: String(it.hsn) },
      { type: Number, value: it.quantity }, num(it.price), num(it.taxable), ...(sub.interstate ? [num(it.igst)] : [num(it.cgst), num(it.sgst)]), num(it.lineTotal),
    ]),
    ...(sub.fee ? [[{ value: "" }, { value: "Delivery charges" }, { value: "" }, { value: "9965" }, { type: Number, value: 1 }, num(sub.fee), { value: "" }, ...taxCols.map(() => ({ value: "" })), num(sub.fee)]] : []),
    [],
    [b("Taxable value"), num(sub.tax.taxable)], ...(sub.interstate ? [[b("IGST"), num(sub.tax.igst)]] : [[b("CGST"), num(sub.tax.cgst)], [b("SGST"), num(sub.tax.sgst)]]),
    [b("Delivery"), num(sub.fee)], [b("Invoice total"), { ...num(sub.total), fontWeight: "bold" }],
  ];
  const blob = await writeExcelFile(rows, { columns: [{ width: 16 }, { width: 44 }, { width: 14 }, { width: 10 }, { width: 6 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }] }).toBlob();
  saveBlob(blob, `Invoice_${(sub.invoiceNumber ?? sub.number).replace(/[^\w.-]+/g, "_")}.xlsx`);
}

// Invoice register: one row per invoiced shipment with the GST split — the sheet a CA asks for.
export const INVOICE_REGISTER_COLUMNS = [
  { header: "Invoice no", key: "invoiceNumber" }, { header: "Invoice date", key: "date" }, { header: "Seller", key: "seller" }, { header: "Seller GSTIN", key: "sellerGstin" },
  { header: "Order", key: "orderNumber" }, { header: "Buyer", key: "buyer" }, { header: "Place of supply", key: "state" }, { header: "Taxable", key: "taxable" },
  { header: "CGST", key: "cgst" }, { header: "SGST", key: "sgst" }, { header: "IGST", key: "igst" }, { header: "Delivery", key: "fee" }, { header: "Invoice total", key: "total" },
];
export function invoiceRegisterRows(orders, stores, filter = () => true) {
  const byslug = Object.fromEntries(stores.map((s) => [s.slug, s]));
  return orders.flatMap((o) => o.subOrders.filter((s) => s.invoiceNumber && filter(s)).map((s) => ({
    buyer: o.buyer.name, cgst: n2(s.tax.cgst), date: new Date(s.shippedAt ?? o.createdAt).toLocaleDateString("en-IN"), fee: n2(s.fee), igst: n2(s.tax.igst), invoiceNumber: s.invoiceNumber,
    orderNumber: o.number, seller: byslug[s.storeSlug]?.name ?? s.storeSlug, sellerGstin: byslug[s.storeSlug]?.gstin ?? "", sgst: n2(s.tax.sgst), state: o.address.state, taxable: n2(s.tax.taxable), total: n2(s.total),
  })));
}
export async function downloadInvoiceRegisterExcel(rows, title = "Invoice register") {
  saveBlob(await toXlsxBlob([{ columns: INVOICE_REGISTER_COLUMNS, rows, subtitle: `${rows.length} invoices`, title: `Kartiva — ${title}` }]), "kartiva-invoice-register.xlsx");
}
