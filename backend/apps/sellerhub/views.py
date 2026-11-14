"""Seller Hub API (port of frontend src/api/sellerApi.js). The store always comes from the JWT; anything that isn't
this seller's (product, variant, sub-order, return, delivery method) is 404."""
import json
import re
from datetime import datetime, timezone

from django.db import connection
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.catalog.models import Category, Product, Review, StockMovement
from apps.catalog.services import build_reviews, summarize_product
from apps.core.errors import ApiError
from apps.core.services import atomic, audit, get_platform, next_id, now_iso
from apps.marketing.models import Ad, AdSlot
from apps.orders import services as orders
from apps.orders.models import Return, Settlement

from .services import DAY_MS, as_num, iso_ms, js_number, now_ms, own_product, own_store, seller, short_date, slugify, store_products, sub_orders_of, text, time_ms


def max_variant_id():
    with connection.cursor() as cur:
        cur.execute(f"SELECT COALESCE(MAX((v->>'id')::bigint), 0) FROM {Product._meta.db_table} p, "
                    "jsonb_array_elements(COALESCE(p.data->'variants', '[]'::jsonb)) v")
        return int(cur.fetchone()[0])


# ---------- Dashboard ----------
@api_view(["GET"])
def dashboard(request):
    _, store_row = seller(request)
    slug = store_row.slug
    subs = [s for s in sub_orders_of(slug) if s.get("status") != "cancelled"]
    now = now_ms()

    def sum_since(ms):
        return as_num(sum(s.get("total") or 0 for s in subs if now - time_ms(s.get("createdAt")) < ms))

    weeks = []
    for i in range(8):
        end = now - (7 - i) * 7 * DAY_MS
        start = end - 7 * DAY_MS
        weeks.append({"label": short_date(end), "value": as_num(sum(s.get("total") or 0 for s in subs if start < time_ms(s.get("createdAt")) <= end))})
    products = store_products(slug)
    ledger = orders.ledger_for(slug)
    status_counts = {}
    for s in subs:
        status_counts[s["status"]] = status_counts.get(s["status"], 0) + 1
    open_returns = Return.objects.filter(store_slug=slug, status__in=["requested", "approved", "in_transit"]).count()
    low = [{"product": p, "variant": v} for p in products for v in p.get("variants") or [] if (v.get("stock") or 0) <= (v.get("lowStockThreshold") if v.get("lowStockThreshold") is not None else 3)][:8]
    store = store_row.data
    return Response({
        "kpis": {
            "balance": ledger["balance"], "monthSales": sum_since(30 * DAY_MS), "openReturns": open_returns, "pendingInWindow": ledger["pending"],
            "pendingProducts": sum(1 for p in products if p.get("status") == "pending_review"), "rating": store.get("rating"),
            "toShip": status_counts.get("confirmed", 0) + status_counts.get("processing", 0), "todaySales": sum_since(DAY_MS),
            "weekOrders": sum(1 for s in subs if now - time_ms(s.get("createdAt")) < 7 * DAY_MS),
        },
        "lowStock": low, "recentOrders": subs[:6], "salesByWeek": weeks, "statusCounts": status_counts, "store": store,
    })


# ---------- Products ----------
def _apply_b2b(product, b2b):
    for k, v in b2b.items():
        if v is None:
            product.pop(k, None)
        else:
            product[k] = v


