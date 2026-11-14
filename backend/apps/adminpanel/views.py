"""Admin API — port of frontend src/api/adminApi.js (dashboard, catalogue moderation, categories, sellers & stores,
buyers, orders, returns & COD refunds, commission, settlements, ads, reports, reviews, audit log, platform settings).
Every endpoint requires an admin JWT; every write is audit-logged with the signed-in admin's name."""
import json
import re
from functools import wraps

from django.core.management import call_command
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.models import User
from apps.catalog.models import Category, Product, Review, Store
from apps.catalog.services import build_reviews, summarize_product
from apps.core.errors import ApiError
from apps.core.models import AuditLog
from apps.core.permissions import actor_name, require_admin
from apps.core.services import atomic, audit, get_platform, notify, now_iso, save_platform
from apps.marketing.models import Ad, AdSlot
from apps.orders import services as orders
from apps.orders.models import Buyer, CommissionRule, Order, Refund, Return, SellerApplication, Settlement

from . import services as svc


def admin_api(*methods):
    """@api_view + require_admin; the view may return plain data (wrapped in a Response)."""
    def deco(fn):
        @wraps(fn)
        def view(request, *args, **kwargs):
            require_admin(request)
            result = fn(request, *args, **kwargs)
            return result if isinstance(result, Response) else Response(result)
        return api_view(list(methods))(view)
    return deco


def actor(request):
    return actor_name(request.user)


def body(request):
    return request.data if isinstance(request.data, dict) else {}


def get_or_404(qs, message):
    obj = qs.first()
    if not obj:
        raise ApiError(message, 404)
    return obj


# ---------- Dashboard ----------
@admin_api("GET")
def dashboard(request):
    return svc.dashboard()


# ---------- Categories ----------
def category_list():
    return [c.data for c in Category.objects.all()]


@admin_api("GET", "POST")
def categories(request):
    if request.method == "GET":
        counts = {}
        for slug in Product.objects.filter(deleted_at__isnull=True).values_list("category_slug", flat=True):
            counts[slug] = counts.get(slug, 0) + 1
        return [{**c, "productCount": counts.get(c.get("slug"), 0)} for c in category_list()]
    return save_category(request, None)


def _num_or_none(v):
    if v == "" or v is None:
        return None
    try:
        return float(v) if not float(v).is_integer() else int(float(v))
    except (TypeError, ValueError):
        raise ApiError("Enter a valid number.")


def save_category(request, pk):
    data = body(request)
    name = str(data.get("name") or "").strip()
    if not name:
        raise ApiError("Enter a category name.")
    parent_id = int(data["parentId"]) if data.get("parentId") not in (None, "", 0, "0") else None
    with atomic():
        cats = list(Category.objects.select_for_update().all())
        parent = next((c for c in cats if c.pk == parent_id), None) if parent_id else None
        if parent_id and not parent:
            raise ApiError("Parent category not found.", 404)
        if parent and parent.data.get("parentId"):
            raise ApiError("Categories can be 2 levels deep: category → sub-category.")
        if any(c.pk != pk and c.data.get("parentId") == parent_id and str(c.data.get("name", "")).lower() == name.lower() for c in cats):
            raise ApiError("A category with this name already exists here.", 409)
        fields = {
            "defaultGstRate": _num_or_none(data.get("defaultGstRate")), "defaultHsn": str(data.get("defaultHsn") or "").strip() or None,
            "description": str(data.get("description") or "").strip(), "isActive": data.get("isActive") is not False, "name": name, "parentId": parent_id,
            "returnWindowDays": _num_or_none(data.get("returnWindowDays")),
            "shortName": None if parent_id else (str(data.get("shortName") or "").strip() or None), "showInNav": False if parent_id else bool(data.get("showInNav")),
        }
        who = actor(request)
        if pk:
            existing = next((c for c in cats if c.pk == pk), None)
            if not existing:
                raise ApiError("Category not found.", 404)
            if parent_id == existing.pk:
                raise ApiError("A category can't be its own parent.")
            if parent_id and any(c.data.get("parentId") == existing.pk for c in cats):
                raise ApiError("This category has sub-categories, so it must stay at the top level.")
            existing.update(**fields)
            audit("category.updated", f"Category {name}", f"Updated “{name}”", who)
        else:
            new_id = max((c.pk for c in cats), default=0) + 1
            slug = svc.slugify(name)
            if any(c.data.get("slug") == slug for c in cats):
                slug = f"{slug}-{new_id}"
            Category.create({**fields, "id": new_id, "slug": slug, "sortOrder": len(cats)})
            audit("category.created", f"Category {name}", f"Created sub-category “{name}” under {parent.data.get('name')}" if parent else f"Created top-level category “{name}”", who)
    return category_list()


