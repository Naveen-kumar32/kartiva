from datetime import date, timedelta

import pytest

from apps.catalog.models import Product, StockMovement, Store
from apps.core.models import EmailOutbox, Notification
from apps.market.models import KycDocument, Rfq, Subscription, Ticket
from apps.orders.models import Order, Return

A = "seller@kartiva.demo"  # technest
B_EMAIL = "spiceroute@kartiva.demo"


@pytest.fixture
def seller_a(demo, as_user):
    return as_user(A)


def other_store_slug():
    return Store.objects.exclude(slug="technest").filter(status="approved").first().slug


def product_of(slug):
    return Product.objects.filter(store_slug=slug, deleted_at__isnull=True).order_by("id").first()


def sub_of(slug, status=None):
    for o in Order.objects.filter(store_slugs__contains=[slug]):
        for s in o.data["subOrders"]:
            if s["storeSlug"] == slug and (status is None or s["status"] == status):
                return s
    return None


def test_seller_gets_404_on_other_stores_records(seller_a):
    other = other_store_slug()
    p = product_of(other)
    assert seller_a.get(f"/api/v1/seller/products/{p.pk}/").status_code == 404
    assert seller_a.patch(f"/api/v1/seller/products/{p.pk}/", {"name": "x"}, format="json").status_code in (400, 404)
    assert seller_a.delete(f"/api/v1/seller/products/{p.pk}/").status_code == 404
    variant = p.data["variants"][0]["id"]
    assert seller_a.post(f"/api/v1/seller/variants/{variant}/stock/", {"delta": 5}, format="json").status_code == 404
    sub = sub_of(other, "confirmed") or sub_of(other)
    assert seller_a.post(f"/api/v1/seller/orders/{sub['number']}/status/", {"toStatus": "processing"}, format="json").status_code == 404
    ret = Return.objects.exclude(store_slug="technest").first()
    assert seller_a.post(f"/api/v1/seller/returns/{ret.pk}/approve/", {}, format="json").status_code == 404
    t = Ticket.objects.exclude(store_slug="technest").first()
    assert seller_a.post(f"/api/v1/seller/tickets/{t.pk}/reply/", {"body": "hi"}, format="json").status_code == 404
    assert seller_a.post(f"/api/v1/seller/tickets/{t.pk}/resolve/").status_code == 404
    assert all(r["storeSlug"] == "technest" for r in seller_a.get("/api/v1/seller/orders/").json()["results"])


def test_buyer_cannot_use_seller_hub(demo, as_user):
    assert as_user("buyer@kartiva.demo").get("/api/v1/seller/dashboard/").status_code == 403


def product_payload(**extra):
    return {"brand": "Acme", "categorySlug": "smartphones", "description": "A phone", "gstRate": 18, "hsnCode": "8517", "images": [], "isReturnable": True,
            "name": "Acme Phone", "specifications": [{"name": "RAM", "value": "8 GB"}, {"name": "", "value": ""}], "submit": True, "variantOptions": [],
            "variants": [{"attributes": {}, "mrp": "1000", "price": "900", "sku": "acme-1", "stock": "4"}], **extra}


