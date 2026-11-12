"""Seller Hub helpers shared by views.py (port of src/api/sellerApi.js) and views_growth.py (src/api/sellerGrowthApi.js).

Every lookup is scoped to the signed-in seller's store (request.user.store_slug) — records of other stores are 404,
never 403, so a seller can't probe other sellers' data. The order / market services we reuse don't check ownership."""
import math
import re
from datetime import datetime, timedelta, timezone

from apps.catalog.models import Product, Store
from apps.core.errors import ApiError
from apps.core.permissions import actor_name, require_seller
from apps.market.models import Enquiry, Plan, SellerHub, Subscription
from apps.orders.models import Order
from apps.orders.pricing import js_round, num, parse_ms

IST = timezone(timedelta(hours=5, minutes=30))
DAY_MS = 86_400_000


# ---------- JS-compatible coercion ----------
def js_number(v):
    """Number(v) in JavaScript: "" / None(null) → 0, bad text → NaN, booleans → 0/1."""
    if v is None or v == "":
        return 0.0
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip() or 0)
    except ValueError:
        return math.nan


def as_num(v):
    """Number(v) for storing: ints stay ints (2360, not 2360.0)."""
    return num(js_number(v))


def text(v, max_len=None):
    s = str(v if v is not None else "").strip()
    return s[:max_len] if max_len else s


def iso_ms(dt):
    """JS Date#toISOString()."""
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def now_ms():
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def month_key():
    return datetime.now(timezone.utc).strftime("%Y-%m")


def short_date(ms, fmt="day_month"):
    """toLocaleDateString("en-IN", …) in India time: "12 Nov", "Thu" or "12 Nov 2026"."""
    d = datetime.fromtimestamp(ms / 1000, tz=IST)
    if fmt == "weekday":
        return d.strftime("%a")
    month = "Sept" if d.month == 9 else d.strftime("%b")
    return f"{d.day} {month}" + (f" {d.year}" if fmt == "full" else "")


def slugify(s):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", str(s).lower()))


# ---------- Ownership ----------
def seller(request):
    """→ (user, Store row) for the signed-in seller."""
    user = require_seller(request)
    store = Store.objects.filter(slug=user.store_slug).first()
    if not store:
        raise ApiError("Store not found.", 404)
    return user, store


def own_store(request, lock=False):
    user = require_seller(request)
    qs = Store.objects.filter(slug=user.store_slug)
    if lock:
        qs = qs.select_for_update()
    store = qs.first()
    if not store:
        raise ApiError("Store not found.", 404)
    return user, store


def own_product(store_slug, pid, lock=False):
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        raise ApiError("Product not found.", 404) from None
    qs = Product.objects.filter(pk=pid, store_slug=store_slug, deleted_at__isnull=True)
    if lock:
        qs = qs.select_for_update()
    p = qs.first()
    if not p:
        raise ApiError("Product not found.", 404)
    return p


def store_products(store_slug):
    return [p.data for p in Product.objects.filter(store_slug=store_slug, deleted_at__isnull=True).order_by("-id")]


def sub_orders_of(store_slug, address_key="shippingAddress", extra=True):
    """This store's sub-orders flattened with order-level fields (newest order first) — subOrdersOf() in the mock."""
    out = []
    for order in Order.objects.filter(store_slugs__contains=[store_slug]).order_by("-created_at"):
        o = order.data
        for sub in o.get("subOrders") or []:
            if sub.get("storeSlug") != store_slug:
                continue
            row = {**sub, "buyer": o.get("buyer"), "createdAt": o.get("createdAt"), "orderNumber": o.get("number"), address_key: o.get("address")}
            if extra:
                row["paymentMethod"] = o.get("paymentMethod")
            out.append(row)
    return out


def actor(user, store):
    return actor_name(user) or store.data.get("name")


def hub_data(store_slug):
    """SellerHub row for the store with customerNotes {} and uploads [] defaults."""
    hub, _ = SellerHub.objects.get_or_create(store_slug=store_slug, defaults={"data": {}})
    hub.data.setdefault("customerNotes", {})
    hub.data.setdefault("uploads", [])
    return hub