@admin_api("PATCH", "DELETE")
def category_detail(request, pk):
    if request.method == "PATCH":
        return save_category(request, pk)
    with atomic():
        cat = get_or_404(Category.objects.select_for_update().filter(pk=pk), "Category not found.")
        if Category.objects.filter(parent_id=pk).exists():
            raise ApiError("Delete or move its sub-categories first.", 409)
        if Product.objects.filter(category_slug=cat.data.get("slug"), deleted_at__isnull=True).exists():
            raise ApiError("This category has products. Hide it instead, or move the products first.", 409)
        name = cat.data.get("name")
        cat.delete()
        audit("category.deleted", f"Category {name}", f"Deleted “{name}”", actor(request))
    return category_list()


@admin_api("POST")
def category_active(request, pk):
    is_active = bool(body(request).get("isActive"))
    with atomic():
        cat = get_or_404(Category.objects.select_for_update().filter(pk=pk), "Category not found.")
        cat.update(isActive=is_active)
        for child in Category.objects.select_for_update().filter(parent_id=pk):
            child.update(isActive=is_active)
        name = cat.data.get("name")
        audit("category.activated" if is_active else "category.hidden", f"Category {name}", f"{name} {'shown in' if is_active else 'hidden from'} the storefront", actor(request))
    return cat.data


@admin_api("POST")
def category_move(request, pk):
    direction = 1 if int(body(request).get("direction") or 0) > 0 else -1
    with atomic():
        cat = get_or_404(Category.objects.select_for_update().filter(pk=pk), "Category not found.")
        siblings = list(Category.objects.select_for_update().filter(parent_id=cat.data.get("parentId")).order_by("sort_order", "id")) if cat.data.get("parentId") \
            else list(Category.objects.select_for_update().filter(parent_id__isnull=True).order_by("sort_order", "id"))
        idx = next(i for i, c in enumerate(siblings) if c.pk == cat.pk)
        j = idx + direction
        if 0 <= j < len(siblings):
            siblings[idx], siblings[j] = siblings[j], siblings[idx]
            for order, c in enumerate(siblings):
                if c.data.get("sortOrder") != order:
                    c.update(sortOrder=order)
    return category_list()


# ---------- Products ----------
@admin_api("GET")
def products(request):
    return [{**p.data, "summary": summarize_product(p.data)} for p in Product.objects.filter(deleted_at__isnull=True)]


PRODUCT_ACTIONS = {"activate", "approve", "deactivate", "feature", "reject"}


@admin_api("POST")
def product_moderate(request, pk, action):
    if action not in PRODUCT_ACTIONS:
        raise ApiError("Unknown action.")
    reason = body(request).get("reason")
    with atomic():
        row = get_or_404(Product.objects.select_for_update().filter(pk=pk), "Product not found.")
        p = row.data
        if action == "approve":
            p.update({"rejectionReason": None, "status": "active"})
            p["publishedAt"] = p.get("publishedAt") or now_iso()
        if action == "reject":
            if not str(reason or "").strip():
                raise ApiError("Give the seller a reason.")
            p.update({"rejectionReason": reason, "status": "rejected"})
        if action == "deactivate":
            p["status"] = "inactive"
        if action == "activate":
            p["status"] = "active"
        if action == "feature":
            p["isFeatured"] = not p.get("isFeatured")
        row.save()
        audit(f"product.{action}", f"Product #{row.pk}", f"{p.get('name')}{f' — {reason}' if reason else ''}", actor(request))
    return p


# ---------- Orders ----------
@admin_api("GET")
def orders_list(request):
    return [o.data for o in Order.objects.all()]


@admin_api("GET")
def sub_order_detail(request, number):
    order, sub = orders.find_sub_order(number)
    return {"order": order.data, "sub": sub}


@admin_api("POST")
def sub_order_status(request, number):
    data = body(request)
    to_status = data.get("toStatus")
    note = data.get("note")
    result = orders.transition_sub_order(number, to_status, actor="admin", carrier=data.get("carrier"), note=note, tracking_number=data.get("trackingNumber"))
    audit(f"order.{to_status}", f"Sub-order {number}", note if note is not None else f"Marked {to_status} by admin", actor(request))
    return result


