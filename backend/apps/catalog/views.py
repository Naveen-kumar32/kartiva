"""Public storefront catalogue API (port of frontend src/api/catalogApi.js). Only public products are ever returned:
active, not deleted, from an approved store, in an active category."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.core.errors import ApiError

from . import services


def _list(qp, key):
    return [v for v in ",".join(qp.getlist(key)).split(",") if v]


def _flag(qp, key):
    return qp.get(key) in ("1", "true", "True")


@api_view(["GET"])
def categories(request):
    """GET /categories/ → active categories; ?directory=1 → roots with children + product/supplier counts."""
    if request.query_params.get("directory"):
        return Response(services.category_directory())
    return Response(services.categories())


@api_view(["GET"])
def home(request):
    return Response(services.home())


@api_view(["GET"])
def products(request):
    """GET /products/?q&category&store&brand=a,b&seller=x&btype=..&min_price&max_price&min_rating&in_stock=1&verified=1
    &premium=1&bulk=1&attr.Color=Red,Blue&sort&page (same names as the listing page URL)."""
    qp = request.query_params
    params = {
        "attrs": {k[5:]: _list(qp, k) for k in qp.keys() if k.startswith("attr.")},
        "brands": _list(qp, "brand"), "bulk": _flag(qp, "bulk"), "businessTypes": _list(qp, "btype"), "category": qp.get("category"),
        "inStock": _flag(qp, "in_stock"), "maxPrice": qp.get("max_price"), "minPrice": qp.get("min_price"), "minRating": qp.get("min_rating"),
        "page": qp.get("page"), "premium": _flag(qp, "premium"), "q": qp.get("q") or "", "sellers": _list(qp, "seller"),
        "sort": qp.get("sort") or "relevance", "store": qp.get("store"), "verified": _flag(qp, "verified"),
    }
    return Response(services.products(params))


@api_view(["GET"])
def product_detail(request, slug):
    data = services.product_detail(slug)
    if data is None:
        raise ApiError("Product not found.", 404)
    return Response(data)


@api_view(["GET"])
def product_delivery(request, slug):
    """GET /products/<slug>/delivery/?pincode=600040 → the store's shipping methods that serve that pincode."""
    data = services.delivery_options(slug, request.query_params.get("pincode", ""))
    if data is None:
        raise ApiError("Product not found.", 404)
    return Response(data)


@api_view(["GET"])
def store_detail(request, slug):
    data = services.store_with_products(slug)
    if data is None:
        raise ApiError("Store not found.", 404)
    return Response(data)
