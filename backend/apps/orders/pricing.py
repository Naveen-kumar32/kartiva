"""Pure order / money maths — port of frontend src/utils/orderMath.js, gst.js and pricing.js.

Rounding mirrors JavaScript exactly (Math.round = half up towards +∞, Number.EPSILON nudge) so the backend
produces the same paise as the storefront and the mock. No database access here.
"""
import math
import sys
from datetime import datetime, timezone

DAY_MS = 86_400_000
EPSILON = sys.float_info.epsilon  # == Number.EPSILON


def js_round(n):
    """JavaScript Math.round: halves round up (towards +infinity)."""
    return math.floor(n + 0.5)


def num(n):
    """Integral floats → int, so JSON shows 2360 (like JS) rather than 2360.0."""
    if isinstance(n, float) and n.is_integer():
        return int(n)
    return n


def round2(n):
    return num(js_round((n + EPSILON) * 100) / 100)


# ---------- GST (prices are GST-inclusive) ----------
def split_gst(line_total, gst_rate, interstate):
    taxable = round2((line_total * 100) / (100 + (gst_rate or 0)))
    tax = round2(line_total - taxable)
    if interstate:
        return {"cgst": 0, "igst": tax, "sgst": 0, "tax": tax, "taxable": taxable}
    cgst = round2(tax / 2)
    return {"cgst": cgst, "igst": 0, "sgst": round2(tax - cgst), "tax": tax, "taxable": taxable}


# ---------- Wholesale slab pricing ----------
def price_tiers_of(product):
    return sorted((product or {}).get("priceTiers") or [], key=lambda t: t.get("minQty", 0))


def tier_for(product, quantity):
    tiers = [t for t in price_tiers_of(product) if quantity >= t.get("minQty", 0)]
    return tiers[-1] if tiers else None


def tier_unit_price(base_price, tier):
    return num(js_round(base_price * (1 - tier["discountPct"] / 100))) if tier else base_price


def unit_price_for(product, variant, quantity):
    return tier_unit_price(variant["price"], tier_for(product, quantity))


def min_order_qty(product):
    return max(1, (product or {}).get("moq") or 1)


# ---------- Commission, fees, sub-orders ----------
def resolve_commission_rate(rules, category_slug, store_slug, categories):
    """store override → category rule (walking up ancestors) → global default (10 if none)."""
    active = [r for r in rules if r.get("isActive") is not False]
    for r in active:
        if r.get("scope") == "store" and r.get("storeSlug") == store_slug:
            return r.get("rate")
    by_slug = {c.get("slug"): c for c in categories}
    by_id = {c.get("id"): c for c in categories}
    cat = by_slug.get(category_slug)
    seen = set()
    while cat and cat.get("id") not in seen:
        seen.add(cat.get("id"))
        for r in active:
            if r.get("scope") == "category" and r.get("categorySlug") == cat.get("slug"):
                return r.get("rate")
        cat = by_id.get(cat.get("parentId")) if cat.get("parentId") is not None else None
    glob = next((r for r in active if r.get("scope") == "global"), None)
    return glob.get("rate") if glob and glob.get("rate") is not None else 10


def method_fee(method, subtotal):
    return 0 if method.get("freeAbove") is not None and subtotal >= method["freeAbove"] else method.get("fee", 0)


def build_sub_order(*, categories, buyer_state_code, lines, method, number, rules, store):
    """One seller sub-order with GST split and commission snapshot. lines: [{product, variant, quantity}]
    (product/variant from the catalogue, never the cart). Unit price = slab price for the quantity."""
    interstate = store.get("gstStateCode") != buyer_state_code
    items = []
    for line in lines:
        product, variant, quantity = line["product"], line["variant"], line["quantity"]
        price = unit_price_for(product, variant, quantity)
        line_total = price * quantity
        tier = tier_for(product, quantity)
        tax = split_gst(line_total, product.get("gstRate") or 0, interstate)
        rate = resolve_commission_rate(rules, product.get("categorySlug"), store.get("slug"), categories)
        items.append({
            "cgst": tax["cgst"], "commissionAmount": round2((line_total * rate) / 100), "commissionRate": rate, "gstRate": product.get("gstRate"),
            "hsn": product.get("hsnCode"), "igst": tax["igst"], "image": product.get("thumbnail"), "isReturnable": product.get("isReturnable"),
            "lineTotal": line_total, "mrp": variant.get("mrp"), "listPrice": variant.get("price"), "name": product.get("name"), "price": price,
            "productId": product.get("id"), "quantity": quantity, "returnedQuantity": 0, "sgst": tax["sgst"], "sku": variant.get("sku"),
            "taxable": tax["taxable"], "tierDiscountPct": (tier or {}).get("discountPct", 0), "variantId": variant.get("id"),
            "variantLabel": " / ".join(str(v) for v in (variant.get("attributes") or {}).values()),
        })
    subtotal = sum(i["lineTotal"] for i in items)
    fee = method_fee(method, subtotal)
    return {
        "carrier": None, "commissionAmount": round2(sum(i["commissionAmount"] for i in items)), "deliveredAt": None, "fee": fee,
        "interstate": interstate, "invoiceNumber": None, "items": items,
        "method": {k: method.get(k) for k in ("codAllowed", "id", "maxDays", "minDays", "name", "type")},
        "number": number, "refundedAmount": 0, "settlementId": None, "shippedAt": None, "status": "confirmed", "storeName": store.get("name"),
        "storeSlug": store.get("slug"), "subtotal": subtotal,
        "tax": {k: round2(sum(i[k] for i in items)) for k in ("cgst", "igst", "sgst", "taxable")},
        "timeline": [], "total": subtotal + fee, "trackingNumber": None,
    }