# ---------- Seller applications & stores ----------
COLORS = ["#0891b2", "#9333ea", "#16a34a", "#dc2626", "#ca8a04", "#2563eb"]


@admin_api("GET")
def applications(request):
    return [a.data for a in SellerApplication.objects.all()]


@admin_api("POST")
def application_decide(request, pk, action):
    if action not in ("approve", "reject"):
        raise ApiError("Unknown action.")
    reason = body(request).get("reason")
    with atomic():
        row = get_or_404(SellerApplication.objects.select_for_update().filter(pk=pk), "Application not found.")
        app = row.data
        app.update({"decidedAt": now_iso(), "decisionReason": reason, "status": "approved" if action == "approve" else "rejected"})
        own = Store.objects.select_for_update().filter(slug=app.get("storeSlug")).first() if app.get("storeSlug") else None
        if own:
            # Self-registered seller: their store already exists (pending) — approving makes it live.
            own.update(status="approved" if action == "approve" else "rejected")
            name = own.data.get("name")
            notify({"role": "seller", "storeSlug": own.slug}, "Your store is live!" if action == "approve" else "Seller application not approved",
                   f"{name} is now visible to buyers." if action == "approve" else (reason or "Please contact support."), "/seller")
        elif action == "approve" and not Store.objects.filter(slug=svc.slugify(app.get("business", ""))).exists():
            color = COLORS[row.pk % len(COLORS)]
            parts = [x.strip() for x in str(app.get("city") or "").split(",")]
            city, state = parts[0], parts[1] if len(parts) > 1 else None
            business = app.get("business") or ""
            gstin = app.get("gstin") or ""
            Store.create({
                "banner": f"linear-gradient(120deg,#0f172a,{color} 60%,{color}cc)", "city": city, "color": color, "gstStateCode": gstin[:2], "gstin": gstin,
                "initials": "".join(w[0] for w in business.split() if w)[:2].upper(), "isFeatured": False, "name": business, "rating": 0, "ratingCount": 0,
                "returnPolicy": "7-day returns on unused items.",
                "shippingMethods": [{"codAllowed": True, "fee": 49, "freeAbove": 499, "id": 900 + row.pk, "maxDays": 7, "minDays": 3, "name": "Standard Delivery", "type": "standard"}],
                "since": 2026, "slug": svc.slugify(business), "state": state, "status": "approved", "tagline": f"{app.get('category')} from {city}",
            })
        row.save()
        audit(f"seller.{app['status']}", f"Seller application #{row.pk}", f"{app.get('business')}{f' — {reason}' if reason else ''}", actor(request))
    return app


@admin_api("GET")
def stores(request):
    return svc.stores_overview()


@admin_api("POST")
def store_status(request, slug):
    data = body(request)
    status = data.get("status")
    if status not in ("suspended", "approved"):
        raise ApiError("Unknown status.")
    reason = data.get("reason")
    with atomic():
        row = get_or_404(Store.objects.select_for_update().filter(slug=slug), "Store not found.")
        row.update(status=status, suspensionReason=reason if status == "suspended" else None)
        audit("seller.suspended" if status == "suspended" else "seller.reactivated", row.data.get("name"), reason if reason is not None else "Reactivated", actor(request))
    return row.data


@admin_api("POST")
def store_feature(request, slug):
    with atomic():
        row = get_or_404(Store.objects.select_for_update().filter(slug=slug), "Store not found.")
        row.update(isFeatured=not row.data.get("isFeatured"))
        audit("store.featured", row.data.get("name"), "Featured on homepage" if row.data["isFeatured"] else "Removed from homepage", actor(request))
    return row.data


@admin_api("GET")
def store_ledger(request, slug):
    get_or_404(Store.objects.filter(slug=slug), "Store not found.")
    return orders.ledger_for(slug)


# ---------- Buyers ----------
@admin_api("GET")
def buyers(request):
    return svc.buyers_overview()


@admin_api("PATCH")
def buyer_update(request, email):
    patch = body(request)
    with atomic():
        row = get_or_404(Buyer.objects.select_for_update().filter(email=email), "Buyer not found.")
        # Only these fields can be changed here (no mass assignment of email, name, etc.).
        changes = {k: patch[k] for k in ("codBlocked", "isActive") if isinstance(patch.get(k), bool)}
        if not changes:
            raise ApiError("Nothing to update.")
        row.update(**changes)
        if "isActive" in changes:  # a deactivated buyer can't sign in any more
            User.objects.filter(email=email, role="buyer").update(is_active=changes["isActive"])
        b = row.data
        action = ("buyer.cod_blocked" if patch["codBlocked"] else "buyer.cod_unblocked") if "codBlocked" in changes else ("buyer.activated" if patch.get("isActive") else "buyer.deactivated")
        audit(action, b.get("name"), b.get("email"), actor(request))
    return b


