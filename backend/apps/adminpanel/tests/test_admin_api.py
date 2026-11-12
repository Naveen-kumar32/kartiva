"""Admin API (apps/adminpanel): access control + the main cross-role effects."""
import pytest

from apps.catalog.models import Store
from apps.core.models import AuditLog, EmailOutbox, Notification
from apps.market.models import Broadcast, KycDocument, Rfq
from apps.orders.models import SellerApplication, Settlement

pytestmark = pytest.mark.django_db
BASE = "/api/v1/admin-api"
ADMIN = "admin@kartiva.demo"


@pytest.fixture
def admin(demo, as_user):
    return as_user(ADMIN)


@pytest.mark.parametrize("url", ["dashboard/", "orders/", "categories/", "stores/", "buyers/", "settings/", "leads/", "kyc/", "risk/", "tax/", "transactions/"])
def test_non_admins_get_403(demo, as_user, anon, url):
    assert anon.get(f"{BASE}/{url}").status_code == 401
    for email in ("buyer@kartiva.demo", "seller@kartiva.demo"):
        assert as_user(email).get(f"{BASE}/{url}").status_code == 403
    assert as_user(ADMIN).get(f"{BASE}/{url}").status_code == 200


def test_non_admin_cannot_write(demo, as_user):
    seller = as_user("seller@kartiva.demo")
    assert seller.patch(f"{BASE}/settings/", {"codFee": 99}, format="json").status_code == 403
    assert seller.post(f"{BASE}/categories/", {"name": "Hack"}, format="json").status_code == 403
    assert seller.post(f"{BASE}/broadcasts/", {"audience": "sellers", "title": "x", "body": "y", "channels": ["in_app"]}, format="json").status_code == 403


