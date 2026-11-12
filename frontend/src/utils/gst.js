// Mirrors backend apps/invoicing/services/tax.py — prices are GST-inclusive.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function splitGst(lineTotal, gstRate, interstate) {
  const taxable = round2((lineTotal * 100) / (100 + gstRate));
  const tax = round2(lineTotal - taxable);
  if (interstate) return { cgst: 0, igst: tax, sgst: 0, tax, taxable };
  const cgst = round2(tax / 2);
  return { cgst, igst: 0, sgst: round2(tax - cgst), tax, taxable };
}