# ---------- Returns & refunds ----------
@admin_api("GET")
def returns(request):
    return [r.data for r in Return.objects.all()]


@admin_api("POST")
def return_action(request, pk, action):
    data = body(request)
    ret = orders.update_return_in_db(pk, action, actor="admin", note=data.get("note"), reason=data.get("reason"), restock=data.get("restock", True) is not False,
                                     tracking_number=data.get("trackingNumber"))
    audit(f"return.{action}", f"Return {ret['number']}", data.get("reason") or f"Admin {action}", actor(request))
    return ret


@admin_api("GET")
def refunds(request):
    return [r.data for r in Refund.objects.all()]


@admin_api("POST")
def refund_mark_paid(request, pk):
    utr = str(body(request).get("utr") or "").strip()
    r = orders.mark_refund_paid_in_db(pk, utr)
    audit("refund.paid", f"Refund #{pk}", f"₹{r['amount']} to {r.get('payoutTo')} · UTR {utr}", actor(request))
    return r


# ---------- Commission ----------
def rule_list():
    return [r.data for r in CommissionRule.objects.all()]


@admin_api("GET", "POST")
def commission_rules(request):
    if request.method == "GET":
        return rule_list()
    return save_rule(request, None)


def save_rule(request, pk):
    rule = body(request)
    try:
        rate = float(rule.get("rate"))
    except (TypeError, ValueError):
        rate = float("nan")
    if rate != rate or rate < 0 or rate > 100:
        raise ApiError("Rate must be between 0 and 100.")
    rate = int(rate) if rate.is_integer() else rate
    scope = rule.get("scope")
    if scope not in ("global", "category", "store"):
        raise ApiError("Choose what the rule applies to.")
    clean = {"isActive": rule.get("isActive") is not False, "rate": rate, "scope": scope}
    if scope == "category":
        if not Category.objects.filter(slug=rule.get("categorySlug")).exists():
            raise ApiError("Choose a category.")
        clean["categorySlug"] = rule["categorySlug"]
    if scope == "store":
        if not Store.objects.filter(slug=rule.get("storeSlug")).exists():
            raise ApiError("Choose a store.")
        clean["storeSlug"] = rule["storeSlug"]
    with atomic():
        rows = list(CommissionRule.objects.select_for_update().all())
        dup = next((r for r in rows if r.pk != pk and r.data.get("isActive") and r.data.get("scope") == scope and r.data.get("categorySlug") == clean.get("categorySlug")
                    and r.data.get("storeSlug") == clean.get("storeSlug")), None)
        if dup:
            raise ApiError("An active rule already exists for this target — edit it instead.", 409)
        if pk:
            row = next((r for r in rows if r.pk == pk), None)
            if not row:
                raise ApiError("Rule not found.", 404)
            if row.data.get("scope") == "global" and scope != "global":
                raise ApiError("The global default must stay global.")
            row.data = {"id": row.pk, **clean}
            row.save()
        else:
            CommissionRule.create(clean)
        target = clean.get("storeSlug") or clean.get("categorySlug") or "Global"
        audit("commission.updated", f"Commission {scope}", f"{target} → {rate}% (applies to new orders)", actor(request))
    return rule_list()


@admin_api("PATCH", "DELETE")
def commission_rule_detail(request, pk):
    if request.method == "PATCH":
        return save_rule(request, pk)
    with atomic():
        row = get_or_404(CommissionRule.objects.select_for_update().filter(pk=pk), "Rule not found.")
        if row.data.get("scope") == "global":
            raise ApiError("The global default can't be deleted.")
        target = row.data.get("storeSlug") or row.data.get("categorySlug")
        row.delete()
        audit("commission.deleted", f"Commission rule #{pk}", f"{target} override removed", actor(request))
    return rule_list()


# ---------- Settlements ----------
@admin_api("GET", "POST")
def settlements(request):
    if request.method == "GET":
        return svc.settlements_overview()
    slug = body(request).get("storeSlug")
    get_or_404(Store.objects.filter(slug=slug), "Store not found.")
    s = orders.generate_settlement_in_db(slug)
    audit("settlement.created", s["number"], f"{slug} · net ₹{s['net']}", actor(request))
    return Response(s, status=201)