# ---------- Ledger ----------
def parse_ms(iso):
    """ISO string → epoch milliseconds (like new Date(iso).getTime())."""
    if not iso:
        return 0
    dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def ms_to_iso(ms):
    """Epoch ms → '2026-11-12T00:00:00.000Z' (like Date#toISOString)."""
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def now_ms():
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def compute_ledger(*, ads, orders, platform, refunds, settlements, store_slug, now=None, return_window_days=7):
    """Seller ledger from orders, refunds, ads and settlements → {entries (newest first), balance, pending}.
    + = platform owes the seller. Same rules as computeLedger() in orderMath.js."""
    now = now_ms() if now is None else now
    entries, credited, in_window = [], set(), set()
    pending = 0

    def add(date, type_, description, amount, ref=None):
        if amount:
            entries.append({"amount": round2(amount), "date": date, "description": description, "type": type_, **(ref or {})})

    for order in orders:
        for sub in order.get("subOrders") or []:
            if sub.get("storeSlug") != store_slug or sub.get("status") != "delivered":
                continue
            closes_at = parse_ms(sub.get("deliveredAt")) + (return_window_days or 0) * DAY_MS
            if closes_at > now:
                pending += sub["total"] - sub["commissionAmount"]
                in_window.add(sub["number"])
                continue
            credited.add(sub["number"])
            date = ms_to_iso(closes_at)
            ref = {"settlementId": sub.get("settlementId"), "subOrderNumber": sub["number"]}
            n = sub["number"]
            add(date, "sale", f"Sale · {n}", sub["subtotal"], ref)
            add(date, "shipping", f"Delivery fee · {n}", sub.get("fee") or 0, ref)
            add(date, "commission", f"Commission · {n}", -sub["commissionAmount"], ref)
            add(date, "commission_gst", f"GST {num(platform.get('commissionGstRate'))}% on commission · {n}", -(sub["commissionAmount"] * platform.get("commissionGstRate", 0)) / 100, ref)
            add(date, "tcs", f"TCS {num(platform.get('tcsRate'))}% · {n}", -(sub["tax"]["taxable"] * platform.get("tcsRate", 0)) / 100, ref)
            add(date, "tds", f"TDS {num(platform.get('tdsRate'))}% · {n}", -(sub["subtotal"] * platform.get("tdsRate", 0)) / 100, ref)
            if order.get("paymentMethod") == "cod":
                add(date, "cod_collected_by_seller", f"COD cash collected · {n}", -sub["total"], ref)
    # Only refunds on credited sales reduce the balance; refunds for shipments cancelled before delivery never reached the seller.
    for r in refunds:
        if r.get("storeSlug") != store_slug or r.get("status") != "processed":
            continue
        if r.get("subOrderNumber") in credited:
            add(r.get("processedAt") or r.get("createdAt"), "refund", f"Refund · {r.get('subOrderNumber')}", -r["amount"], {"settlementId": r.get("settlementId")})
        elif r.get("subOrderNumber") in in_window:
            pending -= r["amount"]
    for ad in ads:
        if ad.get("advertiserType") == "seller" and ad.get("storeSlug") == store_slug and (ad.get("spend") or 0) > 0:
            headline = ad.get("headline") if ad.get("headline") is not None else f"Sponsored product #{ad.get('productId')}"
            add(f"{ad.get('startsAt')}T00:00:00Z", "ad_charge", f"Ad · {headline}", -ad["spend"], {"settlementId": ad.get("settlementId")})
    for s in settlements:
        if s.get("storeSlug") == store_slug and s.get("status") == "paid":
            add(s.get("paidAt"), "payout", f"Payout {s.get('number')} · UTR {s.get('utr')}", -s["net"], {"settlementId": s.get("id")})
    entries.sort(key=lambda e: e["date"] or "", reverse=True)
    return {"balance": round2(sum(e["amount"] for e in entries)), "entries": entries, "pending": round2(max(0, pending))}


# ---------- Formatting helpers used in notifications ----------
def inr(n):
    """₹ with Indian digit grouping, rounded to rupees (like inr() in orderOps.js)."""
    try:
        v = js_round(float(n or 0))
    except (TypeError, ValueError):
        v = 0
    neg, s = v < 0, str(abs(v))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return f"₹{'-' if neg else ''}{s}"


INDIAN_STATES = {
    "Andaman and Nicobar Islands": "35", "Andhra Pradesh": "37", "Arunachal Pradesh": "12", "Assam": "18", "Bihar": "10", "Chandigarh": "04",
    "Chhattisgarh": "22", "Dadra and Nagar Haveli and Daman and Diu": "26", "Delhi": "07", "Goa": "30", "Gujarat": "24", "Haryana": "06",
    "Himachal Pradesh": "02", "Jammu and Kashmir": "01", "Jharkhand": "20", "Karnataka": "29", "Kerala": "32", "Ladakh": "38", "Lakshadweep": "31",
    "Madhya Pradesh": "23", "Maharashtra": "27", "Manipur": "14", "Meghalaya": "17", "Mizoram": "15", "Nagaland": "13", "Odisha": "21",
    "Puducherry": "34", "Punjab": "03", "Rajasthan": "08", "Sikkim": "11", "Tamil Nadu": "33", "Telangana": "36", "Tripura": "16",
    "Uttar Pradesh": "09", "Uttarakhand": "05", "West Bengal": "19",
}


def state_code_of(name):
    return INDIAN_STATES.get(name)