def save_product(store_row, pid, payload):
    """saveSellerProduct() in the mock: validation, SKU uniqueness, moderation, B2B fields, opening stock movements."""
    slug = store_row.slug
    platform = get_platform()
    category = Category.objects.filter(slug=payload.get("categorySlug")).first()
    if not category or not category.data.get("parentId"):
        raise ApiError("Choose a sub-category (leaf category).")
    variants_in = payload.get("variants") if isinstance(payload.get("variants"), list) else []
    if not variants_in or not all(isinstance(v, dict) for v in variants_in):
        raise ApiError("Add at least one variant with price and stock.")
    skus = [text(v.get("sku")).upper() for v in variants_in]
    if len(set(skus)) != len(skus):
        raise ApiError("Each variant needs a unique SKU.")
    if any(js_number(v.get("price")) > js_number(v.get("mrp")) for v in variants_in):
        raise ApiError("Price can't be higher than MRP.")
    for v in variants_in:  # the mock trusts the form; the server also refuses junk numbers
        price, mrp, stock = js_number(v.get("price")), js_number(v.get("mrp")), js_number(v.get("stock"))
        if not (price > 0) or not (mrp > 0):
            raise ApiError("Enter a valid price and MRP for every variant.")
        if not (stock >= 0) or stock != int(stock):
            raise ApiError("Stock must be a whole number (0 or more).")
        if not text(v.get("sku")):
            raise ApiError("Each variant needs a unique SKU.")
    try:
        pid_int = int(pid) if pid else None
    except (TypeError, ValueError):
        raise ApiError("Product not found.", 404) from None
    for p in Product.objects.filter(store_slug=slug, deleted_at__isnull=True).exclude(pk=pid_int or 0):
        if any(str(v.get("sku") or "").upper() in skus for v in p.data.get("variants") or []):
            raise ApiError(f"SKU already used by “{p.data.get('name')}”.", 409)

    moderation = platform.get("productModerationEnabled") is not False
    vid = max_variant_id()
    existing = own_product(slug, pid_int, lock=True) if pid_int else None
    old_ids = {v.get("id") for v in (existing.data.get("variants") or [])} if existing else set()
    variants = []
    for i, v in enumerate(variants_in):
        keep_id = v.get("id") if v.get("id") in old_ids else None  # never let a seller claim another product's variant id
        if keep_id is None:
            vid += 1
        low = v.get("lowStockThreshold")
        variants.append({
            "attributes": v.get("attributes") if isinstance(v.get("attributes"), dict) else {}, "id": keep_id if keep_id is not None else vid, "isDefault": i == 0,
            "lowStockThreshold": as_num(3 if low is None else low), "mrp": as_num(v.get("mrp")), "price": as_num(v.get("price")), "sku": skus[i], "stock": int(js_number(v.get("stock"))),
        })
    images = [x for x in (payload.get("images") or []) if x]
    gst_rate = js_number(payload.get("gstRate"))
    if gst_rate != gst_rate:
        raise ApiError("Choose a GST rate.")
    common = {
        "brand": text(payload.get("brand")), "categorySlug": category.slug, "description": text(payload.get("description")), "gstRate": as_num(gst_rate),
        "hsnCode": text(payload.get("hsnCode")), "images": images or ["/placeholder-product.svg"], "isReturnable": bool(payload.get("isReturnable")),
        "name": text(payload.get("name")), "returnWindowDays": platform.get("defaultReturnWindowDays", 7) if payload.get("isReturnable") else 0,
        "specifications": [s for s in (payload.get("specifications") or []) if isinstance(s, dict) and s.get("name") and s.get("value")],
        "thumbnail": images[0] if images else "/placeholder-product.svg", "variantOptions": payload.get("variantOptions") or [], "variants": variants,
    }
    if not common["name"]:
        raise ApiError("Enter a product name.")
    tiers = []
    for t in payload.get("priceTiers") or []:
        tier = {"discountPct": as_num(t.get("discountPct")), "minQty": int(js_number(t.get("minQty")) + 0.5) if js_number(t.get("minQty")) == js_number(t.get("minQty")) else 0}
        if tier["minQty"] > 1 and tier["discountPct"] == tier["discountPct"] and tier["discountPct"] > 0:
            tiers.append(tier)
    if len(tiers) > 3:
        raise ApiError("Up to 3 bulk price slabs are allowed.")
    if any(t["discountPct"] > 60 or (i > 0 and t["minQty"] <= tiers[i - 1]["minQty"]) for i, t in enumerate(tiers)):
        raise ApiError("Slabs need increasing quantities and 1–60% off.")
    moq_raw = js_number(payload.get("moq"))
    moq = max(1, int(moq_raw + 0.5) if moq_raw == moq_raw and moq_raw else 1)
    b2b = {"enquiryOnly": True if payload.get("enquiryOnly") else None, "moq": moq if moq > 1 else None, "priceTiers": tiers or None}

    if existing:
        product = existing.data
        content_changed = any(product.get(k) != common[k] for k in ("name", "description", "categorySlug")) or json.dumps(product.get("images")) != json.dumps(common["images"])
        product.update(common)
        _apply_b2b(product, b2b)
        if payload.get("submit") and moderation and content_changed and product.get("status") == "active":
            product["status"] = "pending_review"
        if payload.get("submit") and product.get("status") == "draft":
            product["status"] = "pending_review" if moderation else "active"
        product["updatedAt"] = now_iso()
        existing.save()
        return product
    new_id = next_id(Product)
    product = {
        **common, "createdAt": now_iso(), "deletedAt": None, "id": new_id, "isFeatured": False, "rating": 0, "reviewCount": 0, "slug": f"{slugify(common['name'])}-{new_id}",
        "soldCount": 0, "status": ("pending_review" if moderation else "active") if payload.get("submit") else "draft", "storeSlug": slug,
    }
    _apply_b2b(product, b2b)
    Product.create(product)
    for v in variants:
        if v["stock"]:
            StockMovement.create({"actor": "seller", "at": now_iso(), "delta": v["stock"], "note": "Opening stock", "productId": new_id, "productName": product["name"],
                                  "reason": "initial", "sku": v["sku"], "stockAfter": v["stock"], "storeSlug": slug, "variantId": v["id"]})
    return product


