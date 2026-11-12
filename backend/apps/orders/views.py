"""Buyer order API (port of frontend src/api/orderApi.js). Buyer identity always comes from the JWT; prices are
recomputed on the server; buyers only ever see their own orders (anything else → 404, never 403)."""
from django.db import IntegrityError
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.core.errors import ApiError
from apps.core.models import IdempotencyKey
from apps.core.permissions import require_buyer, require_user
from apps.core.services import atomic

from . import services
from .models import Order, Refund, Return

ADDRESS_FIELDS = ("city", "fullName", "line1", "line2", "phone", "pincode", "state")


def _own_order(order, user):
    """Buyers see their own orders, admins see all; anything else is 404 (don't leak existence)."""
    if not order or (user.role != "admin" and order.data.get("buyer", {}).get("email") != user.email):
        raise ApiError("Order not found.", 404)
    return order


@api_view(["POST"])
def checkout(request):
    """POST /checkout/ {address, gstin, lines[{variantId, quantity}], paymentMethod, shippingChoices{storeSlug: methodId}, idempotencyKey}
    Header Idempotency-Key (or body idempotencyKey): a retry with the same key returns the SAME order."""
    user = require_buyer(request)
    body = request.data if isinstance(request.data, dict) else {}
    raw_key = request.headers.get("Idempotency-Key") or body.get("idempotencyKey")
    key = f"{user.email}:{raw_key}"[:200] if raw_key else None
    if key:
        hit = IdempotencyKey.objects.filter(key=key).first()
        if hit:
            order = Order.objects.filter(number=hit.result_ref).first()
            if order:
                return Response(order.data)

    address = body.get("address") if isinstance(body.get("address"), dict) else {}
    address = {k: str(address.get(k) or "").strip() for k in ADDRESS_FIELDS}
    if not all(address[k] for k in ("fullName", "line1", "city", "pincode", "state")):
        raise ApiError("Enter your full delivery address.")
    lines = body.get("lines") if isinstance(body.get("lines"), list) else []
    if not lines or not all(isinstance(line, dict) for line in lines):
        raise ApiError("Your cart is empty.")
    payment_method = body.get("paymentMethod")
    if payment_method not in ("online", "cod"):
        raise ApiError("Choose a payment method.")
    profile = user.data or {}
    buyer = {"email": user.email, "name": address["fullName"] or f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip(),
             "phone": address["phone"] or profile.get("phone", "")}
    choices = body.get("shippingChoices") if isinstance(body.get("shippingChoices"), dict) else {}
    try:
        with atomic():
            order = services.place_order_in_db(address=address, buyer=buyer, lines=lines, payment_method=payment_method,
                                               shipping_choices=choices, gstin=str(body.get("gstin") or "").strip().upper())
            if key:
                IdempotencyKey.objects.create(key=key, result_ref=order["number"])
    except IntegrityError:  # a concurrent retry with the same key won the race → return its order
        hit = IdempotencyKey.objects.filter(key=key).first() if key else None
        order_row = Order.objects.filter(number=hit.result_ref).first() if hit else None
        if not order_row:
            raise
        return Response(order_row.data)
    return Response(order, status=201)


@api_view(["GET"])
def my_orders(request):
    user = require_user(request)
    return Response({"results": [o.data for o in Order.objects.filter(buyer_email=user.email)]})


@api_view(["GET"])
def order_detail(request, number):
    user = require_user(request)
    return Response(_own_order(Order.objects.filter(number=number).first(), user).data)


@api_view(["POST"])
def cancel_sub_order(request, sub_number):
    """POST /orders/sub-orders/<sub>/cancel/ {reason} — buyer cancels one shipment (before it ships)."""
    user = require_buyer(request)
    order, _ = services.find_sub_order(sub_number)
    _own_order(order, user)
    reason = request.data.get("reason") if isinstance(request.data, dict) else None
    return Response(services.transition_sub_order(sub_number, "cancelled", actor="buyer", note=reason or None))


@api_view(["GET"])
def order_refunds(request, number):
    """Refunds of an order: buyer (own order), seller (only their store's refunds), admin (all)."""
    user = require_user(request)
    order = Order.objects.filter(number=number).first()
    seller_owns = user.role == "seller" and order is not None and user.store_slug in order.store_slugs
    if not seller_owns:
        _own_order(order, user)
    qs = Refund.objects.filter(order_number=number)
    if seller_owns:
        qs = qs.filter(store_slug=user.store_slug)
    return Response({"results": [r.data for r in qs]})


@api_view(["GET", "POST"])
def returns(request):
    """GET /returns/ → my returns. POST /returns/ {subOrderNumber, variantId, quantity, reasonCode, description, payoutTo}."""
    if request.method == "GET":
        user = require_user(request)
        return Response({"results": [r.data for r in Return.objects.filter(buyer_email=user.email)]})
    user = require_buyer(request)
    body = request.data if isinstance(request.data, dict) else {}
    sub_number = str(body.get("subOrderNumber") or "")
    order, _ = services.find_sub_order(sub_number)
    _own_order(order, user)
    try:
        variant_id = int(body.get("variantId"))
        quantity = int(body.get("quantity") or 1)
    except (TypeError, ValueError):
        raise ApiError("Item not found in this shipment.", 404)
    if quantity < 1:
        raise ApiError("Enter a valid quantity.")
    reason_code = str(body.get("reasonCode") or "")
    if not reason_code:
        raise ApiError("Choose a reason for the return.")
    ret = services.request_return_in_db(sub_number, variant_id, reason_code, quantity=quantity,
                                        description=str(body.get("description") or "")[:2000], payout_to=(str(body.get("payoutTo") or "").strip() or None))
    return Response(ret, status=201)


@api_view(["POST"])
def escalate_return(request, pk):
    user = require_buyer(request)
    ret = Return.objects.filter(pk=pk).first()
    if not ret or ret.buyer_email != user.email:
        raise ApiError("Return not found.", 404)
    return Response(services.update_return_in_db(pk, "escalate", actor="buyer"))
