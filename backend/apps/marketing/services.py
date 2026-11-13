"""Ad serving — port of getSlotAds() in frontend src/api/adsApi.js (contextual targeting + impressions)."""
import random
from datetime import timezone as dt_timezone

from django.utils import timezone

from apps.catalog.models import Product
from apps.catalog.services import Catalog, summarize_product
from apps.core.services import atomic

from .models import Ad, AdSlot


def _today():
    """UTC date, like new Date().toISOString().slice(0, 10) in the mock."""
    return timezone.now().astimezone(dt_timezone.utc).date().isoformat()


def matches_context(product, cat, category_slug=None, query=None, exclude_product_id=None):
    """Product ads only: on a category page products from that category tree, on a search page products matching
    the query, on a product page everything but the product itself. Banner / house ads (no product) always match."""
    if not product:
        return True
    if exclude_product_id is not None and product.get("id") == exclude_product_id:
        return False
    if category_slug and product.get("categorySlug") not in cat.with_descendants(category_slug):
        return False
    if query:
        trail = " ".join(c.get("name") or "" for c in cat.trail(product.get("categorySlug")))
        haystack = f"{product.get('name')} {product.get('brand')} {trail}".lower()
        terms = [t for t in query.lower().split() if len(t) > 1]
        if terms and not any(t in haystack for t in terms):
            return False
    return True


def slot_ads(slot_key, category_slug=None, query=None, exclude_product_id=None):
    """→ {items: live ads for the slot (highest priority first, max slot.maxItems) with product resolved, slot}."""
    slot_row = AdSlot.objects.filter(key=slot_key).first()
    slot = slot_row.data if slot_row else None
    if slot and slot.get("isActive") is False:
        return {"items": [], "slot": slot}
    today = _today()
    ads = [a.data for a in Ad.objects.filter(slot=slot_key, status="active")
           if (a.data.get("startsAt") or "") <= today and (a.data.get("endsAt") or "") >= today]
    cat = Catalog()
    ids = {a.get("productId") for a in ads if a.get("productId")}
    products = {p.pk: p.data for p in Product.objects.filter(pk__in=ids)}
    live = []
    for ad in ads:
        if ad.get("productId"):
            product = products.get(ad["productId"])
            if not product or not cat.is_public(product) or not matches_context(product, cat, category_slug, query, exclude_product_id):
                continue
        live.append(ad)
    # Banners rotate: equal-priority ads are shuffled so every matching advertiser gets shown.
    if (slot or {}).get("format") == "banner":
        random.shuffle(live)
    live.sort(key=lambda a: a.get("priority") or 0, reverse=True)  # stable sort keeps the shuffle within a priority
    items = []
    for ad in live[: (slot or {}).get("maxItems") or 1]:
        product = products.get(ad.get("productId")) if ad.get("productId") else None
        items.append({**ad, "product": {**product, "store": cat.stores.get(product.get("storeSlug")), "summary": summarize_product(product)} if product else None})
    return {"items": items, "slot": slot}


def track_impressions(ids):
    clean = []
    for i in ids or []:
        try:
            clean.append(int(i))
        except (TypeError, ValueError):
            continue
    if not clean:
        return 0
    with atomic():
        rows = list(Ad.objects.select_for_update().filter(pk__in=clean[:50]))
        for ad in rows:
            ad.data["impressions"] = (ad.data.get("impressions") or 0) + 1
            ad.save()
    return len(rows)
