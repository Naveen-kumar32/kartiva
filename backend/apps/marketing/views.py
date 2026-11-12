"""Public ad serving (port of frontend src/api/adsApi.js)."""
import json

from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import services


@api_view(["GET"])
def ads(request):
    """GET /ads/?slot=home_hero_carousel&category=<slug>&q=<search>&exclude=<productId> → {items, slot}."""
    qp = request.query_params
    try:
        exclude = int(qp["exclude"]) if qp.get("exclude") else None
    except ValueError:
        exclude = None
    return Response(services.slot_ads(qp.get("slot", ""), category_slug=qp.get("category") or None, query=qp.get("q") or None, exclude_product_id=exclude))


@api_view(["POST"])
def impressions(request):
    """POST /ads/impressions/ {ids: [adId], page} — fire-and-forget (sendBeacon)."""
    try:  # sendBeacon may post the JSON as text/plain, so parse the raw body ourselves
        body = json.loads(request.body or b"{}")
    except ValueError:
        body = {}
    ids = body.get("ids") if isinstance(body, dict) else None
    services.track_impressions(ids if isinstance(ids, list) else [])
    return Response(status=204)
