"""Customer ratings & reviews (port of the review part of frontend src/api/catalogApi.js).

Rules (enforced here, never trusted from the browser):
- Any signed-in BUYER can rate (like Amazon). Reviews backed by a DELIVERED order get "Verified purchase".
  Admin → Settings → "Only buyers who received the product can rate" (platform.reviewsBuyersOnly) restricts it.
- Sellers and admins never rate.
- One review per buyer per product; posting again edits it.
- The buyer's email and order number are stored for checks but never shown publicly.
"""
from apps.core.errors import ApiError
from apps.core.services import atomic, get_platform, now_iso
from apps.orders.models import Order

from .models import Product, Review

PRIVATE = ("hidden", "productId", "reviewKey", "userEmail", "orderNumber", "source")
TITLE_MAX, BODY_MAX = 100, 2000


def estimate_counts(rating, count):
    """Star breakdown {"5": n, …, "1": n} for products that only have a seeded average (same as src/data/reviews.js)."""
    count = int(count or 0)
    if not count:
        return {str(s): 0 for s in (5, 4, 3, 2, 1)}
    weights = {s: max(0.02, 1 - abs(s - (rating or 0)) / 2.5) for s in (5, 4, 3, 2, 1)}
    total = sum(weights.values())
    raw = {s: weights[s] / total * count for s in weights}
    out = {s: int(raw[s]) for s in raw}
    for s in sorted(raw, key=lambda s: (-(raw[s] - out[s]), -s))[: count - sum(out.values())]:  # largest remainder
        out[s] += 1
    return {str(s): out[s] for s in (5, 4, 3, 2, 1)}


def rating_counts(product):
    return product.get("ratingCounts") or estimate_counts(product.get("rating"), product.get("reviewCount"))


def public_review(r):
    out = {k: v for k, v in r.items() if k not in PRIVATE}
    out["id"] = r.get("reviewKey") or r.get("id")
    return out


def stored_reviews(product, sample_builder, count=6, include_hidden=False):
    """Customer reviews (newest first) followed by the product's sample reviews. Each item keeps `hidden` and `mine`-free data."""
    rows = [r.data for r in Review.objects.filter(product_id=product.get("id")).order_by("id")]
    customer = sorted((r for r in rows if r.get("userEmail")), key=lambda r: r.get("updatedAt") or r.get("createdAt") or "", reverse=True)
    samples = [r for r in rows if not r.get("userEmail")]
    if not samples:
        samples = sample_builder(product, count)
    out = []
    for r in [*customer[:20], *samples[:count]]:
        if r.get("hidden") and not include_hidden:
            continue
        out.append({**public_review(r), "hidden": bool(r.get("hidden"))} if include_hidden else public_review(r))
    return out


def _delivered_order(email, product_id):
    """The buyer's delivered order containing this product (newest first), or None."""
    for order in Order.objects.filter(buyer_email=email):
        for sub in order.data.get("subOrders") or []:
            if sub.get("status") == "delivered" and any(it.get("productId") == product_id for it in sub.get("items") or []):
                return order.data
    return None


def buyers_only():
    return get_platform().get("reviewsBuyersOnly") is True


def _own_review(email, product_id):
    return Review.objects.filter(product_id=product_id, data__userEmail=email).first()


def my_review(user, product):
    """GET → {canReview, review}. canReview is False for sellers/admins, and (buyers-only mode) without a delivered order."""
    row = _own_review(user.email, product.pk)
    can = user.role == "buyer" and (not buyers_only() or row is not None or _delivered_order(user.email, product.pk) is not None)
    mine = row and {**public_review(row.data), "hidden": bool(row.data.get("hidden"))}
    return {"canReview": can, "review": mine or None}


def my_reviews(user):
    """All of this buyer's reviews (for the My Orders page): [{productId, rating, …}]."""
    return [{**public_review(r.data), "productId": r.data.get("productId")} for r in Review.objects.filter(data__userEmail=user.email)]


def _clean(body):
    try:
        rating = int(body.get("rating"))
    except (TypeError, ValueError):
        rating = 0
    if rating < 1 or rating > 5:
        raise ApiError("Choose a rating from 1 to 5 stars.")
    title = " ".join(str(body.get("title") or "").split())[:TITLE_MAX]
    text = str(body.get("body") or "").strip()
    if len(text) > BODY_MAX:
        raise ApiError(f"Keep your review under {BODY_MAX} characters.")
    return rating, title, text


def save_review(user, slug, body):
    """POST → create or edit the buyer's review and update the product's average + star breakdown."""
    if user.role != "buyer":
        raise ApiError("Only customers can rate products.", 403)
    rating, title, text = _clean(body if isinstance(body, dict) else {})
    with atomic():
        product = Product.objects.select_for_update().filter(slug=slug, deleted_at__isnull=True).first()
        if not product:
            raise ApiError("Product not found.", 404)
        p = product.data
        row = _own_review(user.email, product.pk)
        order = _delivered_order(user.email, product.pk)
        if not row and not order and buyers_only():
            raise ApiError("You can rate this product once your order has been delivered.", 403)

        counts = rating_counts(p)
        n = int(p.get("reviewCount") or 0)
        avg = float(p.get("rating") or 0)
        now = now_iso()
        if row:
            old = int(row.data.get("rating") or 0)
            counts[str(old)] = max(0, counts.get(str(old), 0) - 1)
            counts[str(rating)] = counts.get(str(rating), 0) + 1
            avg = (avg * n - old + rating) / n if n else rating
            row.update(rating=rating, title=title, body=text, updatedAt=now, verified=bool(order),
                       orderNumber=order.get("number") if order else row.data.get("orderNumber"))
        else:
            profile = user.data or {}
            first, last = (profile.get("firstName") or "").strip(), (profile.get("lastName") or "").strip()
            author = f"{first} {last[:1]}.".strip() if first and last else (first or "Kartiva customer")
            addresses = profile.get("addresses") or []
            home = next((a for a in addresses if a.get("isDefault")), addresses[0] if addresses else {})
            city = ((order or {}).get("address") or {}).get("city") or home.get("city", "")
            row = Review.create({"author": author, "body": text, "city": city, "createdAt": now, "helpful": 0, "hidden": False,
                                 "orderNumber": order.get("number") if order else None, "productId": product.pk, "rating": rating,
                                 "source": "customer", "title": title, "updatedAt": now, "userEmail": user.email, "verified": bool(order)})
            row.update(reviewKey=f"c{row.pk}")
            counts[str(rating)] = counts.get(str(rating), 0) + 1
            avg = (avg * n + rating) / (n + 1)
            n += 1
            p["customerReviewCount"] = int(p.get("customerReviewCount") or 0) + 1
        p.update(rating=round(avg, 2), reviewCount=n, ratingCounts=counts)
        product.save()
    return {**public_review(row.data), "hidden": bool(row.data.get("hidden"))}


def customer_reviews(store_slug=None, limit=200):
    """Customers' reviews for the admin / seller review screens (newest first), with product name + hidden flag.
    store_slug limits the list to one seller's products (a seller never sees another store's reviews)."""
    products = Product.objects.filter(store_slug=store_slug) if store_slug else Product.objects.all()
    by_id = {p.pk: p.data for p in products.only("id", "data")}
    out = []
    for r in Review.objects.filter(data__source="customer", product_id__in=list(by_id)).order_by("-id")[:limit]:
        p = by_id[r.data.get("productId")]
        out.append({**public_review(r.data), "hidden": bool(r.data.get("hidden")), "productName": p.get("name"), "productSlug": p.get("slug"),
                    "storeSlug": p.get("storeSlug")})
    return out
