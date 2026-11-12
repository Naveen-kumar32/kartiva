from datetime import date, timedelta

from apps.core.models import EmailOutbox, Notification
from apps.market.models import Rfq
from apps.market.services import audience_matches, refresh_badges

BUYER = "ananya@kartiva.demo"
CHEF = "chefpro@kartiva.demo"


def _enquiry(client, **extra):
    return client.post("/api/v1/enquiries/", {"productId": 49, "quantity": 12, "unit": "pcs", "message": "Need 12 units for a new restaurant kitchen.", **extra}, format="json")


def test_enquiry_thread_visible_to_store_only(demo, as_user):
    buyer = as_user(BUYER)
    res = _enquiry(buyer)
    assert res.status_code == 201, res.content
    enquiry = res.json()
    assert enquiry["storeSlug"] == "chefpro" and enquiry["requirementType"] == "bulk" and enquiry["threadId"]
    tid = enquiry["threadId"]
    assert any(e["id"] == enquiry["id"] and e["product"]["id"] == 49 for e in buyer.get("/api/v1/enquiries/mine/").json())
    assert buyer.post(f"/api/v1/enquiries/{enquiry['id']}/thread/").json() == tid

    chef = as_user(CHEF)
    threads = chef.get("/api/v1/messages/").json()
    thread = next(t for t in threads if t["id"] == tid)
    assert thread["unread"]["seller"] == 1 and thread["store"]["slug"] == "chefpro"
    assert chef.get("/api/v1/messages/unread-count/").json()["count"] >= 1
    assert any(n["title"] == "New enquiry" for n in chef.get("/api/v1/notifications/").json())
    # seller reply → buyer unread + notification
    res = chef.post(f"/api/v1/messages/{tid}/", {"body": "Sure, quoting shortly."}, format="json")
    assert res.status_code == 200 and res.json()["unread"]["buyer"] == 1
    assert buyer.post(f"/api/v1/messages/{tid}/read/").json()["unread"]["buyer"] == 0
    # another seller cannot see or write to it
    other = as_user("motors@kartiva.demo")
    assert all(t["id"] != tid for t in other.get("/api/v1/messages/").json())
    assert other.post(f"/api/v1/messages/{tid}/read/").status_code == 404
    assert other.post(f"/api/v1/messages/{tid}/", {"body": "hi"}, format="json").status_code == 404
    # another buyer cannot open the enquiry chat
    assert as_user("rahul@kartiva.demo").post(f"/api/v1/enquiries/{enquiry['id']}/thread/").status_code == 404
    # admin can read but not send
    admin = as_user("admin@kartiva.demo")
    assert any(t["id"] == tid for t in admin.get("/api/v1/messages/").json())
    assert admin.post(f"/api/v1/messages/{tid}/", {"body": "hi"}, format="json").status_code == 404


def test_sellers_cannot_send_enquiries(demo, as_user):
    assert _enquiry(as_user(CHEF)).status_code == 403


def test_rfq_dispatch_and_notifications(demo, as_user):
    buyer = as_user(BUYER)
    required = (date.today() + timedelta(days=10)).isoformat()
    payload = {"title": "Commercial gas range x 4", "categorySlug": "commercial-kitchen", "quantity": 4, "unit": "pcs", "targetPrice": 25000,
               "deliveryCity": "Mumbai", "requiredBy": required, "details": "Four-burner ranges for a new kitchen."}
    res = buyer.post("/api/v1/rfqs/", payload, format="json")
    assert res.status_code == 201, res.content
    rfq = res.json()
    assert rfq["notifiedSuppliers"] >= 1
    slugs = [d["storeSlug"] for d in rfq["dispatches"]]
    assert "chefpro" in slugs
    assert Notification.objects.filter(role="seller", store_slug="chefpro", data__title="New product request in your category").exists()
    assert Notification.objects.filter(role="admin", data__title="New buy request").exists()
    assert Notification.objects.filter(role="buyer", email=BUYER, data__title="Quote request posted").exists()
    mail = EmailOutbox.objects.filter(data__to=[CHEF]).first()
    assert mail and "Commercial gas range" in mail.data["subject"] and "Target price: ₹25,000 per pcs" in mail.data["message"]
    # public list: first name + city only
    recent = buyer.get("/api/v1/rfqs/recent/").json()
    row = next(r for r in recent if r["id"] == rfq["id"])
    assert row["buyerFirstName"] == "Ananya" and "email" not in str(row)
    # validation
    assert buyer.post("/api/v1/rfqs/", {**payload, "requiredBy": "2020-01-01"}, format="json").status_code == 400
    assert buyer.post("/api/v1/rfqs/", {**payload, "categorySlug": "no-such-category"}, format="json").status_code == 400


