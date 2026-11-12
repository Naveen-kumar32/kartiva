"""'What's new' for sellers and admins (port of frontend src/api/activityApi.js): last-seen per user + page area,
and sidebar badge counts."""
from datetime import timedelta, timezone as dt_timezone

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.models import SeenMarker
from apps.core.errors import ApiError
from apps.core.permissions import require_user
from apps.market.models import Enquiry, KycDocument, Rfq, Thread, Ticket

from .models import Order, Return, SellerApplication

DEFAULT_LOOKBACK = timedelta(hours=24)  # first visit: anything from the last 24 h counts as new
REPEAT = timedelta(seconds=10)  # StrictMode double mounts / quick re-renders return the same "previous visit"


def _iso(dt):
    return dt.astimezone(dt_timezone.utc).isoformat().replace("+00:00", "Z")


def _area(request):
    area = str((request.data.get("area") if request.method == "POST" else request.query_params.get("area")) or "").strip()
    if not area or len(area) > 40:
        raise ApiError("Unknown area.")
    return area


def last_seen(user, area):
    marker = SeenMarker.objects.filter(user=user, area=area).first()
    return marker.at if marker else timezone.now() - DEFAULT_LOOKBACK


@api_view(["GET", "POST"])
def seen(request):
    """GET /activity/seen/?area=orders → {lastSeen}. POST {area} → records "now", returns {previous, changed}
    (the previous visit, so rows newer than it get a NEW badge)."""
    user = require_user(request)
    area = _area(request)
    if request.method == "GET":
        return Response({"lastSeen": _iso(last_seen(user, area))})
    now = timezone.now()
    marker = SeenMarker.objects.filter(user=user, area=area).first()
    if marker and now - marker.at < REPEAT:
        return Response({"changed": False, "previous": _iso(marker.prev)})
    previous = marker.at if marker else now - DEFAULT_LOOKBACK
    SeenMarker.objects.update_or_create(user=user, area=area, defaults={"at": now, "prev": previous})
    return Response({"changed": True, "previous": _iso(previous)})


@api_view(["GET"])
def nav_counts(request):
    """GET /activity/nav-counts/ → sidebar badge counts keyed by nav path (seller or admin)."""
    user = require_user(request)
    if user.role == "seller" and user.store_slug:
        slug = user.store_slug
        since = last_seen(user, "orders")
        new_orders = 0
        for o in Order.objects.filter(store_slugs__contains=[slug], created_at__gt=since):
            new_orders += sum(1 for s in o.data.get("subOrders") or [] if s.get("storeSlug") == slug and s.get("status") == "confirmed")
        return Response({
            "/seller/buy-requests": sum(1 for r in Rfq.objects.filter(status="open")
                                        if any(d.get("storeSlug") == slug and not d.get("viewedAt") for d in r.data.get("dispatches") or [])),
            "/seller/leads": Enquiry.objects.filter(store_slug=slug, status="new").count(),
            "/seller/messages": sum((t.data.get("unread") or {}).get("seller") or 0 for t in Thread.objects.filter(store_slug=slug)),
            "/seller/orders": new_orders,
            "/seller/returns": Return.objects.filter(store_slug=slug, status="requested").count(),
        })
    if user.role == "admin":
        return Response({
            "/admin/orders": Order.objects.filter(created_at__gt=last_seen(user, "orders")).count(),
            "/admin/product-requests": sum(1 for r in Rfq.objects.filter(status="open") if not r.data.get("dispatches") and not r.data.get("quotes")),
            "/admin/returns": sum(1 for r in Return.objects.all() if r.data.get("escalated")),
            "/admin/sellers": SellerApplication.objects.filter(status="pending").count(),
            "/admin/support": Ticket.objects.filter(status__in=["open", "in_progress"]).count(),
            "/admin/verification": KycDocument.objects.filter(status="pending").count(),
        })
    return Response({})