def test_product_save_validates_and_moderates(seller_a):
    assert seller_a.post("/api/v1/seller/products/", product_payload(categorySlug="electronics"), format="json").json()["detail"] == "Choose a sub-category (leaf category)."
    bad = product_payload(variants=[{"mrp": 100, "price": 200, "sku": "x", "stock": 1}])
    assert seller_a.post("/api/v1/seller/products/", bad, format="json").json()["detail"] == "Price can't be higher than MRP."
    dup = product_payload(variants=[{"mrp": 100, "price": 90, "sku": "x", "stock": 1}, {"mrp": 100, "price": 90, "sku": "X", "stock": 1}])
    assert seller_a.post("/api/v1/seller/products/", dup, format="json").json()["detail"] == "Each variant needs a unique SKU."
    slabs = product_payload(priceTiers=[{"minQty": 10, "discountPct": 5}, {"minQty": 5, "discountPct": 8}])
    assert seller_a.post("/api/v1/seller/products/", slabs, format="json").status_code == 400

    res = seller_a.post("/api/v1/seller/products/", product_payload(moq="5", priceTiers=[{"minQty": 10, "discountPct": 5}]), format="json")
    assert res.status_code == 201, res.content
    p = res.json()
    assert p["status"] == "pending_review" and p["storeSlug"] == "technest" and p["variants"][0]["sku"] == "ACME-1"
    assert p["variants"][0]["price"] == 900 and p["moq"] == 5 and p["priceTiers"] == [{"discountPct": 5, "minQty": 10}]
    assert p["specifications"] == [{"name": "RAM", "value": "8 GB"}] and p["thumbnail"] == "/placeholder-product.svg"
    assert StockMovement.objects.filter(data__productId=p["id"], data__reason="initial").exists()
    clash = seller_a.post("/api/v1/seller/products/", product_payload(name="Other"), format="json")
    assert clash.status_code == 409
    # edit: B2B cleared when switched off
    res = seller_a.patch(f"/api/v1/seller/products/{p['id']}/", product_payload(moq=1, priceTiers=[]), format="json")
    assert res.status_code == 200 and "moq" not in res.json() and "priceTiers" not in res.json()


def test_stock_adjust_writes_movement(seller_a):
    p = product_of("technest")
    v = p.data["variants"][0]
    res = seller_a.post(f"/api/v1/seller/variants/{v['id']}/stock/", {"setTo": v["stock"] + 7, "note": "Recount"}, format="json")
    assert res.status_code == 200 and res.json()["stock"] == v["stock"] + 7
    m = StockMovement.objects.filter(store_slug="technest").order_by("-id").first().data
    assert m["delta"] == 7 and m["reason"] == "manual_adjustment" and m["note"] == "Recount" and m["actor"] == "seller"
    assert seller_a.get("/api/v1/seller/stock-movements/").json()["results"][0]["delta"] == 7


def test_ship_sets_invoice_and_emails_buyer(seller_a):
    sub = sub_of("technest", "confirmed")
    n = sub["number"]
    assert seller_a.post(f"/api/v1/seller/orders/{n}/status/", {"toStatus": "processing"}, format="json").status_code == 200
    assert seller_a.post(f"/api/v1/seller/orders/{n}/status/", {"toStatus": "shipped"}, format="json").status_code == 400
    before = EmailOutbox.objects.count()
    res = seller_a.post(f"/api/v1/seller/orders/{n}/status/", {"toStatus": "shipped", "carrier": "Delhivery", "trackingNumber": "DLV123"}, format="json")
    assert res.status_code == 200, res.content
    s = res.json()["sub"]
    assert s["status"] == "shipped" and s["invoiceNumber"] and s["trackingNumber"] == "DLV123"
    mail = EmailOutbox.objects.order_by("-id").first().data
    assert EmailOutbox.objects.count() > before and mail["subject"] == f"Shipped — {n}"


def test_quote_uses_credit_and_notifies_buyer(seller_a):
    store = Store.objects.get(slug="technest")
    store.data["plan"] = "free"
    store.save()
    Subscription.objects.filter(store_slug="technest", status="active").update(status="replaced")
    rfq = Rfq.objects.filter(status="open").first()
    rfq.data["deadline"] = (date.today() + timedelta(days=10)).isoformat() + "T00:00:00.000Z"
    rfq.data["quotes"] = [q for q in rfq.data.get("quotes") or [] if q["storeSlug"] != "technest"]
    rfq.save()
    before = seller_a.get("/api/v1/seller/rfqs/").json()["credits"]["used"]
    assert before == 0
    valid = (date.today() + timedelta(days=20)).isoformat()
    res = seller_a.post(f"/api/v1/seller/rfqs/{rfq.pk}/quote/", {"leadTimeDays": 7, "note": "Best rate", "pricePerUnit": 120.5, "validTill": valid}, format="json")
    assert res.status_code == 200, res.content
    assert res.json()["myQuote"]["pricePerUnit"] == 120.5 and res.json()["threadId"]
    assert seller_a.get("/api/v1/seller/rfqs/").json()["credits"]["used"] == before + 1
    assert Notification.objects.filter(email=rfq.data["buyer"]["email"], data__title="New quote received").exists()
    # editing doesn't use another credit
    seller_a.post(f"/api/v1/seller/rfqs/{rfq.pk}/quote/", {"leadTimeDays": 5, "note": "", "pricePerUnit": 110, "validTill": valid}, format="json")
    assert seller_a.get("/api/v1/seller/rfqs/").json()["credits"]["used"] == before + 1