def test_accept_quote(demo, as_user):
    buyer = as_user(BUYER)
    mine = buyer.get("/api/v1/rfqs/mine/").json()
    rfq = next(r for r in mine if r["status"] == "open" and len(r["quotes"]) >= 2)
    assert rfq["quotes"][0]["pricePerUnit"] <= rfq["quotes"][1]["pricePerUnit"] and rfq["quotes"][0]["store"]
    win, lose = rfq["quotes"][0], rfq["quotes"][1]
    assert as_user("rahul@kartiva.demo").post(f"/api/v1/rfqs/{rfq['id']}/quotes/{win['id']}/accept/").status_code == 404
    res = buyer.post(f"/api/v1/rfqs/{rfq['id']}/quotes/{win['id']}/accept/")
    assert res.status_code == 200, res.content
    data = res.json()
    assert data["status"] == "awarded" and data["awardedQuoteId"] == win["id"]
    statuses = {q["id"]: q["status"] for q in data["quotes"]}
    assert statuses[win["id"]] == "accepted" and statuses[lose["id"]] == "rejected"
    assert Notification.objects.filter(store_slug=win["storeSlug"], data__title="Your quote was accepted").exists()
    assert Notification.objects.filter(store_slug=lose["storeSlug"], data__title="Quote not selected").exists()
    assert buyer.post(f"/api/v1/rfqs/{rfq['id']}/quotes/{win['id']}/accept/").status_code == 409
    tid = buyer.post(f"/api/v1/rfqs/{rfq['id']}/thread/", {"storeSlug": win["storeSlug"]}, format="json").json()
    assert buyer.post(f"/api/v1/rfqs/{rfq['id']}/thread/", {"storeSlug": win["storeSlug"]}, format="json").json() == tid
    assert Rfq.objects.get(pk=rfq["id"]).data["status"] == "awarded"


def test_wishlist_toggle(demo, as_user, anon):
    buyer = as_user(BUYER)
    assert anon.get("/api/v1/wishlist/ids/").json() == []
    before = buyer.get("/api/v1/wishlist/ids/").json()
    res = buyer.post("/api/v1/wishlist/toggle/", {"productId": 49}, format="json").json()
    assert res["added"] is (49 not in before) and (49 in res["ids"]) is res["added"]
    if res["added"]:
        item = next(p for p in buyer.get("/api/v1/wishlist/").json() if p["id"] == 49)
        assert item["summary"]["price"] and item["store"]["slug"] == "chefpro"
    again = buyer.post("/api/v1/wishlist/toggle/", {"productId": 49}, format="json").json()
    assert again["added"] is not res["added"]
    assert buyer.post("/api/v1/wishlist/toggle/", {"productId": 999999}, format="json").status_code == 404


