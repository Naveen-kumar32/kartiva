"""Mirrors src/utils/__tests__/orderMath.test.js so Python and JS produce the same paise."""
from apps.orders.pricing import DAY_MS, build_sub_order, compute_ledger, inr, method_fee, ms_to_iso, resolve_commission_rate, split_gst

CATEGORIES = [
    {"id": 1, "parentId": None, "slug": "electronics"}, {"id": 2, "parentId": 1, "slug": "phones"},
    {"id": 3, "parentId": 2, "slug": "smartphones"}, {"id": 4, "parentId": None, "slug": "fashion"},
]
RULES = [
    {"rate": 8, "scope": "global"}, {"categorySlug": "electronics", "rate": 6, "scope": "category"},
    {"categorySlug": "phones", "isActive": False, "rate": 20, "scope": "category"}, {"rate": 4, "scope": "store", "storeSlug": "acme"},
]


def test_commission_rate_resolution():
    assert resolve_commission_rate(RULES, "smartphones", "acme", CATEGORIES) == 4
    assert resolve_commission_rate(RULES, "smartphones", "other", CATEGORIES) == 6
    assert resolve_commission_rate([*RULES, {"categorySlug": "smartphones", "rate": 7, "scope": "category"}], "smartphones", "other", CATEGORIES) == 7
    assert resolve_commission_rate(RULES, "fashion", "other", CATEGORIES) == 8
    assert resolve_commission_rate([], "fashion", "other", CATEGORIES) == 10


def test_method_fee_and_gst_split():
    m = {"fee": 100, "freeAbove": 5000}
    assert (method_fee(m, 4999), method_fee(m, 5000), method_fee({"fee": 60, "freeAbove": None}, 1e6)) == (100, 0, 60)
    assert split_gst(2360, 18, False) == {"cgst": 180, "igst": 0, "sgst": 180, "tax": 360, "taxable": 2000}
    assert split_gst(29799, 18, True)["igst"] == 4545.61


STORE = {"gstStateCode": "27", "name": "Acme Traders", "slug": "other"}
PRODUCT = {"categorySlug": "smartphones", "gstRate": 18, "hsnCode": "8517", "id": 11, "isReturnable": True, "name": "Phone",
           "priceTiers": [{"discountPct": 10, "minQty": 10}], "thumbnail": "x.webp"}
VARIANT = {"attributes": {"color": "Black", "size": "M"}, "id": 101, "mrp": 1500, "price": 1180, "sku": "PH-BLK-M"}
METHOD = {"codAllowed": True, "fee": 100, "freeAbove": 5000, "id": "std", "maxDays": 5, "minDays": 2, "name": "Standard", "type": "courier"}


def build(state, qty):
    return build_sub_order(buyer_state_code=state, categories=CATEGORIES, lines=[{"product": PRODUCT, "quantity": qty, "variant": VARIANT}],
                           method=METHOD, number="KV-1-A", rules=RULES, store=STORE)


def test_build_sub_order_intra_and_inter_state():
    sub = build("27", 2)
    assert sub["interstate"] is False
    assert {k: sub["items"][0][k] for k in ("cgst", "igst", "lineTotal", "price", "sgst", "taxable", "tierDiscountPct", "variantLabel")} == {
        "cgst": 180, "igst": 0, "lineTotal": 2360, "price": 1180, "sgst": 180, "taxable": 2000, "tierDiscountPct": 0, "variantLabel": "Black / M"}
    assert sub["commissionAmount"] == 141.6 and sub["items"][0]["commissionRate"] == 6
    assert (sub["fee"], sub["subtotal"], sub["total"], sub["status"]) == (100, 2360, 2460, "confirmed")
    assert build("29", 2)["tax"] == {"cgst": 0, "igst": 360, "sgst": 0, "taxable": 2000}


def test_build_sub_order_uses_slab_price():
    sub = build("29", 10)
    item = sub["items"][0]
    assert (item["listPrice"], item["price"], item["tierDiscountPct"], item["lineTotal"], item["igst"], item["taxable"]) == (1180, 1062, 10, 10620, 1620, 9000)
    assert sub["commissionAmount"] == 637.2 and sub["fee"] == 0 and sub["total"] == 10620


NOW = 1_794_441_600_000  # 2026-11-12T00:00:00Z
PLATFORM = {"commissionGstRate": 18, "tcsRate": 1, "tdsRate": 1}


def sub(number, days_ago, **extra):
    return {"commissionAmount": 141.6, "deliveredAt": ms_to_iso(NOW - days_ago * DAY_MS), "fee": 100, "number": number, "settlementId": None,
            "status": "delivered", "storeSlug": "acme", "subtotal": 2360, "tax": {"taxable": 2000}, "total": 2460, **extra}


def ledger(**kw):
    return compute_ledger(**{"ads": [], "now": NOW, "platform": PLATFORM, "refunds": [], "settlements": [], "store_slug": "acme", **kw})


def test_ledger_credits_sale_after_window():
    out = ledger(orders=[{"paymentMethod": "upi", "subOrders": [sub("S1", 10)]}])
    assert {e["type"]: e["amount"] for e in out["entries"]} == {"commission": -141.6, "commission_gst": -25.49, "sale": 2360, "shipping": 100, "tcs": -20, "tds": -23.6}
    assert out["balance"] == 2249.31 and out["pending"] == 0


def test_ledger_cod_and_pending_and_refunds():
    assert ledger(orders=[{"paymentMethod": "cod", "subOrders": [sub("S1", 10)]}])["balance"] == -210.69
    assert ledger(orders=[{"paymentMethod": "upi", "subOrders": [sub("S2", 2), sub("S3", 10, fee=0)]}])["pending"] == 2318.4
    out = ledger(
        ads=[{"advertiserType": "seller", "headline": "Diwali", "spend": 200, "startsAt": "2026-11-01", "storeSlug": "acme"}],
        orders=[{"paymentMethod": "upi", "subOrders": [sub("S1", 10), sub("S2", 2)]}],
        refunds=[{"amount": 500, "processedAt": "2026-11-05T00:00:00Z", "status": "processed", "storeSlug": "acme", "subOrderNumber": "S1"},
                 {"amount": 300, "processedAt": "2026-11-11T00:00:00Z", "status": "processed", "storeSlug": "acme", "subOrderNumber": "S2"},
                 {"amount": 999, "processedAt": "2026-11-05T00:00:00Z", "status": "processed", "storeSlug": "acme", "subOrderNumber": "NEVER"}],
        settlements=[{"id": 9, "net": 1000, "number": "ST-1", "paidAt": "2026-11-10T00:00:00Z", "status": "paid", "storeSlug": "acme", "utr": "UTR1"}],
    )
    assert [e["amount"] for e in out["entries"] if e["type"] == "refund"] == [-500]
    assert [e["amount"] for e in out["entries"] if e["type"] == "ad_charge"] == [-200]
    assert out["pending"] == 2018.4 and out["balance"] == 549.31  # 2249.31 - 500 - 200 - 1000
    assert [e["date"] for e in out["entries"]] == sorted((e["date"] for e in out["entries"]), reverse=True)


def test_inr_indian_grouping():
    assert inr(110399.5) == "₹1,10,400" and inr(999) == "₹999" and inr(12345678) == "₹1,23,45,678"
