"""Buyer-side marketplace API (port of frontend/src/api/buyerMarketApi.js): enquiries, quote requests (RFQs),
wishlist, profile & addresses, support tickets, CMS pages, announcement, RFQ categories, membership plans.
Buyers only ever see their own data (matched by the JWT's email); 404 for anything else."""
import re
from datetime import datetime, timedelta, timezone

from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.catalog.models import Category, Product, Store
from apps.core.errors import ApiError
from apps.core.permissions import require_user
from apps.core.services import atomic, get_singleton, notify, now_iso
from apps.orders.models import Order, Return

from .models import CmsPage, Enquiry, Plan, Rfq, Thread, Ticket, Wishlist
from .services import dispatch_rfq, open_thread, product_lite, store_lite

HOUR = timedelta(hours=1)
SLA_HOURS = {"high": 8, "low": 72, "medium": 24, "urgent": 4}
TICKET_CATEGORIES = ["orders", "refunds", "payments", "account", "privacy", "dispute", "ip", "violation", "other"]
RFQ_UNITS = ["pcs", "kg", "litre", "set", "box", "project", "unit"]
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
DEMO_ADDRESS = {"city": "Chennai", "fullName": "Priya Raman", "line1": "12, Lake View Apartments, 2nd Main Road", "line2": "Besant Nagar",
                "phone": "9876543210", "pincode": "600090", "state": "Tamil Nadu"}


# ---------- helpers ----------
def clean(value, max_len=2000):
    return str(value if value is not None else "").strip()[:max_len]


