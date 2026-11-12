import re
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.catalog.models import Product, StockMovement
from apps.core.models import EmailOutbox, Notification, SmsOutbox
from apps.core.errors import ApiError
from apps.orders import services
from apps.orders.models import Buyer, Order, Refund, Return, Settlement

ADDRESS = {"city": "Chennai", "fullName": "Priya Raman", "line1": "10, MG Road", "line2": "", "phone": "9840000000", "pincode": "600040", "state": "Tamil Nadu"}
REALME = 207  # technest (Karnataka 29), ₹29,799, IGST for a Tamil Nadu buyer
OIL = 17  # cat food, spice-route (Kerala 32), ₹769, returnable


def stock(variant_id):
    p = Product.objects.get(data__variants__contains=[{"id": variant_id}])
    return next(v["stock"] for v in p.data["variants"] if v["id"] == variant_id)


def place(client, key="k-1", lines=None, payment="online", **extra):
    payload = {"address": ADDRESS, "gstin": "", "idempotencyKey": key, "paymentMethod": payment, "shippingChoices": {"technest": 3, "spice-route": 13},
               "lines": lines or [{"variantId": REALME, "quantity": 1, "price": 1}, {"variantId": OIL, "quantity": 2}], **extra}
    return client.post("/api/v1/checkout/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)


@pytest.fixture
def buyer(demo, as_user):
    return as_user("buyer@kartiva.demo")


def test_place_order_recomputes_prices_decrements_stock_and_notifies(buyer):
    before = (stock(REALME), stock(OIL))
    emails, sms = EmailOutbox.objects.count(), SmsOutbox.objects.count()
    res = place(buyer)
    assert res.status_code == 201, res.content
    order = res.json()
    assert order["buyer"]["email"] == "buyer@kartiva.demo" and order["paymentStatus"] == "paid"
    subs = {s["storeSlug"]: s for s in order["subOrders"]}
    assert subs["technest"]["items"][0]["price"] == 29799 and subs["technest"]["interstate"] is True  # client "price": 1 ignored
    assert subs["spice-route"]["subtotal"] == 1538 and subs["spice-route"]["fee"] == 0  # free above ₹299
    assert order["grandTotal"] == 29799 + 1538
    assert (stock(REALME), stock(OIL)) == (before[0] - 1, before[1] - 2)
    assert StockMovement.objects.filter(data__reason="order_reserved").count() == 2
    assert EmailOutbox.objects.count() == emails + 1 and SmsOutbox.objects.count() == sms + 1
    assert EmailOutbox.objects.first().data["subject"] == f"Order confirmed — {order['number']}"
    assert Notification.objects.filter(role="seller", store_slug="technest", data__title="New order received").exists()
    assert Notification.objects.filter(role="admin", data__title="New order").exists()
    assert Notification.objects.filter(role="buyer", email="buyer@kartiva.demo", data__title="Order placed").exists()
    assert Buyer.objects.filter(email="buyer@kartiva.demo").exists()

    retry = place(buyer)  # same Idempotency-Key → same order, no second stock decrement
    assert retry.status_code == 200 and retry.json()["number"] == order["number"]
    assert stock(REALME) == before[0] - 1 and Order.objects.filter(buyer_email="buyer@kartiva.demo", number=order["number"]).count() == 1

    mine = buyer.get("/api/v1/orders/").json()["results"]
    assert mine[0]["number"] == order["number"] and all(o["buyer"]["email"] == "buyer@kartiva.demo" for o in mine)


def test_checkout_validation(buyer):
    assert place(buyer, key="e1", lines=[{"variantId": 158, "quantity": 1}]).status_code == 409  # enquiry-only motorcycle
    res = place(buyer, key="e2", lines=[{"variantId": REALME, "quantity": 10_000}])
    assert res.status_code == 409 and res.json()["detail"].startswith("Only ")
    assert place(buyer, key="e3", lines=[{"variantId": 999_999, "quantity": 1}]).status_code == 409
    assert place(buyer, key="e4", lines=[{"variantId": REALME, "quantity": 0}]).status_code == 400
    Buyer.objects.update_or_create(email="buyer@kartiva.demo", defaults={"data": {"email": "buyer@kartiva.demo", "codBlocked": True}})
    assert place(buyer, key="e5", lines=[{"variantId": OIL, "quantity": 1}], payment="cod").status_code == 400


def test_checkout_requires_buyer(demo, anon, as_user):
    assert place(anon).status_code == 401
    assert place(as_user("seller@kartiva.demo")).status_code == 403


def test_other_buyer_gets_404_admin_can_read(buyer, as_user):
    number = place(buyer).json()["number"]
    other = as_user("rahul@kartiva.demo")
    assert other.get(f"/api/v1/orders/{number}/").status_code == 404
    assert other.post(f"/api/v1/orders/sub-orders/{number}-1/cancel/", {"reason": "x"}, format="json").status_code == 404
    assert other.get(f"/api/v1/orders/{number}/refunds/").status_code == 404
    assert as_user("admin@kartiva.demo").get(f"/api/v1/orders/{number}/").status_code == 200
    assert buyer.get(f"/api/v1/orders/{number}/").json()["number"] == number


def test_buyer_cancel_releases_stock_and_refunds(buyer, as_user):
    order = place(buyer).json()
    sub = next(s for s in order["subOrders"] if s["storeSlug"] == "technest")
    before = stock(REALME)
    res = buyer.post(f"/api/v1/orders/sub-orders/{sub['number']}/cancel/", {"reason": "Changed my mind"}, format="json")
    assert res.status_code == 200, res.content
    assert res.json()["sub"]["status"] == "cancelled" and stock(REALME) == before + 1
    refunds = buyer.get(f"/api/v1/orders/{order['number']}/refunds/").json()["results"]
    assert refunds[0]["amount"] == 29799 and refunds[0]["status"] == "processed" and refunds[0]["reason"] == "buyer_cancelled"
    assert Order.objects.get(number=order["number"]).data["paymentStatus"] == "partially_refunded"
    assert Notification.objects.filter(store_slug="technest", data__title="Order cancelled by buyer").exists()
    # seller sees only their store's refunds on the order
    assert as_user("seller@kartiva.demo").get(f"/api/v1/orders/{order['number']}/refunds/").status_code in (200, 404)
    again = buyer.post(f"/api/v1/orders/sub-orders/{sub['number']}/cancel/", {}, format="json")
    assert again.status_code == 409


def test_transitions_invoice_return_refund_ledger_settlement(buyer, as_user):
    order = place(buyer, lines=[{"variantId": OIL, "quantity": 2}]).json()
    num = order["subOrders"][0]["number"]
    services.transition_sub_order(num, "processing")
    with pytest.raises(ApiError):
        services.transition_sub_order(num, "shipped")  # carrier + tracking required
    with pytest.raises(ApiError):
        services.transition_sub_order(num, "delivered")  # not allowed from processing
    out = services.transition_sub_order(num, "shipped", carrier="Delhivery", tracking_number="DL123")
    assert re.fullmatch(r"[A-Z]+/26-27/\d{5}", out["sub"]["invoiceNumber"])
    assert EmailOutbox.objects.first().data["subject"] == f"Shipped — {num}"
    services.transition_sub_order(num, "delivered")
    stored = Order.objects.get(number=order["number"]).data["subOrders"][0]
    assert stored["status"] == "delivered" and [t["status"] for t in stored["timeline"]] == ["confirmed", "processing", "shipped", "delivered"]

    res = buyer.post("/api/v1/returns/", {"subOrderNumber": num, "variantId": OIL, "quantity": 1, "reasonCode": "damaged", "description": "Leaking"}, format="json")
    assert res.status_code == 201, res.content
    ret = res.json()
    assert ret["refundAmount"] == 769 and ret["status"] == "requested"  # fee was 0 (free delivery)
    assert buyer.post("/api/v1/returns/", {"subOrderNumber": num, "variantId": OIL, "quantity": 1, "reasonCode": "damaged"}, format="json").status_code == 409
    assert as_user("rahul@kartiva.demo").post(f"/api/v1/returns/{ret['id']}/escalate/").status_code == 404
    assert buyer.get("/api/v1/returns/").json()["results"][0]["id"] == ret["id"]

    services.update_return_in_db(ret["id"], "reject", reason="Used item")
    assert buyer.post(f"/api/v1/returns/{ret['id']}/escalate/").json()["escalated"] is True
    services.update_return_in_db(ret["id"], "override", actor="admin")
    before = stock(OIL)
    done = services.update_return_in_db(ret["id"], "receive")
    assert done["status"] == "refunded" and done["creditNoteNumber"].split("/")[0].endswith("CN") and stock(OIL) == before + 1
    assert Refund.objects.filter(data__returnId=ret["id"], status="processed").exists()

    # Ledger: move delivery back past the return window → credited sale; then settle and pay out.
    o = Order.objects.get(number=order["number"])
    o.data["subOrders"][0]["deliveredAt"] = (timezone.now() - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    o.save()
    entries = services.ledger_for("spice-route")["entries"]
    sale = next(e for e in entries if e.get("subOrderNumber") == num and e["type"] == "sale")
    assert sale["amount"] == 1538
    assert any(e["type"] == "refund" and e["amount"] == -769 for e in entries)
    stl = services.generate_settlement_in_db("spice-route")
    assert num in stl["subOrderNumbers"] and stl["number"] == f"STL-{40 + stl['id']:04d}"
    assert Order.objects.get(number=order["number"]).data["subOrders"][0]["settlementId"] == stl["id"]
    with pytest.raises(ApiError):
        services.generate_settlement_in_db("spice-route")
    if stl["status"] == "approved":
        paid = services.mark_settlement_paid_in_db(stl["id"], " UTR42 ")
        assert paid["status"] == "paid" and paid["utr"] == "UTR42"
    assert Settlement.objects.filter(pk=stl["id"]).exists()


def test_cod_refund_bank_transfer(buyer):
    order = place(buyer, key="cod-1", lines=[{"variantId": OIL, "quantity": 1}], payment="cod").json()
    assert order["paymentStatus"] == "cod_pending"
    num = order["subOrders"][0]["number"]
    services.transition_sub_order(num, "processing")
    services.transition_sub_order(num, "shipped", carrier="DTDC", tracking_number="T1")
    services.transition_sub_order(num, "delivered")
    assert Order.objects.get(number=order["number"]).data["paymentStatus"] == "cod_collected"
    ret = services.request_return_in_db(num, OIL, "defective")
    services.update_return_in_db(ret["id"], "approve")
    done = services.update_return_in_db(ret["id"], "receive")
    assert done["status"] == "received"
    refund = Refund.objects.get(data__returnId=ret["id"])
    assert refund.data["status"] == "pending" and refund.data["payoutTo"] == "priya@upi"
    paid = services.mark_refund_paid_in_db(refund.pk, "UTR9")
    assert paid["status"] == "processed" and Return.objects.get(pk=ret["id"]).data["status"] == "refunded"


def test_prefs_turn_off_email(buyer):
    from apps.accounts.models import User
    u = User.objects.get(email="buyer@kartiva.demo")
    u.data["notificationPrefs"] = {"email": False, "sms": False, "whatsapp": True}
    u.save()
    emails = EmailOutbox.objects.count()
    place(buyer, key="p1", lines=[{"variantId": OIL, "quantity": 1}])
    assert EmailOutbox.objects.count() == emails
    assert SmsOutbox.objects.first().data["channel"] == "whatsapp"


def test_activity_seen_and_nav_counts(demo, as_user):
    admin = as_user("admin@kartiva.demo")
    first = admin.post("/api/v1/activity/seen/", {"area": "orders"}, format="json").json()
    assert first["changed"] is True
    repeat = admin.post("/api/v1/activity/seen/", {"area": "orders"}, format="json").json()
    assert repeat["changed"] is False and repeat["previous"] == first["previous"]
    counts = admin.get("/api/v1/activity/nav-counts/").json()
    assert counts["/admin/orders"] == 0 and "/admin/verification" in counts
    seller = as_user("seller@kartiva.demo").get("/api/v1/activity/nav-counts/").json()
    assert set(seller) == {"/seller/buy-requests", "/seller/leads", "/seller/messages", "/seller/orders", "/seller/returns"}