@api_view(["GET", "POST"])
def products(request):
    _, store_row = seller(request)
    if request.method == "POST":
        with atomic():
            return Response(save_product(store_row, None, request.data), status=201)
    return Response({"results": [{**p, "summary": summarize_product(p)} for p in store_products(store_row.slug)]})


@api_view(["GET", "PATCH", "DELETE"])
def product_detail(request, pk):
    _, store_row = seller(request)
    if request.method == "GET":
        return Response(own_product(store_row.slug, pk).data)
    with atomic():
        if request.method == "PATCH":
            return Response(save_product(store_row, pk, request.data))
        p = own_product(store_row.slug, pk, lock=True)
        p.update(deletedAt=now_iso())
        return Response(p.data)


@api_view(["POST"])
def product_activate(request, pk):
    _, store_row = seller(request)
    with atomic():
        p = own_product(store_row.slug, pk, lock=True)
        if p.data.get("status") != "inactive":
            raise ApiError("Only inactive products can be re-activated.")
        p.update(status="active")
    return Response(p.data)


@api_view(["POST"])
def product_deactivate(request, pk):
    _, store_row = seller(request)
    with atomic():
        p = own_product(store_row.slug, pk, lock=True)
        p.update(status="inactive")
    return Response(p.data)


# ---------- Inventory ----------
@api_view(["POST"])
def variant_stock(request, variant_id):
    _, store_row = seller(request)
    body = request.data
    with atomic():
        product = Product.objects.select_for_update().filter(store_slug=store_row.slug, deleted_at__isnull=True, data__variants__contains=[{"id": variant_id}]).first()
        if not product:
            raise ApiError("Variant not found.", 404)
        variant = next(v for v in product.data["variants"] if v.get("id") == variant_id)
        set_to = body.get("setTo")
        d = js_number(set_to) - variant["stock"] if set_to is not None and set_to != "" else js_number(body.get("delta"))
        if d != d or d != int(d):
            raise ApiError("Enter a whole number.")
        if not d:
            return Response(variant)
        orders.move_stock(variant_id, int(d), "manual_adjustment", note=text(body.get("note")) or "Manual adjustment", actor="seller")
        product.refresh_from_db()
    return Response(next(v for v in product.data["variants"] if v.get("id") == variant_id))


@api_view(["GET"])
def stock_movements(request):
    _, store_row = seller(request)
    return Response({"results": [m.data for m in StockMovement.objects.filter(store_slug=store_row.slug).order_by("-id")[:200]]})