def test_approving_self_registered_application_makes_store_public(anon, as_user, db):
    from django.core.management import call_command
    call_command("seed_demo", "--reset", verbosity=0)
    res = anon.post("/api/v1/auth/register/seller/", {
        "annualTurnover": "Up to ₹1 Cr", "businessName": "Nilgiri Tea Estates", "businessType": "Manufacturer", "category": "Fresh & Pantry", "city": "Coonoor",
        "email": "nilgiri@example.in", "firstName": "Lakshmi", "gstin": "33ABCDE1234F1Z5", "lastName": "Raman", "pan": "ABCDE1234F", "password": "Strong@123",
        "phone": "9876500011", "state": "Tamil Nadu", "terms": True, "yearEstablished": 2015,
    }, format="json")
    assert res.status_code == 201, res.content
    app = SellerApplication.objects.get(status="pending", store_slug__isnull=False, data__email="nilgiri@example.in")
    slug = app.store_slug
    assert slug not in [s["slug"] for s in anon.get("/api/v1/bootstrap/").json()["stores"]]
    admin = as_user(ADMIN)
    res = admin.post(f"{BASE}/applications/{app.pk}/approve/", {}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "approved"
    assert slug in [s["slug"] for s in anon.get("/api/v1/bootstrap/").json()["stores"]]
    assert Notification.objects.filter(store_slug=slug, data__title="Your store is live!").exists()
    assert AuditLog.objects.filter(action="seller.approved", data__actor="Kavya Iyer").exists()


def test_category_create_appears_in_bootstrap(admin, anon):
    res = admin.post(f"{BASE}/categories/", {"name": "Pottery Studio Supplies", "shortName": "Pottery", "showInNav": True}, format="json")
    assert res.status_code == 200, res.content
    cats = anon.get("/api/v1/bootstrap/").json()["categories"]
    cat = next(c for c in cats if c["name"] == "Pottery Studio Supplies")
    assert cat["slug"] == "pottery-studio-supplies" and cat["showInNav"] and cat["shortName"] == "Pottery"
    assert admin.post(f"{BASE}/categories/", {"name": "pottery studio supplies"}, format="json").status_code == 409
    # hide cascades to sub-categories
    sub = admin.post(f"{BASE}/categories/", {"name": "Guitars", "parentId": cat["id"]}, format="json").json()
    sub_id = next(c["id"] for c in sub if c["name"] == "Guitars")
    admin.post(f"{BASE}/categories/{cat['id']}/active/", {"isActive": False}, format="json")
    cats = {c["id"]: c for c in admin.get(f"{BASE}/categories/").json()}
    assert cats[cat["id"]]["isActive"] is False and cats[sub_id]["isActive"] is False
    assert admin.delete(f"{BASE}/categories/{cat['id']}/").status_code == 409  # has a sub-category
    assert admin.delete(f"{BASE}/categories/{sub_id}/").status_code == 200


def test_settings_whitelist_ignores_unknown_keys(admin):
    res = admin.patch(f"{BASE}/settings/", {"codFee": 25, "idempotency": {"x": 1}, "homeSections": {"heroCarousel": False}, "evil": True}, format="json")
    assert res.status_code == 200
    data = res.json()
    assert data["codFee"] == 25 and "evil" not in data and "idempotency" not in data and "homeSections" not in data


@pytest.mark.parametrize("link", ["javascript:alert(1)", "/\\evil.com", "//evil.com", "http://plain.example"])
def test_ad_link_rejected(admin, link):
    res = admin.post(f"{BASE}/ads/", {"advertiser": "X", "advertiserType": "house", "endsAt": "2026-12-31", "headline": "Hi", "link": link, "pricing": "free",
                                      "slot": "home_strip_top", "startsAt": "2026-11-01"}, format="json")
    assert res.status_code == 400
    assert "Link must be" in res.json()["detail"]


def test_ad_save_whitelists_fields(admin):
    res = admin.post(f"{BASE}/ads/", {"advertiser": "Kartiva", "advertiserType": "house", "clicks": 999999, "endsAt": "2026-12-31", "headline": "Winter sale",
                                      "link": "/c/fashion", "pricing": "free", "slot": "home_strip_top", "spend": 5, "startsAt": "2026-11-01"}, format="json")
    assert res.status_code == 200
    ad = next(a for a in res.json() if a.get("headline") == "Winter sale")
    assert ad["clicks"] == 0 and ad["spend"] == 0 and ad["status"] == "active"


def test_kyc_verify_flips_status_and_notifies_seller(admin, as_user):
    slug = "technest"
    KycDocument.objects.filter(store_slug=slug).delete()
    docs = [KycDocument.create({"fileName": f"{t}.pdf", "note": "", "sizeKb": 10, "status": "pending", "storeSlug": slug, "type": t, "uploadedAt": "2026-11-10T06:30:00.000Z"})
            for t in ("gst_certificate", "pan_card", "cancelled_cheque")]
    for d in docs[:2]:
        assert admin.post(f"{BASE}/kyc/{d.pk}/verified/", {}, format="json").status_code == 200
    res = admin.post(f"{BASE}/kyc/{docs[2].pk}/verified/", {}, format="json")
    assert res.status_code == 200 and res.json()["kycStatus"] == "verified"
    assert Store.objects.get(slug=slug).data["kycStatus"] == "verified"
    bell = as_user("seller@kartiva.demo").get("/api/v1/notifications/").json()
    assert any(n["title"] == "KYC document verified" for n in bell)
    assert admin.post(f"{BASE}/kyc/{docs[0].pk}/rejected/", {"note": ""}, format="json").status_code == 400


def test_forward_rfq_creates_dispatch_and_email(admin):
    rfq = Rfq.objects.filter(status="open").first()
    before = EmailOutbox.objects.count()
    res = admin.post(f"{BASE}/product-requests/{rfq.pk}/forward/", {"note": "Please quote", "storeSlugs": ["technest"]}, format="json")
    assert res.status_code == 200 and res.json()["count"] == 1
    rfq.refresh_from_db()
    d = next(x for x in rfq.data["dispatches"] if x["storeSlug"] == "technest")
    assert d["by"] == "Kavya Iyer" and d["note"] == "Please quote"
    assert EmailOutbox.objects.count() == before + 1
    assert Notification.objects.filter(store_slug="technest", data__title="Product request sent to you by Kartiva").exists()
    reqs = admin.get(f"{BASE}/product-requests/").json()["requests"]
    row = next(r for r in reqs if r["id"] == rfq.pk)
    assert any(x["storeSlug"] == "technest" for x in row["dispatches"]) and row["stats"]["sent"] >= 1
    assert admin.post(f"{BASE}/product-requests/{rfq.pk}/forward/", {"storeSlugs": []}, format="json").status_code == 400


def test_settlement_generate_and_pay(admin):
    overview = admin.get(f"{BASE}/settlements/").json()
    store = next((s for s in overview["stores"] if s["openEntries"] > 0 and s["openAmount"] > 0), None)
    assert store, "demo data should have a store with open ledger entries"
    slug = store["store"]["slug"]
    res = admin.post(f"{BASE}/settlements/", {"storeSlug": slug}, format="json")
    assert res.status_code == 201, res.content
    s = res.json()
    assert s["status"] == "approved"
    assert admin.post(f"{BASE}/settlements/{s['id']}/mark-paid/", {"utr": ""}, format="json").status_code == 400
    paid = admin.post(f"{BASE}/settlements/{s['id']}/mark-paid/", {"utr": "HDFC123"}, format="json")
    assert paid.status_code == 200 and paid.json()["status"] == "paid"
    assert Settlement.objects.get(pk=s["id"]).data["utr"] == "HDFC123"
    assert AuditLog.objects.filter(action="settlement.paid").exists()


def test_broadcast_creates_notifications_and_one_outbox_email(admin, as_user):
    before_mail = EmailOutbox.objects.count()
    res = admin.post(f"{BASE}/broadcasts/", {"audience": "sellers", "body": "Hello sellers", "channels": ["in_app", "email"], "title": "Platform update"}, format="json")
    assert res.status_code == 201, res.content
    assert res.json()["recipients"] > 0 and Broadcast.objects.filter(data__title="Platform update").exists()
    assert Notification.objects.filter(role="seller", data__title="Platform update").count() == 1
    assert EmailOutbox.objects.count() == before_mail + 1
    assert EmailOutbox.objects.first().data["to"] == ["all-sellers@lists.kartiva.in"]
    # plan audience fans out one notification per matching store
    res = admin.post(f"{BASE}/broadcasts/", {"audience": "plan", "planCode": "platinum", "body": "B", "channels": ["in_app"], "title": "Platinum note"}, format="json")
    assert res.status_code == 201
    n = sum(1 for s in Store.objects.filter(status="approved") if (s.data.get("plan") or "free") == "platinum")
    assert Notification.objects.filter(data__title="Platinum note").count() == n
    assert admin.post(f"{BASE}/broadcasts/", {"audience": "sellers", "body": "B", "channels": [], "title": "T"}, format="json").status_code == 400


def test_buyer_update_whitelist(admin):
    res = admin.patch(f"{BASE}/buyers/rahul@kartiva.demo/", {"codBlocked": True, "email": "x@y.z", "name": "Hacker"}, format="json")
    assert res.status_code == 200
    b = res.json()
    assert b["codBlocked"] is True and b["email"] == "rahul@kartiva.demo" and b["name"] != "Hacker"


def test_ticket_reply_notifies_requester(admin):
    tickets = admin.get(f"{BASE}/tickets/").json()["tickets"]
    t = next(x for x in tickets if x["raisedBy"]["role"] == "seller")
    res = admin.post(f"{BASE}/tickets/{t['id']}/reply/", {"body": "We are on it."}, format="json")
    assert res.status_code == 200 and res.json()["messages"][-1]["from"] == "admin"
    assert Notification.objects.filter(store_slug=t["raisedBy"]["storeSlug"], data__title=f"Kartiva replied to {t['number']}").exists()


def test_cms_page_slug_rules(admin):
    assert admin.post(f"{BASE}/pages/", {"body": "x", "slug": "Bad Slug", "title": "T"}, format="json").status_code == 400
    res = admin.post(f"{BASE}/pages/", {"body": "Body", "published": True, "slug": "new-policy", "title": "New policy"}, format="json")
    assert res.status_code == 201
    assert admin.post(f"{BASE}/pages/", {"body": "x", "slug": "new-policy", "title": "Dup"}, format="json").status_code == 409


def test_risk_dismiss_and_restore(admin):
    flags = admin.get(f"{BASE}/risk/").json()["flags"]
    assert flags
    key = flags[0]["key"]
    admin.post(f"{BASE}/risk/dismiss/", {"key": key}, format="json")
    after = admin.get(f"{BASE}/risk/").json()
    assert key not in [f["key"] for f in after["flags"]] and after["dismissedCount"] == 1
    assert admin.post(f"{BASE}/risk/restore/", {}, format="json").json() == 1