def iso_ms(dt):
    """JS Date.toISOString() format."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def require_buyer_role(request):
    user = require_user(request)
    if user.role != "buyer":
        raise ApiError("Please sign in with a buyer account to do this.", 403)
    return user


def full_name(user):
    d = user.data or {}
    return f"{d.get('firstName') or ''} {d.get('lastName') or ''}".strip() or d.get("name") or user.email


def default_address(d):
    addrs = d.get("addresses") or []
    return next((a for a in addrs if a.get("isDefault")), addrs[0] if addrs else None)


def buyer_card(user):
    d = user.data or {}
    card = {"city": d.get("city") or (default_address(d) or {}).get("city") or "", "email": user.email, "name": full_name(user), "phone": d.get("phone") or ""}
    if d.get("businessName"):
        card["businessName"] = d["businessName"]
    return card


def store_dict(slug, approved_only=False):
    qs = Store.objects.filter(slug=slug)
    if approved_only:
        qs = qs.filter(status="approved")
    s = qs.first()
    return s.data if s else None


def is_public_product(p):
    if not p or p.get("status") != "active" or p.get("deletedAt"):
        return False
    if not Store.objects.filter(slug=p.get("storeSlug"), status="approved").exists():
        return False
    cat = Category.objects.filter(slug=p.get("categorySlug")).first()
    return not (cat and cat.data.get("isActive") is False)


def find_product(pid):
    try:
        p = Product.objects.filter(pk=int(pid)).first()
    except (TypeError, ValueError):
        return None
    return p.data if p else None


def as_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ApiError("Not found.", 404) from None


def json_null():
    return HttpResponse("null", content_type="application/json")


# ---------- Enquiries ----------
@api_view(["POST"])
def enquiries(request):
    user = require_buyer_role(request)
    v = request.data
    product = find_product(v.get("productId")) if v.get("productId") else None
    if v.get("productId") and (not product or not is_public_product(product)):
        raise ApiError("Product not found.", 404)
    store_slug = product.get("storeSlug") if product else v.get("storeSlug")
    store = store_dict(store_slug, approved_only=True)
    if not store:
        raise ApiError("Supplier not found.", 404)
    try:
        quantity = max(1, int(float(v.get("quantity") or 1)))
    except (TypeError, ValueError):
        quantity = 1
    message = clean(v.get("message"))
    if len(message) < 10:
        raise ApiError("Please describe your requirement (10+ characters).")
    with atomic():
        at = now_iso()
        record = buyer_card(user)
        buyer = {**record, "city": clean(v.get("city"), 60) or record["city"], "name": clean(v.get("name"), 80) or record["name"], "phone": clean(v.get("phone"), 20) or record["phone"]}
        enquiry = {
            "assignedTo": None, "buyer": buyer, "createdAt": at, "message": message, "notes": [], "productId": product["id"] if product else None, "quantity": quantity,
            "requirementType": "bulk" if quantity >= 10 else "retail", "source": "product" if product else "store", "status": "new", "storeSlug": store_slug,
            "threadId": None, "unit": clean(v.get("unit"), 20) or "unit", "updatedAt": at,
        }
        if v.get("wantsTestRide"):
            enquiry.update({"preferredDate": v.get("preferredDate") or None, "wantsTestRide": True})
        obj = Enquiry.create(enquiry)
        if product:
            subject = f"{product['name']}{' — test ride' if v.get('wantsTestRide') else ' — best price'}"
        else:
            subject = f"Enquiry for {store['name']}"
        first = f"{message}\n\nPreferred test ride date: {v['preferredDate']}" if v.get("wantsTestRide") and v.get("preferredDate") else message
        thread = open_thread(buyer, store_slug, subject, {"id": obj.pk, "type": "enquiry"}, first_message=first, sender="buyer")
        obj.update(threadId=thread.pk)
        what = product["name"] if product else store["name"]
        notify({"role": "seller", "storeSlug": store_slug}, "New enquiry",
               f"{buyer['name']} ({buyer['city'] or '—'}) asked about {what} — {quantity} {enquiry['unit']}{' (test ride requested)' if enquiry.get('wantsTestRide') else ''}.", "/seller/leads")
    return Response(obj.to_dict(), status=201)


@api_view(["GET"])
def my_enquiries(request):
    user = require_user(request)
    rows = sorted((e.data for e in Enquiry.objects.filter(buyer_email=user.email)), key=lambda e: e.get("createdAt") or "", reverse=True)
    return Response([{**e, "product": product_lite(find_product(e["productId"]) if e.get("productId") else None), "store": store_lite(store_dict(e.get("storeSlug")))} for e in rows])


@api_view(["POST"])
def enquiry_thread(request, pk):
    user = require_user(request)
    with atomic():
        obj = Enquiry.objects.select_for_update().filter(pk=pk, buyer_email=user.email).first()
        if not obj:
            raise ApiError("Enquiry not found.", 404)
        e = obj.data
        if e.get("threadId") and Thread.objects.filter(pk=e["threadId"]).exists():
            return Response(e["threadId"])
        product = find_product(e["productId"]) if e.get("productId") else None
        store = store_dict(e.get("storeSlug"))
        subject = product["name"] if product else f"Enquiry for {store['name'] if store else e.get('storeSlug')}"
        thread = open_thread(e["buyer"], e["storeSlug"], subject, {"id": obj.pk, "type": "enquiry"})
        obj.update(threadId=thread.pk)
    return Response(thread.pk)


# ---------- Buy requests (RFQs) ----------
def _categories():
    return [c.data for c in Category.objects.all()]


def leaf_categories(cats=None):
    cats = cats if cats is not None else _categories()
    parent_ids = {c.get("parentId") for c in cats}
    return [c for c in cats if c.get("parentId") and c.get("isActive") is not False and c.get("id") not in parent_ids]


def first_name_of(name=""):
    words = (name or "").split()
    return next((w for w in words if len(w.replace(".", "")) > 1), name)


def stores_for_category(category_slug):
    """Approved stores selling in that category or anywhere under its root category."""
    cats = _categories()
    by_slug = {c["slug"]: c for c in cats}
    by_id = {c["id"]: c for c in cats}
    cur = by_slug.get(category_slug)
    root = cur
    while cur:
        root = cur
        cur = by_id.get(cur.get("parentId"))
    root_slug = root["slug"] if root else category_slug
    slugs = {category_slug, root_slug}

    def walk(slug):
        parent = by_slug.get(slug)
        for child in cats:
            if parent and child.get("parentId") == parent["id"]:
                slugs.add(child["slug"])
                walk(child["slug"])
    walk(root_slug)
    store_slugs = set(Product.objects.filter(category_slug__in=slugs, deleted_at__isnull=True).values_list("store_slug", flat=True))
    return [s.data for s in Store.objects.filter(status="approved", slug__in=store_slugs)]


@api_view(["POST"])
def rfqs(request):
    user = require_buyer_role(request)
    v = request.data
    category = next((c for c in leaf_categories() if c["slug"] == v.get("categorySlug")), None)
    if not category:
        raise ApiError("Please choose a category.", 400)
    try:
        quantity = int(float(v.get("quantity")))
    except (TypeError, ValueError):
        quantity = 0
    if quantity <= 0:
        raise ApiError("Enter a quantity.")
    title = clean(v.get("title"), 120)
    if len(title) < 5:
        raise ApiError("Tell suppliers what you need (5+ characters).")
    try:
        deadline = datetime.fromisoformat(f"{v.get('requiredBy')}T23:59:59+05:30")
    except (TypeError, ValueError):
        deadline = None
    if not deadline or deadline < datetime.now(timezone.utc):
        raise ApiError("The required-by date must be in the future.")
    try:
        target = float(v.get("targetPrice"))
    except (TypeError, ValueError):
        target = 0.0
    if target != target:  # NaN
        target = 0.0
    if target.is_integer():
        target = int(target)
    with atomic():
        rfq = Rfq.create({
            "buyer": buyer_card(user), "categorySlug": category["slug"], "createdAt": now_iso(), "deadline": iso_ms(deadline), "deliveryCity": clean(v.get("deliveryCity"), 60),
            "details": clean(v.get("details")), "quantity": quantity, "quotes": [], "status": "open", "targetPrice": target if target > 0 else None, "title": title,
            "unit": v.get("unit") if v.get("unit") in RFQ_UNITS else "unit",
        })
        stores = stores_for_category(category["slug"])
        dispatch_rfq(rfq, [s["slug"] for s in stores])
        d = rfq.data
        n = len(stores)
        plural = "" if n == 1 else "s"
        notify({"role": "admin"}, "New buy request" if n else "Buy request with no matching suppliers",
               f"{d['buyer']['name']} ({d['deliveryCity']}): {d['title']} — {quantity} {d['unit']}. "
               + (f"{n} supplier{plural} notified." if n else "No seller lists this category yet — invite or notify suppliers."),
               "/admin/product-requests")
        notify({"email": user.email, "role": "buyer"}, "Quote request posted",
               f"{n} verified supplier{plural} notified. Quotes will appear in My quote requests." if n else "We're finding suppliers for this category — you'll be notified when quotes arrive.",
               "/account/enquiries")
    return Response({**rfq.to_dict(), "notifiedSuppliers": n}, status=201)


@api_view(["GET"])
def recent_rfqs(request):
    try:
        limit = max(1, min(50, int(request.query_params.get("limit", 6))))
    except ValueError:
        limit = 6
    names = {c["slug"]: c.get("name") for c in _categories()}
    rows = sorted((r.data for r in Rfq.objects.filter(status="open")), key=lambda r: r.get("createdAt") or "", reverse=True)[:limit]
    return Response([{
        "buyerFirstName": first_name_of(r["buyer"].get("name")), "categoryName": names.get(r.get("categorySlug")) or "", "city": r.get("deliveryCity") or r["buyer"].get("city"),
        "createdAt": r.get("createdAt"), "id": r["id"], "quantity": r.get("quantity"), "quoteCount": len(r.get("quotes") or []), "title": r.get("title"), "unit": r.get("unit"),
    } for r in rows])


@api_view(["GET"])
def my_rfqs(request):
    user = require_user(request)
    names = {c["slug"]: c.get("name") for c in _categories()}
    stores = {s.slug: s.data for s in Store.objects.all()}
    rows = sorted((r.data for r in Rfq.objects.filter(buyer_email=user.email)), key=lambda r: r.get("createdAt") or "", reverse=True)
    return Response([{
        **r, "categoryName": names.get(r.get("categorySlug")) or r.get("categorySlug"),
        "quotes": [{**q, "store": store_lite(stores.get(q.get("storeSlug"))), "total": q["pricePerUnit"] * r["quantity"]}
                   for q in sorted(r.get("quotes") or [], key=lambda q: q.get("pricePerUnit") or 0)],
    } for r in rows])


def own_rfq(user, pk):
    rfq = Rfq.objects.select_for_update().filter(pk=pk, buyer_email=user.email).first()
    if not rfq:
        raise ApiError("Buy request not found.", 404)
    return rfq


@api_view(["POST"])
def accept_quote(request, pk, quote_id):
    user = require_user(request)
    with atomic():
        rfq = own_rfq(user, pk)
        r = rfq.data
        if r.get("status") != "open":
            raise ApiError("This buy request is no longer open.", 409)
        quote = next((q for q in r.get("quotes") or [] if q.get("id") == quote_id), None)
        if not quote or quote.get("status") != "submitted":
            raise ApiError("Quote not found.", 404)
        at = now_iso()
        for q in r["quotes"]:
            if q["id"] == quote["id"]:
                q["status"] = "accepted"
            elif q.get("status") == "submitted":
                q["status"] = "rejected"
            q["decidedAt"] = at
        r.update({"awardedAt": at, "awardedQuoteId": quote["id"], "status": "awarded", "updatedAt": at})
        rfq.save()
        name = r["buyer"].get("name")
        for q in r["quotes"]:
            won = q["id"] == quote["id"]
            notify({"role": "seller", "storeSlug": q.get("storeSlug")}, "Your quote was accepted" if won else "Quote not selected",
                   f"{name} accepted your quote of ₹{_num(q.get('pricePerUnit'))} / {r.get('unit')} for \"{r.get('title')}\". Start a chat to confirm the order." if won
                   else f"{name} chose another supplier for \"{r.get('title')}\".", "/seller/buy-requests")
    return Response(rfq.to_dict())


def _num(n):
    return int(n) if isinstance(n, float) and n.is_integer() else n


@api_view(["POST"])
def close_rfq(request, pk):
    user = require_user(request)
    with atomic():
        rfq = own_rfq(user, pk)
        r = rfq.data
        if r.get("status") != "open":
            raise ApiError("This buy request is no longer open.", 409)
        at = now_iso()
        r.update({"closedAt": at, "status": "closed", "updatedAt": at})
        for q in r.get("quotes") or []:
            if q.get("status") == "submitted":
                q["status"] = "rejected"
            notify({"role": "seller", "storeSlug": q.get("storeSlug")}, "Buy request closed", f"{r['buyer'].get('name')} closed \"{r.get('title')}\" without selecting a quote.", "/seller/buy-requests")
        rfq.save()
    return Response(rfq.to_dict())


@api_view(["POST"])
def rfq_thread(request, pk):
    user = require_user(request)
    store_slug = request.data.get("storeSlug")
    with atomic():
        rfq = own_rfq(user, pk)
        r = rfq.data
        if not any(q.get("storeSlug") == store_slug for q in r.get("quotes") or []):
            raise ApiError("Quote not found.", 404)
        existing = next((t for t in Thread.objects.filter(store_slug=store_slug, buyer_email=user.email)
                         if (t.data.get("context") or {}).get("type") == "rfq" and t.data["context"].get("id") == rfq.pk), None)
        if existing:
            return Response(existing.pk)
        thread = open_thread(r["buyer"], store_slug, f"RFQ: {r.get('title')}", {"id": rfq.pk, "type": "rfq"})
    return Response(thread.pk)


@api_view(["GET"])
def rfq_categories(request):
    cats = _categories()
    by_id = {c["id"]: c for c in cats}
    return Response([{"name": c.get("name"), "parent": (by_id.get(c.get("parentId")) or {}).get("name") or "", "slug": c["slug"]} for c in leaf_categories(cats)])


# ---------- Wishlist ----------
def _signal(p):
    stock = sum(v.get("stock") or 0 for v in p.get("variants") or [])
    if stock > 0 and p["id"] % 4 == 1:
        return "back_in_stock"
    if p["id"] % 3 == 0:
        return "price_drop"
    return None


def summarize_product(p):
    variants = p.get("variants") or []
    if not variants:
        return {"discount": 0, "hasRange": False, "minPrice": None, "mrp": None, "price": None, "totalStock": 0}
    prices = [v.get("price") for v in variants]
    display = next((v for v in variants if v.get("isDefault") and (v.get("stock") or 0) > 0), None) or next((v for v in variants if (v.get("stock") or 0) > 0), None) or variants[0]
    price, mrp = display.get("price"), display.get("mrp")
    discount = round(((mrp - price) / mrp) * 100) if mrp and price is not None and mrp > price else 0
    return {"discount": discount, "hasRange": min(prices) != max(prices), "minPrice": min(prices), "mrp": mrp, "price": price, "totalStock": sum(v.get("stock") or 0 for v in variants)}


def wishlist_ids(email):
    return list(Wishlist.objects.filter(email=email).order_by("-created_at", "-id").values_list("product_id", flat=True))


@api_view(["GET"])
def wishlist_ids_view(request):
    if not request.user or not request.user.is_authenticated:
        return Response([])
    return Response(wishlist_ids(request.user.email))


@api_view(["GET"])
def wishlist(request):
    user = require_user(request)
    out = []
    stores = {s.slug: s.data for s in Store.objects.all()}
    for pid in wishlist_ids(user.email):
        p = find_product(pid)
        if p and is_public_product(p):
            out.append({**p, "signal": _signal(p), "store": stores.get(p.get("storeSlug")), "summary": summarize_product(p)})
    return Response(out)


@api_view(["POST"])
def wishlist_toggle(request):
    user = require_user(request)
    p = find_product(request.data.get("productId"))
    if not p or not is_public_product(p):
        raise ApiError("Product not found.", 404)
    with atomic():
        existing = Wishlist.objects.filter(email=user.email, product_id=p["id"])
        added = not existing.exists()
        if added:
            Wishlist.objects.create(email=user.email, product_id=p["id"])
            extra = Wishlist.objects.filter(email=user.email).order_by("-created_at", "-id").values_list("id", flat=True)[200:]
            Wishlist.objects.filter(id__in=list(extra)).delete()
        else:
            existing.delete()
    return Response({"added": added, "ids": wishlist_ids(user.email)})


# ---------- Profile, addresses, password, privacy ----------
def ensure_addresses(user):
    if "addresses" not in (user.data or {}) or user.data.get("addresses") is None:
        user.data["addresses"] = [{**DEMO_ADDRESS, "id": 1, "isDefault": True, "label": "Home"}] if user.email == "buyer@kartiva.demo" else []
        user.save(update_fields=["data"])
    return user


def local_phone(phone=""):
    digits = re.sub(r"\D", "", str(phone or ""))
    return re.sub(r"^91(?=\d{10}$)", "", digits)


@api_view(["GET", "PATCH"])
def me(request):
    user = require_user(request)
    if request.method == "GET":
        return Response(ensure_addresses(user).public())
    v = request.data
    gstin = clean(v.get("gstin"), 15).upper()
    if gstin and not GSTIN_RE.match(gstin):
        raise ApiError("Enter a valid 15-character GSTIN.")
    phone = local_phone(v.get("phone"))
    if not re.match(r"^[6-9]\d{9}$", phone):
        raise ApiError("Enter a valid 10-digit Indian mobile number.")
    first = clean(v.get("firstName"), 40)
    if len(first) < 2:
        raise ApiError("Enter your first name.")
    user.data.update({"businessName": clean(v.get("businessName"), 120), "city": clean(v.get("city"), 60), "firstName": first, "gstin": gstin,
                      "lastName": clean(v.get("lastName"), 40), "phone": f"+91{phone}"})
    user.save(update_fields=["data"])
    return Response(user.public())


@api_view(["PATCH"])
def notification_prefs(request):
    user = require_user(request)
    v = request.data
    user.data["notificationPrefs"] = {"email": bool(v.get("email")), "sms": bool(v.get("sms")), "whatsapp": bool(v.get("whatsapp"))}
    user.save(update_fields=["data"])
    return Response(user.public())


@api_view(["POST"])
def addresses(request):
    user = ensure_addresses(require_user(request))
    a = request.data
    fields = ["city", "fullName", "label", "line1", "line2", "phone", "pincode", "state"]
    value = {k: clean(a.get(k), 160) for k in fields}
    if not re.match(r"^[1-9]\d{5}$", value["pincode"]):
        raise ApiError("Enter a valid 6-digit PIN code.")
    lst = user.data["addresses"]
    addr_id = a.get("id")
    existing = None
    if addr_id:
        existing = next((x for x in lst if str(x.get("id")) == str(addr_id)), None)
        if not existing:
            raise ApiError("Address not found.", 404)
    if not existing and len(lst) >= 10:
        raise ApiError("You can save up to 10 addresses.")
    if existing:
        existing.update(value)
        saved = existing
    else:
        saved = {**value, "id": max((x.get("id") or 0 for x in lst), default=0) + 1, "isDefault": False}
        lst.append(saved)
    if a.get("isDefault") or len(lst) == 1:
        for x in lst:
            x["isDefault"] = x["id"] == saved["id"]
    user.save(update_fields=["data"])
    return Response(user.public())


@api_view(["DELETE"])
def address_detail(request, addr_id):
    user = ensure_addresses(require_user(request))
    target = next((x for x in user.data["addresses"] if x.get("id") == addr_id), None)
    if not target:
        raise ApiError("Address not found.", 404)
    user.data["addresses"] = [x for x in user.data["addresses"] if x.get("id") != addr_id]
    if target.get("isDefault") and user.data["addresses"]:
        user.data["addresses"][0]["isDefault"] = True
    user.save(update_fields=["data"])
    return Response(user.public())


@api_view(["POST"])
def address_default(request, addr_id):
    user = ensure_addresses(require_user(request))
    if not any(x.get("id") == addr_id for x in user.data["addresses"]):
        raise ApiError("Address not found.", 404)
    for x in user.data["addresses"]:
        x["isDefault"] = x.get("id") == addr_id
    user.save(update_fields=["data"])
    return Response(user.public())


@api_view(["POST"])
def change_password(request):
    user = require_user(request)
    current = str(request.data.get("currentPassword") or "")
    new = str(request.data.get("newPassword") or "")
    if not user.check_password(current):
        raise ApiError("Your current password is incorrect.", 400)
    if len(new) < 8:
        raise ApiError("Password must be at least 8 characters.")
    if new == current:
        raise ApiError("Choose a password you haven't used here before.")
    user.set_password(new)
    user.save(update_fields=["password"])
    return Response({"ok": True})


@api_view(["GET"])
def export_my_data(request):
    user = ensure_addresses(require_user(request))
    return Response({
        "enquiries": [e.data for e in Enquiry.objects.filter(buyer_email=user.email)], "exportedAt": now_iso(),
        "orders": [o.data for o in Order.objects.filter(buyer_email=user.email)], "profile": user.public(),
        "returns": [r.data for r in Return.objects.filter(buyer_email=user.email)], "rfqs": [r.data for r in Rfq.objects.filter(buyer_email=user.email)],
        "supportTickets": [t.data for t in Ticket.objects.filter(raised_by_email=user.email)], "wishlist": wishlist_ids(user.email),
    })


@api_view(["POST"])
def delete_request(request):
    user = require_user(request)
    reason = request.data.get("reason")
    msg = "Please delete my Kartiva account and personal data (DPDP request)." + (f"\n\nReason: {clean(reason, 500)}" if reason else "")
    ticket = create_ticket(user, {"category": "privacy", "message": msg, "orderNumber": "", "priority": "high", "subject": "Account deletion request"})
    return Response(ticket, status=201)


# ---------- Support tickets ----------
def _next_ticket_message_id():
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute(f"SELECT COALESCE(MAX((m->>'id')::bigint), 0) FROM {Ticket._meta.db_table} t, jsonb_array_elements(COALESCE(t.data->'messages', '[]'::jsonb)) m")
        return int(cur.fetchone()[0]) + 1


def create_ticket(user, payload):
    """Shared by buyers (and sellers) — same rules as createTicketInDb() in the mock."""
    subject = clean(payload.get("subject"), 120)
    message = clean(payload.get("message"))
    if len(subject) < 5:
        raise ApiError("Add a short subject (5+ characters).")
    if len(message) < 10:
        raise ApiError("Describe the issue (10+ characters).")
    priority = payload.get("priority") if payload.get("priority") in SLA_HOURS else "medium"
    category = payload.get("category") if payload.get("category") in TICKET_CATEGORIES else "other"
    order_number = payload.get("orderNumber") or None
    if order_number and not Order.objects.filter(number=order_number, buyer_email=user.email).exists():
        order_number = None
    with atomic():
        at = now_iso()
        raised_by = {"email": user.email, "name": full_name(user), "role": user.role}
        if user.role == "seller" and user.store_slug:
            raised_by["storeSlug"] = user.store_slug
        ticket = Ticket.create({
            "assignee": None, "category": category, "createdAt": at,
            "messages": [{"at": at, "body": message, "from": "seller" if user.role == "seller" else "buyer", "id": _next_ticket_message_id()}],
            "number": None, "orderNumber": order_number, "priority": priority, "raisedBy": raised_by,
            "slaDueAt": iso_ms(datetime.now(timezone.utc) + SLA_HOURS[priority] * HOUR), "status": "open", "subject": subject, "updatedAt": at,
        })
        ticket.update(number=f"TKT-{1040 + ticket.pk}")
        notify({"role": "admin"}, "Urgent ticket" if priority == "urgent" else "New support ticket", f"{ticket.data['number']}: {subject} ({raised_by['name']}).", "/admin/support")
    return ticket.to_dict()


@api_view(["GET", "POST"])
def tickets(request):
    user = require_user(request)
    if request.method == "POST":
        return Response(create_ticket(user, request.data), status=201)
    rows = sorted((t.data for t in Ticket.objects.filter(raised_by_email=user.email)), key=lambda t: t.get("updatedAt") or "", reverse=True)
    return Response(rows)


def own_ticket(user, pk):
    t = Ticket.objects.select_for_update().filter(pk=pk, raised_by_email=user.email).first()
    if not t:
        raise ApiError("Ticket not found.", 404)
    return t


@api_view(["POST"])
def ticket_reply(request, pk):
    user = require_user(request)
    text = clean(request.data.get("body"))
    with atomic():
        t = own_ticket(user, pk)
        if not text:
            raise ApiError("Type a message first.")
        at = now_iso()
        d = t.data
        d["messages"].append({"at": at, "body": text, "from": "seller" if user.role == "seller" else "buyer", "id": _next_ticket_message_id()})
        if d.get("status") in ("resolved", "closed"):
            d["status"] = "open"
        d["updatedAt"] = at
        t.save()
        notify({"role": "admin"}, f"Reply on {d['number']}", f"{d['raisedBy'].get('name')}: {text[:100]}", "/admin/support")
    return Response(t.to_dict())


@api_view(["POST"])
def ticket_resolve(request, pk):
    user = require_user(request)
    with atomic():
        t = own_ticket(user, pk)
        if t.data.get("status") in ("resolved", "closed"):
            raise ApiError("This ticket is already resolved.", 409)
        at = now_iso()
        t.update(resolvedAt=at, status="resolved", updatedAt=at)
    return Response(t.to_dict())


# ---------- CMS, announcement, plans ----------
@api_view(["GET"])
def cms_page(request, slug):
    page = CmsPage.objects.filter(slug=slug, published=True).first()
    if not page:
        raise ApiError("Page not found.", 404)
    return Response(page.to_dict())


@api_view(["GET"])
def cms_pages(request):
    return Response([{"group": p.data.get("group") or "about", "slug": p.data.get("slug"), "summary": p.data.get("summary") or "", "title": p.data.get("title")}
                     for p in CmsPage.objects.filter(published=True)])


@api_view(["GET"])
def announcement(request):
    a = get_singleton("announcement")
    if a and a.get("active") and a.get("text"):
        return Response(dict(a))
    return json_null()


@api_view(["GET"])
def plans(request):
    rows = [p.data for p in Plan.objects.all() if p.data.get("isActive") is not False]
    return Response(sorted(rows, key=lambda p: p.get("priceYearly") or 0))