# ---------- Orders ----------
@api_view(["GET"])
def seller_orders(request):
    _, store_row = seller(request)
    return Response({"results": sub_orders_of(store_row.slug)})


@api_view(["POST"])
def order_status(request, number):
    _, store_row = seller(request)
    _, sub = orders.find_sub_order(number)
    if sub.get("storeSlug") != store_row.slug:
        raise ApiError("Order not found.", 404)
    b = request.data
    to_status = b.get("toStatus") or b.get("to_status")
    if to_status not in ("processing", "shipped", "delivered", "undelivered", "cancelled"):
        raise ApiError(f"Can't move from {sub['status']} to {to_status}.", 409)
    result = orders.transition_sub_order(number, to_status, actor="seller", carrier=text(b.get("carrier")) or None, note=b.get("note"),
                                         tracking_number=text(b.get("trackingNumber")) or None)
    return Response(result)


# ---------- Returns ----------
SELLER_RETURN_ACTIONS = ("approve", "reject", "ship_back", "receive")


@api_view(["GET"])
def seller_returns(request):
    _, store_row = seller(request)
    return Response({"results": [r.data for r in Return.objects.filter(store_slug=store_row.slug).order_by("-id")]})


@api_view(["POST"])
def return_action(request, pk, action):
    _, store_row = seller(request)
    if not Return.objects.filter(pk=pk, store_slug=store_row.slug).exists():
        raise ApiError("Return not found.", 404)
    if action not in SELLER_RETURN_ACTIONS:
        raise ApiError("Unknown action.", 400)
    b = request.data
    ret = orders.update_return_in_db(pk, action, actor="seller", note=b.get("note"), reason=b.get("reason"), restock=b.get("restock", True) is not False,
                                     tracking_number=text(b.get("trackingNumber")) or None)
    return Response(ret)


# ---------- Shipping methods ----------
def _clean_method(m):
    free = m.get("freeAbove")
    pins = m.get("pincodes")
    pins = pins if isinstance(pins, list) else [x for x in re.split(r"[\s,]+", str(pins or ""))]
    clean = {
        "codAllowed": bool(m.get("codAllowed")), "fee": as_num(m.get("fee")), "freeAbove": None if free in ("", None) else as_num(free),
        "maxDays": as_num(m.get("maxDays")), "minDays": as_num(m.get("minDays")), "name": text(m.get("name")),
        "pincodes": [str(p).strip() for p in pins if str(p).strip()], "type": m.get("type"),
    }
    if not clean["name"]:
        raise ApiError("Enter a name for this delivery method.")
    if any(v != v for v in (clean["fee"], clean["maxDays"], clean["minDays"])) or clean["fee"] < 0:
        raise ApiError("Enter valid numbers.")
    if clean["maxDays"] < clean["minDays"]:
        raise ApiError("Max days can't be less than min days.")
    return clean


def _next_method_id():
    with connection.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX((m->>'id')::bigint), 0) FROM catalog_store s, jsonb_array_elements(COALESCE(s.data->'shippingMethods', '[]'::jsonb)) m")
        return int(cur.fetchone()[0]) + 1


@api_view(["GET", "POST"])
def shipping_methods(request):
    if request.method == "GET":
        _, store_row = seller(request)
        return Response({"results": store_row.data.get("shippingMethods") or []})
    with atomic():
        _, store_row = own_store(request, lock=True)
        clean = _clean_method(request.data)
        store_row.data.setdefault("shippingMethods", []).append({**clean, "id": _next_method_id()})
        store_row.save()
    return Response(store_row.data["shippingMethods"], status=201)


@api_view(["PATCH", "DELETE"])
def shipping_method_detail(request, pk):
    with atomic():
        _, store_row = own_store(request, lock=True)
        methods = store_row.data.setdefault("shippingMethods", [])
        method = next((m for m in methods if m.get("id") == pk), None)
        if not method:
            raise ApiError("Delivery method not found.", 404)
        if request.method == "PATCH":
            method.update(_clean_method(request.data))
        else:
            if len(methods) == 1:
                raise ApiError("Keep at least one delivery method so buyers can order.")
            store_row.data["shippingMethods"] = [m for m in methods if m.get("id") != pk]
        store_row.save()
    return Response(store_row.data["shippingMethods"])