def test_kyc_upload_marks_pending(seller_a):
    from django.core.files.uploadedfile import SimpleUploadedFile
    f = SimpleUploadedFile("gst.pdf", b"%PDF-1.4 test", content_type="application/pdf")
    res = seller_a.post("/api/v1/seller/business/kyc/", {"docType": "gst_certificate", "file": f}, format="multipart")
    assert res.status_code == 201, res.content
    assert res.json()["doc"]["status"] == "pending" and res.json()["store"]["kycStatus"] == "pending"
    assert KycDocument.objects.filter(store_slug="technest", data__type="gst_certificate").count() == 1
    assert seller_a.post("/api/v1/seller/business/kyc/", {"docType": "pan_card", "name": "pan.exe", "size": 10}, format="json").status_code == 400


def test_plan_switch_updates_store_and_badges(seller_a):
    res = seller_a.post("/api/v1/seller/plan/change/", {"planCode": "gold"}, format="json")
    assert res.status_code == 402
    res = seller_a.post("/api/v1/seller/plan/change/", {"planCode": "gold", "paymentRef": "pay_123"}, format="json")
    assert res.status_code == 200, res.content
    store = Store.objects.get(slug="technest").data
    assert store["plan"] == "gold" and "trusted" in store["badges"]
    sub = res.json()["subscription"]
    assert sub["invoiceNumber"].startswith("KTV-MEM/26-27/") and Subscription.objects.filter(store_slug="technest", status="active").count() == 1
    assert seller_a.post("/api/v1/seller/plan/change/", {"planCode": "gold", "paymentRef": "x"}, format="json").status_code == 409


def test_bulk_upload_ignores_other_stores_skus(seller_a):
    other = product_of(other_store_slug())
    other_variant = other.data["variants"][0]
    mine = product_of("technest").data["variants"][0]
    rows = [{"sku": other_variant["sku"], "price": 1, "mrp": 2, "stock": 1}, {"sku": mine["sku"], "price": mine["price"], "mrp": mine["mrp"], "stock": mine["stock"] + 1}]
    res = seller_a.post("/api/v1/seller/bulk/price-stock/", {"fileName": "p.csv", "rows": rows}, format="json")
    assert res.status_code == 200 and res.json()["applied"] == 1 and res.json()["errors"][0]["error"] == "Unknown SKU"
    assert Product.objects.get(pk=other.pk).data["variants"][0] == other_variant
    assert seller_a.get("/api/v1/seller/bulk/").json()["uploads"][0]["fileName"] == "p.csv"


def test_ticket_create_and_lead_masking(seller_a):
    res = seller_a.post("/api/v1/seller/tickets/", {"category": "kyc", "message": "Please verify my documents soon", "priority": "high", "subject": "KYC pending"}, format="json")
    assert res.status_code == 201 and res.json()["category"] == "kyc" and res.json()["raisedBy"]["storeSlug"] == "technest"
    store = Store.objects.get(slug="technest")
    store.data["plan"] = "free"
    store.save()
    leads = seller_a.get("/api/v1/seller/leads/").json()["leads"]
    assert leads and all(lead["contactLocked"] and "•" in lead["buyer"]["email"] for lead in leads)
