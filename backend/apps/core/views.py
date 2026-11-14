from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.catalog.models import Category, Product, Store
from apps.marketing.models import Ad, AdSlot

from .services import get_platform, get_singleton


@api_view(["GET"])
def health(request):
    """Liveness + DB check for uptime monitors and Render/ALB health checks. No secrets."""
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        db = "ok"
    except Exception:  # noqa: BLE001
        db = "down"
    return Response({"db": db, "status": "ok" if db == "ok" else "degraded", "version": settings.APP_VERSION}, status=200 if db == "ok" else 503)


def public_product(p, stores, categories):
    store = stores.get(p.get("storeSlug"))
    cat = categories.get(p.get("categorySlug"))
    return p.get("status") == "active" and not p.get("deletedAt") and store and store.get("status") == "approved" and (cat is None or cat.get("isActive") is not False)


@api_view(["GET"])
def bootstrap(request):
    """Reference data the storefront keeps in memory (menus, stores, catalogue, ads, platform settings).
    The frontend hydrates its in-memory arrays from this once at start-up (src/api/bootstrap.js)."""
    stores = [s.to_dict() for s in Store.objects.all()]
    categories = [c.to_dict() for c in Category.objects.all()]
    by_store = {s["slug"]: s for s in stores}
    by_cat = {c["slug"]: c for c in categories}
    products = [p.data for p in Product.objects.filter(deleted_at__isnull=True)]
    platform = {k: v for k, v in get_platform().items() if k not in {"idempotency", "dismissedRiskFlags"}}
    return Response({
        "adSlots": [a.to_dict() for a in AdSlot.objects.all()],
        "ads": [a.to_dict() for a in Ad.objects.exclude(status="deleted")],
        "announcement": get_singleton("announcement"),
        "categories": categories,
        "platform": platform,
        "products": [p for p in products if public_product(p, by_store, by_cat)],
        "stores": [s for s in stores if s.get("status") == "approved"],
    })