# ---------- Store profile ----------
STORE_FIELDS = ["name", "tagline", "description", "color", "returnPolicy", "supportEmail", "supportPhone", "city"]


@api_view(["GET", "PATCH"])
def seller_store(request):
    if request.method == "GET":
        _, store_row = seller(request)
        return Response(store_row.data)
    with atomic():
        _, store_row = own_store(request, lock=True)
        s = store_row.data
        for k in STORE_FIELDS:
            if request.data.get(k) is not None:
                s[k] = text(request.data[k], 2000)
        if not s.get("name"):
            raise ApiError("Enter your store name.")
        s["initials"] = "".join(w[0] for w in s["name"].split() if w)[:2].upper()
        s["banner"] = f"linear-gradient(120deg, #0f172a, {s.get('color')} 60%, {s.get('color')}cc)"
        store_row.save()
    return Response(s)


# ---------- Earnings ----------
@api_view(["GET"])
def earnings(request):
    _, store_row = seller(request)
    slug = store_row.slug
    return Response({**orders.ledger_for(slug), "settlements": [s.data for s in Settlement.objects.filter(store_slug=slug).order_by("-id")], "store": store_row.data})


# ---------- Ads ----------
@api_view(["GET", "POST"])
def seller_ads(request):
    user, store_row = seller(request)
    slug = store_row.slug
    if request.method == "GET":
        return Response({"results": [a.data for a in Ad.objects.filter(store_slug=slug).exclude(status="deleted").order_by("id") if a.data.get("advertiserType") == "seller"]})
    b = request.data
    store = store_row.data
    product = own_product(slug, b.get("productId")).data
    slot = b.get("slot")
    slot_def = AdSlot.objects.filter(key=slot).first() if slot else None
    if not slot_def or slot_def.data.get("format") != "sponsored_products":
        raise ApiError("Choose a sponsored-products slot.")
    budget, days = js_number(b.get("budget")), js_number(b.get("days"))
    if not (budget > 0) or days not in (7, 14, 30):
        raise ApiError("Enter a budget and choose a duration.")
    start = now_ms()
    with atomic():
        ad = Ad.create({
            "advertiser": store.get("name"), "advertiserType": "seller", "budget": as_num(budget), "clicks": 0,
            "endsAt": iso_ms(datetime.fromtimestamp((start + int(days) * DAY_MS) / 1000, tz=timezone.utc))[:10],
            "id": next_id(Ad), "impressions": 0, "pricing": "cpc", "productId": product["id"], "rate": 5 if str(slot).startswith("listing") else 4,
            "requestedAt": now_iso(), "slot": slot, "spend": 0, "startsAt": now_iso()[:10], "status": "pending_approval", "storeSlug": slug,
        })
        audit("ad.requested", f"Ad #{ad.pk}", f"{store.get('name')} requested a sponsored ad for “{product['name']}” (budget ₹{as_num(budget)})", store.get("name"))
    return Response(ad.data, status=201)


# ---------- Reviews ----------
@api_view(["GET"])
def seller_reviews(request):
    _, store_row = seller(request)
    out = []
    for p in store_products(store_row.slug)[:12]:
        rows = list(Review.objects.filter(product_id=p["id"]).order_by("id")[:3])
        reviews = ([{**{k: v for k, v in r.data.items() if k not in ("productId", "reviewKey")}, "id": r.data.get("reviewKey") or r.data.get("id"),
                     "hidden": bool(r.data.get("hidden"))} for r in rows]
                   if rows else [{**r, "hidden": False} for r in build_reviews(p, 3)])
        out += [{**r, "productName": p["name"], "productSlug": p["slug"]} for r in reviews]
    return Response({"results": out})