def test_profile_update_cannot_change_role_or_email(demo, as_user):
    buyer = as_user(BUYER)
    res = buyer.patch("/api/v1/me/", {"firstName": "Ana", "lastName": "G", "phone": "9876500000", "city": "Pune", "role": "admin", "email": "x@y.z", "storeSlug": "chefpro"}, format="json")
    assert res.status_code == 200, res.content
    me = res.json()
    assert me["role"] == "buyer" and me["email"] == BUYER and me["storeSlug"] is None and me["phone"] == "+919876500000" and me["city"] == "Pune"
    assert buyer.patch("/api/v1/me/", {"firstName": "Ana", "phone": "12345", "gstin": ""}, format="json").status_code == 400
    me = buyer.post("/api/v1/me/addresses/", {"label": "Home", "fullName": "Ana", "phone": "9876500000", "line1": "1 Road", "city": "Pune", "state": "MH", "pincode": "411001"}, format="json").json()
    assert me["addresses"][0]["isDefault"] is True
    me = buyer.post("/api/v1/me/addresses/", {"label": "Office", "fullName": "Ana", "phone": "9876500000", "line1": "2 Road", "city": "Pune", "state": "MH", "pincode": "411002", "isDefault": True}, format="json").json()
    assert [a["isDefault"] for a in me["addresses"]] == [False, True]
    me = buyer.delete(f"/api/v1/me/addresses/{me['addresses'][1]['id']}/").json()
    assert len(me["addresses"]) == 1 and me["addresses"][0]["isDefault"]
    me = buyer.patch("/api/v1/me/notification-prefs/", {"email": True, "sms": False, "whatsapp": 1}, format="json").json()
    assert me["notificationPrefs"] == {"email": True, "sms": False, "whatsapp": True}
    export = buyer.get("/api/v1/me/export/").json()
    assert export["profile"]["email"] == BUYER and all(r["buyer"]["email"] == BUYER for r in export["rfqs"])


def test_change_password(demo, as_user, anon):
    buyer = as_user(BUYER)
    assert buyer.post("/api/v1/me/password/", {"currentPassword": "wrong", "newPassword": "NewPass@123"}, format="json").status_code == 400
    assert buyer.post("/api/v1/me/password/", {"currentPassword": "Demo@123", "newPassword": "NewPass@123"}, format="json").json() == {"ok": True}
    assert anon.post("/api/v1/auth/login/", {"email": BUYER, "password": "Demo@123"}, format="json").status_code == 401
    assert anon.post("/api/v1/auth/login/", {"email": BUYER, "password": "NewPass@123"}, format="json").status_code == 200


def test_tickets_owner_only(demo, as_user):
    buyer = as_user(BUYER)
    res = buyer.post("/api/v1/support/tickets/", {"subject": "Parcel not delivered", "category": "orders", "priority": "urgent", "message": "My parcel has not arrived yet."}, format="json")
    assert res.status_code == 201, res.content
    t = res.json()
    assert t["number"] == f"TKT-{1040 + t['id']}" and t["status"] == "open" and t["raisedBy"]["email"] == BUYER
    assert Notification.objects.filter(role="admin", data__title="Urgent ticket").exists()
    assert any(x["id"] == t["id"] for x in buyer.get("/api/v1/support/tickets/").json())
    other = as_user("rahul@kartiva.demo")
    assert all(x["id"] != t["id"] for x in other.get("/api/v1/support/tickets/").json())
    assert other.post(f"/api/v1/support/tickets/{t['id']}/reply/", {"body": "hi"}, format="json").status_code == 404
    assert other.post(f"/api/v1/support/tickets/{t['id']}/resolve/").status_code == 404
    assert len(buyer.post(f"/api/v1/support/tickets/{t['id']}/reply/", {"body": "Any update?"}, format="json").json()["messages"]) == 2
    assert buyer.post(f"/api/v1/support/tickets/{t['id']}/resolve/").json()["status"] == "resolved"
    assert buyer.post(f"/api/v1/support/tickets/{t['id']}/resolve/").status_code == 409
    d = buyer.post("/api/v1/me/delete-request/", {"reason": "Moving abroad"}, format="json").json()
    assert d["category"] == "privacy" and d["priority"] == "high"