def time_ms(iso):
    try:
        return parse_ms(iso)
    except (TypeError, ValueError):
        return 0


# ---------- Plan & lead credits ----------
def active_subscription(store_slug):
    return Subscription.objects.filter(store_slug=store_slug, status="active").order_by("id").first()


def plan_of(store):
    code = store.get("plan") or "free"
    p = Plan.objects.filter(code=code).first() or Plan.objects.filter(code="free").first()
    return p.data if p else None


def credits_of(store):
    sub = active_subscription(store["slug"])
    s = sub.data if sub else None
    used = (s.get("leadCreditsUsed") or 0) if s and (not s.get("creditsMonth") or s.get("creditsMonth") == month_key()) else 0
    total = (plan_of(store) or {}).get("leadCredits")
    return {"left": None if total is None else max(0, total - used), "total": total, "used": used}


def consume_credit(store, now):
    sub = Subscription.objects.select_for_update().filter(store_slug=store["slug"], status="active").order_by("id").first()
    if not sub:
        sub = Subscription.create({"amount": 0, "endsAt": None, "invoiceNumber": None, "leadCreditsUsed": 0, "planCode": store.get("plan") or "free",
                                   "startsAt": now, "status": "active", "storeSlug": store["slug"]})
    s = sub.data
    if s.get("creditsMonth") and s["creditsMonth"] != month_key():
        s["leadCreditsUsed"] = 0
    s["creditsMonth"] = month_key()
    s["leadCreditsUsed"] = (s.get("leadCreditsUsed") or 0) + 1
    sub.save()


# ---------- Leads ----------
def response_hours_of(lead):
    responded = lead.get("respondedAt") or (lead.get("updatedAt") if lead.get("status") != "new" else None)
    return max(0, (time_ms(responded) - time_ms(lead.get("createdAt"))) / 3_600_000) if responded else None


def mask_phone(phone):
    return f"{'•' * max(4, len(phone) - 3)}{phone[-3:]}" if phone else ""


def mask_email(email):
    return f"{email[0]}•••••@•••{email[-3:]}" if email else ""


def product_lite(p):
    return {"id": p["id"], "name": p.get("name"), "slug": p.get("slug"), "thumbnail": p.get("thumbnail")} if p else None


def decorate_lead(lead, store):
    locked = (store.get("plan") or "free") == "free"
    product = Product.objects.filter(pk=lead["productId"]).first() if lead.get("productId") else None
    buyer = dict(lead.get("buyer") or {})
    buyer["email"] = mask_email(buyer.get("email")) if locked else buyer.get("email")
    buyer["phone"] = mask_phone(buyer.get("phone")) if locked else buyer.get("phone")
    return {**lead, "buyer": buyer, "contactLocked": locked, "product": product_lite(product.data if product else None), "responseHours": response_hours_of(lead)}


def own_lead(store_slug, pk, lock=False):
    qs = Enquiry.objects.filter(pk=pk, store_slug=store_slug)
    if lock:
        qs = qs.select_for_update()
    lead = qs.first()
    if not lead:
        raise ApiError("Enquiry not found.", 404)
    return lead


# ---------- Deterministic sample traffic (same PRNG as the mock: cyrb-style seed + mulberry32) ----------
M32 = 0xFFFFFFFF


def _imul(a, b):
    return ((a & M32) * (b & M32)) & M32


def seeded(seed_text):
    h = (1779033703 ^ len(seed_text)) & M32
    for ch in seed_text:
        h = _imul(h ^ ord(ch), 3432918353)
        h = ((h << 13) | (h >> 19)) & M32
    state = [h]

    def rand():
        a = (state[0] + 0x6D2B79F5) & M32
        state[0] = a
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rand


def between(rand, lo, hi):
    return lo + rand() * (hi - lo)


def jround(n):
    return int(js_round(n))