@admin_api("POST")
def settlement_mark_paid(request, pk):
    utr = str(body(request).get("utr") or "").strip()
    s = orders.mark_settlement_paid_in_db(pk, utr)
    audit("settlement.paid", s["number"], f"UTR {utr}", actor(request))
    return s


# ---------- Ads ----------
AD_FIELDS = ["advertiser", "advertiserType", "cta", "endsAt", "eyebrow", "headline", "link", "pricing", "slot", "startsAt", "storeSlug", "subtext", "theme"]
AD_STATUSES = {"active", "paused", "rejected", "ended", "scheduled", "pending_approval"}
SAFE_LINK = re.compile(r"^/(?![/\\])|^https://")
# Ad pictures: a browser-shrunk upload (data URL) or an https link (Cloudinary/R2 later). ~600 KB cap keeps the DB small.
SAFE_IMAGE = re.compile(r"^(data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https://\S+)$")
MAX_IMAGE_CHARS = 800_000


def ad_list():
    return [a.data for a in Ad.objects.exclude(status="deleted")]


@admin_api("GET")
def ad_manager(request):
    return {"ads": ad_list(), "slots": [s.data for s in AdSlot.objects.all()]}


def _number(v, default=0):
    try:
        n = float(v if v not in (None, "") else default)
    except (TypeError, ValueError):
        raise ApiError("Enter a valid number.")
    return int(n) if n.is_integer() else n


@admin_api("POST")
def ads_create(request):
    return save_ad(request, None)


@admin_api("PATCH", "DELETE")
def ad_detail(request, pk):
    if request.method == "DELETE":
        return delete_ad(request, pk)
    return save_ad(request, pk)


def delete_ad(request, pk):
    """Ads with no billing are removed for good. Ads that already earned money are archived (status "deleted",
    hidden everywhere) so revenue reports, GST and seller settlements stay correct."""
    with atomic():
        row = get_or_404(Ad.objects.select_for_update().filter(pk=pk).exclude(status="deleted"), "Ad not found.")
        name = row.data.get("advertiser")
        if (row.data.get("spend") or 0) > 0 or row.data.get("settlementId"):
            row.update(status="deleted", deletedAt=now_iso())
        else:
            row.delete()
        audit("ad.deleted", f"Ad #{pk}", name, actor(request))
    return ad_list()


def save_ad(request, pk):
    ad = body(request)
    slot_row = AdSlot.objects.filter(key=ad.get("slot")).first()
    if not slot_row:
        raise ApiError("Choose an ad slot.")
    slot = slot_row.data
    if slot.get("format") == "sponsored_products" and not ad.get("productId"):
        raise ApiError("Sponsored slots need a product.")
    if slot.get("format") != "sponsored_products" and not str(ad.get("headline") or "").strip():
        raise ApiError("Banner and carousel ads need a headline.")
    link = ad.get("link")
    if link and not SAFE_LINK.search(str(link)):
        raise ApiError("Link must be an internal path (/...) or an https:// URL.")
    if not ad.get("startsAt") or not ad.get("endsAt"):
        raise ApiError("Choose the start and end dates.")
    if str(ad["endsAt"]) < str(ad["startsAt"]):
        raise ApiError("End date must be after the start date.")
    image = str(ad.get("imageUrl") or "").strip()
    if image and (len(image) > MAX_IMAGE_CHARS or not SAFE_IMAGE.match(image)):
        raise ApiError("Ad image must be a JPG, PNG or WebP picture under 600 KB.")
    if ad.get("advertiserType") == "seller" and not Store.objects.filter(slug=ad.get("storeSlug")).exists():
        raise ApiError("Choose the advertising store.")
    # Whitelisted fields only — stats (impressions, clicks, spend) and settlement links can't be set from the form.
    clean = {k: ad[k] for k in AD_FIELDS if ad.get(k) is not None}
    if ad.get("productId"):
        clean["productId"] = int(_number(ad["productId"]))
    clean["imageUrl"] = image or None
    clean["rate"] = _number(ad.get("rate"), 0)
    clean["priority"] = _number(ad.get("priority"), 0)
    today = now_iso()[:10]
    clean["status"] = "paused" if ad.get("status") == "paused" else "scheduled" if clean["startsAt"] > today else "active"
    with atomic():
        if pk:
            row = get_or_404(Ad.objects.select_for_update().filter(pk=pk).exclude(status="deleted"), "Ad not found.")
            row.update(**clean)
        else:
            Ad.create({**clean, "clicks": 0, "impressions": 0, "spend": clean["rate"] if clean.get("pricing") == "fixed" else 0})
        what = clean.get("headline") or f"product #{clean.get('productId')}"
        audit("ad.updated" if pk else "ad.created", f"Ad · {slot.get('name')}", f"{clean.get('advertiser')}: {what}", actor(request))
    return ad_list()