def test_notifications_audience(demo, as_user):
    from apps.core.services import notify
    notify({"role": "buyer", "email": BUYER}, "For Ananya", "x")
    notify({"role": "buyer", "email": "rahul@kartiva.demo"}, "For Rahul", "x")
    notify({"role": "seller", "storeSlug": "chefpro"}, "For ChefPro", "x")
    notify({"role": "all"}, "For everyone", "x")
    titles = lambda c: {n["title"] for n in c.get("/api/v1/notifications/").json()}  # noqa: E731
    a = titles(as_user(BUYER))
    assert {"For Ananya", "For everyone"} <= a and not {"For Rahul", "For ChefPro"} & a
    c = titles(as_user(CHEF))
    assert {"For ChefPro", "For everyone"} <= c and "For Ananya" not in c
    m = titles(as_user("motors@kartiva.demo"))
    assert "For ChefPro" not in m
    buyer = as_user(BUYER)
    n = next(x for x in buyer.get("/api/v1/notifications/").json() if x["title"] == "For Ananya")
    after = buyer.post("/api/v1/notifications/read/", {"id": n["id"]}, format="json").json()
    assert next(x for x in after if x["id"] == n["id"])["read"] is True
    assert all(x["read"] for x in buyer.post("/api/v1/notifications/read/", {}, format="json").json())
    assert not Notification.objects.get(data__title="For Rahul").data["read"]
    assert audience_matches({"role": "seller", "storeSlug": "chefpro"}, {"role": "seller", "storeSlug": "chefpro"})


def test_outbox_admin_only_and_send(demo, as_user, anon):
    buyer = as_user(BUYER)
    assert buyer.get("/api/v1/emails/").status_code == 403
    assert buyer.get("/api/v1/sms/").status_code == 403
    assert anon.get("/api/v1/emails/").status_code == 401
    from django.core.files.uploadedfile import SimpleUploadedFile
    pdf = SimpleUploadedFile("invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf")
    res = buyer.post("/api/v1/emails/", {"to": "a@b.co, c@d.co", "subject": "Invoice", "message": "Attached", "attachment": pdf}, format="multipart")
    assert res.status_code == 201, res.content
    assert res.json()["attachment"] == {"filename": "invoice.pdf", "size": 13} and res.json()["to"] == ["a@b.co", "c@d.co"]
    assert buyer.post("/api/v1/emails/", {"to": "nope", "subject": "x"}, format="multipart").status_code == 400
    assert buyer.post("/api/v1/emails/", {"to": "a@b.co", "subject": " "}, format="multipart").status_code == 400
    admin = as_user("admin@kartiva.demo")
    assert admin.get("/api/v1/emails/").json()["results"][0]["subject"] == "Invoice"
    assert isinstance(admin.get("/api/v1/sms/").json()["results"], list)


def test_attachment_source_access(demo, as_user):
    params = {"kind": "invoice", "orderNumber": "KTV-261111-QQ80K7", "subOrderNumber": "KTV-261111-QQ80K7-1"}
    assert as_user("vikram@kartiva.demo").get("/api/v1/emails/attachments/", params).status_code == 200
    src = as_user(CHEF).get("/api/v1/emails/attachments/", params).json()
    assert src["store"]["slug"] == "chefpro" and src["sub"]["number"] == params["subOrderNumber"]
    assert as_user("motors@kartiva.demo").get("/api/v1/emails/attachments/", params).status_code == 404
    assert as_user(BUYER).get("/api/v1/emails/attachments/", params).status_code == 404
    assert as_user("admin@kartiva.demo").get("/api/v1/emails/attachments/", params).status_code == 200


def test_public_cms_and_lists(demo, anon):
    assert anon.get("/api/v1/pages/returns/").status_code == 200
    assert anon.get("/api/v1/pages/does-not-exist/").status_code == 404
    assert all("body" not in p for p in anon.get("/api/v1/pages/").json())
    assert anon.get("/api/v1/announcement/").json()["active"] is True
    plans = anon.get("/api/v1/plans/").json()
    assert [p["priceYearly"] for p in plans] == sorted(p["priceYearly"] for p in plans)
    cats = anon.get("/api/v1/rfqs/categories/").json()
    assert any(c["slug"] == "commercial-kitchen" for c in cats) and all(c["parent"] for c in cats)


def test_refresh_badges_keeps_manual():
    s = refresh_badges({"badges": ["eco", "trusted"], "rating": 4.6, "plan": "free", "kycStatus": "verified", "trustedManual": True})
    assert s["badges"] == ["eco", "top_rated", "trusted"]
    s = refresh_badges({"badges": ["trusted"], "rating": 4.0, "plan": "gold", "kycStatus": "verified", "trustedManual": False})
    assert s["badges"] == []