@admin_api("POST")
def ad_status(request, pk):
    status = body(request).get("status")
    if status not in AD_STATUSES:
        raise ApiError("Unknown status.")
    with atomic():
        row = get_or_404(Ad.objects.select_for_update().filter(pk=pk).exclude(status="deleted"), "Ad not found.")
        row.update(status=status)
        audit(f"ad.{status}", f"Ad #{pk}", row.data.get("advertiser"), actor(request))
    return row.data


@admin_api("PATCH")
def ad_slot(request, key):
    data = body(request)
    with atomic():
        row = get_or_404(AdSlot.objects.select_for_update().filter(key=key), "Ad slot not found.")
        name = row.data.get("name")
        if isinstance(data.get("isActive"), bool):
            row.update(isActive=data["isActive"])
            audit("adslot.enabled" if data["isActive"] else "adslot.disabled", name, "Slot enabled" if data["isActive"] else "Slot disabled — nothing renders there", actor(request))
        if "rateLabel" in data:
            label = str(data.get("rateLabel") or "").strip()[:80]
            row.update(rateLabel=label)
            audit("adslot.rate", name, label, actor(request))
    return row.data


# ---------- Reports ----------
@admin_api("GET")
def reports(request):
    return svc.reports(request.query_params.get("from") or None, request.query_params.get("to") or None)


# ---------- Reviews ----------
@admin_api("GET")
def reviews(request):
    return svc.admin_reviews()


@admin_api("PATCH")
def review_hidden(request, review_id):
    hidden = bool(body(request).get("hidden"))
    with atomic():
        row = Review.objects.select_for_update().filter(data__reviewKey=review_id).first()
        if not row and str(review_id).isdigit():
            row = Review.objects.select_for_update().filter(pk=int(review_id)).first()
        if not row:  # product without stored reviews: store its sample reviews first so the flag persists
            pid = str(review_id).split("-")[0]
            product = Product.objects.filter(pk=int(pid)).first() if pid.isdigit() else None
            if not product:
                raise ApiError("Review not found.", 404)
            for r in build_reviews(product.data, 6):
                Review.create({**r, "hidden": False, "productId": product.pk, "reviewKey": r["id"]})
            row = Review.objects.select_for_update().filter(data__reviewKey=review_id).first()
            if not row:
                raise ApiError("Review not found.", 404)
        row.update(hidden=hidden)
        audit("review.hidden" if hidden else "review.restored", f"Review {review_id}", "Hidden from storefront" if hidden else "Restored", actor(request))
    return review_id


# ---------- Audit log & settings ----------
@admin_api("GET")
def audit_log(request):
    return [a.data for a in AuditLog.objects.all()]


EDITABLE = {"address", "cin", "codEnabled", "codFee", "codMaxOrderValue", "commissionGstRate", "defaultCommissionRate", "defaultReturnWindowDays", "gstin", "gstRateChoices",
            "legalName", "lowStockThreshold", "orderPaymentTimeoutMinutes", "productModerationEnabled", "supportEmail", "supportPhone", "tcsRate", "tdsRate", "website"}


@admin_api("GET", "PATCH")
def settings_view(request):
    if request.method == "GET":
        return svc.public_platform()
    patch = body(request)
    with atomic():
        p = get_platform()
        # Whitelist: only known settings keys can be written; internal keys (idempotency, homeSections …) are not editable here.
        clean = {k: v for k, v in patch.items() if k in EDITABLE}
        changed = [k for k in clean if json.dumps(p.get(k), sort_keys=True) != json.dumps(clean[k], sort_keys=True)]
        p.update(clean)
        save_platform(p)
        audit("settings.updated", "Platform settings", f"Changed: {', '.join(changed)}" if changed else "No changes", actor(request))
    return svc.public_platform()


@admin_api("POST")
def reset_demo(request):
    """Reload the demo dataset (= `manage.py seed_demo --reset`). The frontend reloads the page afterwards."""
    who = actor(request)
    call_command("seed_demo", "--reset", verbosity=0)
    audit("demo.reset", "Demo data", "All demo data reset to the original sample", who)
    return {"ok": True}
