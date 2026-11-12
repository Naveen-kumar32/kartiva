"""Order engine — port of frontend src/api/orderOps.js (state machine + money side effects).

Public API used by the buyer views here and by the Seller / Admin apps:

    TRANSITIONS, RETURN_REASONS
    find_sub_order(sub_order_number, lock=False) -> (Order, sub_dict)
    move_stock(variant_id, delta, reason, note=None, actor="system", sub_order_number=None)
    create_refund(amount, order, reason, sub, return_id=None) -> refund dict | None
    transition_sub_order(number, to_status, actor="seller", carrier=None, note=None, tracking_number=None) -> {"order", "sub"}
    place_order_in_db(address, buyer, lines, payment_method, shipping_choices, gstin="") -> order dict
    request_return_in_db(sub_order_number, variant_id, reason_code, quantity=1, description="", payout_to=None) -> return dict
    update_return_in_db(id, action, actor="seller", note=None, reason=None, restock=True, tracking_number=None) -> return dict
    update_return = update_return_in_db
    mark_refund_paid_in_db(id, utr) -> refund dict
    ledger_for(store_slug) -> {"entries", "balance", "pending"}
    generate_settlement_in_db(store_slug) -> settlement dict
    mark_settlement_paid_in_db(id, utr) -> settlement dict
    prefs_of(email), mail_buyer(order, subject, lines, attachments=None), text_buyer(order, text)

All dicts are the same camelCase JSON the mock returns. Every mutating function runs in its own transaction and
locks the rows it changes (orders, products for stock, returns, refunds, settlements) with select_for_update().
"""
import random
import string

from django.utils import timezone as djtz

from apps.accounts.models import User
from apps.catalog.models import Category, Product, StockMovement, Store
from apps.core.errors import ApiError
from apps.core.services import atomic, get_platform, notify, now_iso, send_email, send_sms
from apps.marketing.models import Ad

from .models import Buyer, CommissionRule, Order, Refund, Return, Settlement
from .pricing import DAY_MS, build_sub_order, compute_ledger, inr, js_round, min_order_qty, now_ms, num, parse_ms, state_code_of

TRANSITIONS = {
    "confirmed": ["processing", "cancelled"],
    "processing": ["shipped", "cancelled"],
    "shipped": ["delivered", "undelivered"],
}
RETURN_REASONS = ["damaged", "defective", "wrong_item", "not_as_described", "size_fit", "changed_mind", "other"]
DEFAULT_PREFS = {"email": True, "sms": True, "whatsapp": False}


# ---------- Small helpers ----------
def _store_name(slug):
    store = Store.objects.filter(slug=slug).first()
    return store.data.get("name", slug) if store else slug


def _items_label(sub):
    return ", ".join(i["name"] + (f" ×{i['quantity']}" if i["quantity"] > 1 else "") for i in sub["items"])


def _first_name(name):
    return (name or "").split(" ")[0]


def _to_buyer(order, title, body, link="/account/orders"):
    notify({"email": order["buyer"]["email"], "role": "buyer"}, title, body, link)


def _to_seller(slug, title, body, link="/seller/orders"):
    notify({"role": "seller", "storeSlug": slug}, title, body, link)


def _to_admin(title, body, link="/admin/orders"):
    notify({"role": "admin"}, title, body, link)


def _att(kind, order, sub=None):
    prefix = "GST-invoice" if kind == "invoice" else "Payment-receipt" if kind == "receipt" else "Order-summary"
    number = sub["number"] if sub else order["number"]
    return {"filename": f"{prefix}-{number}.pdf", "kind": kind, "orderNumber": order.get("number"), "subOrderNumber": sub["number"] if sub else None}


# ---------- Customer messages (email + SMS / WhatsApp per the customer's preferences) ----------
def prefs_of(email):
    """Customer notification preferences: defaults ← User.data.notificationPrefs."""
    user = User.objects.filter(email=(email or "").lower()).first()
    return {**DEFAULT_PREFS, **((user.data or {}).get("notificationPrefs") or {} if user else {})}


def mail_buyer(order, subject, lines, attachments=None):
    """Email the buyer (outbox) unless they turned email off. order needs buyer.{email,name}."""
    if not prefs_of(order["buyer"]["email"]).get("email"):
        return
    message = "\n".join([f"Hello {_first_name(order['buyer'].get('name'))},", "", *lines, "", "Track your order any time in My orders on Kartiva.", "— Team Kartiva"])
    send_email([order["buyer"]["email"]], subject, message, attachments=attachments or [])


def text_buyer(order, text):
    """SMS and/or WhatsApp to the buyer's phone per their preferences."""
    prefs = prefs_of(order["buyer"]["email"])
    phone = order["buyer"].get("phone") or (order.get("address") or {}).get("phone")
    if not phone:
        return
    to = phone if str(phone).startswith("+") else f"+91{phone}"
    for channel in ("sms", "whatsapp"):
        if prefs.get(channel):
            send_sms(to, f"Kartiva: {text}"[:300], channel)


# ---------- Lookups ----------
def find_sub_order(sub_order_number, lock=False):
    """→ (Order model, sub dict inside order.data). 404 "Sub-order not found." if missing."""
    qs = Order.objects.filter(sub_numbers__contains=[sub_order_number])
    if lock:
        qs = qs.select_for_update()
    order = qs.first()
    if order:
        for sub in order.data.get("subOrders") or []:
            if sub.get("number") == sub_order_number:
                return order, sub
    raise ApiError("Sub-order not found.", 404)


def _find_variant(variant_id, lock=False):
    qs = Product.objects.filter(data__variants__contains=[{"id": variant_id}])
    if lock:
        qs = qs.select_for_update()
    product = qs.first()
    if not product:
        return None
    variant = next((v for v in product.data.get("variants") or [] if v.get("id") == variant_id), None)
    return (product, variant) if variant else None


def move_stock(variant_id, delta, reason, note=None, actor="system", sub_order_number=None):
    """Change a variant's stock (row-locked), log a StockMovement and warn the seller when it crosses the
    low-stock threshold. 409 "Only N left of X." if it would go negative. Unknown variants are ignored."""
    with atomic():
        found = _find_variant(variant_id, lock=True)
        if not found:
            return
        product, variant = found
        if variant["stock"] + delta < 0:
            raise ApiError(f"Only {variant['stock']} left of {product.data.get('name')}.", 409)
        before = variant["stock"]
        variant["stock"] += delta
        product.save()
        threshold = get_platform().get("lowStockThreshold", 3)
        if delta < 0 and before > threshold and variant["stock"] <= threshold:
            sku = f" ({variant['sku']})" if variant.get("sku") else ""
            _to_seller(product.store_slug, "Out of stock" if variant["stock"] == 0 else "Low stock",
                       f"{product.data.get('name')}{sku} — {variant['stock']} left. Restock to keep selling.", "/seller/inventory")
        StockMovement.create({
            "actor": actor, "at": now_iso(), "delta": delta, "note": note, "productId": product.pk, "productName": product.data.get("name"), "reason": reason,
            "sku": variant.get("sku"), "stockAfter": variant["stock"], "storeSlug": product.store_slug, "subOrderNumber": sub_order_number, "variantId": variant_id,
        })


def _next_doc_number(store_slug, kind):
    store = Store.objects.filter(slug=store_slug).first()
    initials = (store.data.get("initials") if store else None) or store_slug[:2].upper()
    if kind == "credit":
        prefix = f"{initials}CN"
        existing = sum(1 for r in Return.objects.filter(store_slug=store_slug) if r.data.get("creditNoteNumber"))
    else:
        prefix = initials
        existing = sum(1 for o in Order.objects.filter(store_slugs__contains=[store_slug]) for s in o.data.get("subOrders") or []
                       if s.get("storeSlug") == store_slug and s.get("invoiceNumber"))
    return f"{prefix}/26-27/{existing + 1:05d}"


def _sync_order_status(order):
    subs = order["subOrders"]
    if order.get("paymentMethod") == "cod":
        live = [s for s in subs if s["status"] not in ("cancelled", "undelivered")]
        if live and all(s["status"] == "delivered" for s in live):
            order["paymentStatus"] = "cod_collected"
        elif any(s["status"] == "delivered" for s in live):
            order["paymentStatus"] = "cod_partially_collected"
        else:
            order["paymentStatus"] = "cod_pending"
    else:
        refunded = sum(s.get("refundedAmount") or 0 for s in subs)
        order["paymentStatus"] = "paid" if refunded == 0 else "refunded" if refunded >= order.get("grandTotal", 0) else "partially_refunded"


def _base36(n):
    chars, out = string.digits + string.ascii_lowercase, ""
    while n:
        n, r = divmod(n, 36)
        out = chars[r] + out
    return out or "0"


def create_refund(amount, order, reason, sub, return_id=None):
    """Refund for a sub-order. order/sub are the order.data dicts (caller saves the order).
    Online → processed at once via the gateway; COD after delivery → pending bank transfer queued for admin;
    COD before delivery → nothing was paid, returns None."""
    online = order.get("paymentMethod") == "online"
    if not online and sub["status"] != "delivered":
        return None
    at = now_iso()
    refund = Refund.create({
        "amount": amount, "createdAt": at, "method": "gateway" if online else "bank_transfer", "orderNumber": order["number"],
        "payoutTo": None if online else f"{_first_name(order['buyer'].get('name')).lower()}@upi", "processedAt": at if online else None, "reason": reason,
        "returnId": return_id, "status": "processed" if online else "pending", "storeSlug": sub["storeSlug"], "subOrderNumber": sub["number"],
        "utr": f"rfnd_{_base36(now_ms())}" if online else None,
    }).data
    if online:
        sub["refundedAmount"] = (sub.get("refundedAmount") or 0) + amount
        _to_buyer(order, "Refund processed", f"{inr(amount)} for {sub['number']} has been refunded to your original payment method. It reaches your account in 1–7 working days.")
        text_buyer(order, f"Refund of {inr(amount)} for {sub['number']} processed. It reaches your account in 1–7 working days.")
    else:
        _to_buyer(order, "Refund initiated", f"{inr(amount)} for {sub['number']} will be paid to {refund['payoutTo']} by bank transfer within 5–7 working days.")
        _to_admin("COD refund to pay", f"{order['buyer'].get('name')}: {inr(amount)} for {sub['number']} — pay by bank transfer and enter the UTR.", "/admin/returns")
    return refund


# ---------- State machine ----------
def transition_sub_order(number, to_status, actor="seller", carrier=None, note=None, tracking_number=None):
    """Move a sub-order along TRANSITIONS (409 otherwise). shipped: carrier + tracking required (except store pickup /
    local delivery), assigns the GST invoice number. cancelled/undelivered: releases stock; cancelled also refunds.
    Sends all buyer/seller/admin notifications, emails and SMS. Returns {"order": order dict, "sub": sub dict}."""
    with atomic():
        order_row, sub = find_sub_order(number, lock=True)
        order = order_row.data
        allowed = TRANSITIONS.get(sub["status"], [])
        if to_status not in allowed:
            raise ApiError(f"Can't move from {sub['status']} to {to_status}.", 409)
        method_type = (sub.get("method") or {}).get("type")
        if to_status == "shipped" and method_type not in ("store_pickup", "local_delivery") and (not carrier or not tracking_number):
            raise ApiError("Carrier and tracking number are required to mark as shipped.")
        at = now_iso()
        if to_status == "shipped":
            sub.update({"carrier": carrier or sub["method"].get("name"), "shippedAt": at, "trackingNumber": tracking_number or "—"})
            if sub.get("invoiceNumber") is None:
                sub["invoiceNumber"] = _next_doc_number(sub["storeSlug"], "invoice")
        if to_status == "delivered":
            sub["deliveredAt"] = at
        if to_status in ("cancelled", "undelivered"):
            sub["cancelReason"] = note
            for it in sub["items"]:
                move_stock(it["variantId"], it["quantity"], "order_released", note=f"{to_status} · {sub['number']}", actor=actor, sub_order_number=sub["number"])
            if to_status == "cancelled":
                create_refund(sub["total"] - (sub.get("refundedAmount") or 0), order, f"{actor}_cancelled", sub)
        sub["status"] = to_status
        entry = {"at": at, "by": actor, "status": to_status}
        timeline_note = f"{sub['carrier']} · {sub['trackingNumber']}" if to_status == "shipped" else note
        if timeline_note is not None:
            entry["note"] = timeline_note
        sub.setdefault("timeline", []).append(entry)
        _sync_order_status(order)
        order_row.save()

        shop = _store_name(sub["storeSlug"])
        label = _items_label(sub)
        online = order.get("paymentMethod") == "online"
        window = get_platform().get("defaultReturnWindowDays", 7)
        if to_status == "processing":
            _to_buyer(order, "Your order is being packed", f"{shop} is packing {sub['number']} ({label}).")
        if to_status == "shipped":
            has_tracking = sub.get("trackingNumber") and sub["trackingNumber"] != "—"
            track = f"{sub['carrier']} {sub['trackingNumber']}" if has_tracking else sub["carrier"]
            lines = [f"Good news — {label} from {shop} has shipped.", f"Courier: {track}" if track else "", f"Order: {sub['number']}", "", "Your GST tax invoice is attached."]
            mail_buyer(order, f"Shipped — {sub['number']}", [ln for ln in lines if ln != ""], [_att("invoice", order, sub)])
            text_buyer(order, f"{sub['number']} shipped{f' via {track}' if track else ''}. Track in My orders.")
            via = f" via {sub['carrier']} · {sub['trackingNumber']}" if has_tracking else ""
            _to_buyer(order, "Shipped", f"{sub['number']} from {shop} is on its way{via}. Track it in My orders.")
        if to_status == "delivered":
            mail_buyer(order, f"Delivered — {sub['number']}", [f"{label} from {shop} was delivered.", f"Order: {sub['number']}", "",
                                                                f"Not happy with it? You can request a return within {window} days from My orders."], [_att("invoice", order, sub)])
            text_buyer(order, f"{sub['number']} delivered. Thank you for shopping on Kartiva!")
            _to_buyer(order, "Delivered", f"{sub['number']} from {shop} was delivered. Enjoy! You can rate the product or request a return within {window} days.")
            cod = f" — COD {inr(sub['total'])} collected" if order.get("paymentMethod") == "cod" else ""
            _to_seller(sub["storeSlug"], "Order delivered", f"{sub['number']} delivered to {order['buyer'].get('name')}{cod}.")
        if to_status == "cancelled":
            if actor == "buyer":
                mail_buyer(order, f"Cancellation confirmed — {sub['number']}", [f"You cancelled {sub['number']} ({label}).",
                                                                                 f"Your refund of {inr(sub['total'])} has been processed." if online else "Nothing was charged."])
                _to_seller(sub["storeSlug"], "Order cancelled by buyer", f"{order['buyer'].get('name')} cancelled {sub['number']} ({label}). Stock has been released — don't ship it.")
            else:
                colon = f": {note}" if note else ""
                dash = f" — {note}" if note else ""
                _to_buyer(order, "Order cancelled", f"{sub['number']} from {shop} was cancelled{colon}. {'Your refund has been processed.' if online else 'Nothing was charged.'}")
                mail_buyer(order, f"Cancelled — {sub['number']}", [f"{sub['number']} ({label}) from {shop} was cancelled{dash}.",
                                                                    f"A refund of {inr(sub['total'])} has been processed to your original payment method." if online else "Nothing was charged for this item."])
                refund_note = f" Refund of {inr(sub['total'])} processed." if online else ""
                text_buyer(order, f"{sub['number']} was cancelled by the seller.{refund_note}")
                if actor == "admin":
                    _to_seller(sub["storeSlug"], "Order cancelled by Kartiva", f"{sub['number']} was cancelled by the Kartiva team{colon}.")
            _to_admin("Order cancelled", f"{sub['number']} ({shop}) cancelled by {actor}{f' — {note}' if note else ''}.")
        if to_status == "undelivered":
            _to_buyer(order, "Delivery unsuccessful", f"{sub['number']} couldn't be delivered and is returning to {shop}.{' A refund will follow.' if online else ''}")
            _to_admin("Undelivered shipment", f"{sub['number']} ({shop}) marked undelivered{f' — {note}' if note else ''}. Check the buyer for COD refusals.")
        return {"order": order, "sub": sub}


# ---------- Checkout ----------
def _order_number():
    d = djtz.localtime()
    suffix = "".join(random.choices(string.digits + string.ascii_uppercase, k=6))
    return f"KTV-{str(d.year)[2:]}{d.month}{d.day}-{suffix}"


def place_order_in_db(address, buyer, lines, payment_method, shipping_choices, gstin=""):
    """Create an order from cart lines [{variantId, quantity}]. Prices, GST, commission and fees are recomputed from the
    catalogue (never trusted from the client). Validates availability, enquiry-only, MOQ and stock, decrements stock
    under row locks, notifies buyer/sellers/admin, emails + texts the buyer. buyer = {email, name, phone}."""
    with atomic():
        groups = {}
        for line in lines:
            try:
                variant_id = int(line.get("variantId"))
            except (TypeError, ValueError):
                raise ApiError("An item in your cart is no longer available.", 409)
            found = _find_variant(variant_id, lock=True)
            if not found:
                raise ApiError("An item in your cart is no longer available.", 409)
            product, variant = found
            p = product.data
            try:
                quantity = int(float(line.get("quantity")))
            except (TypeError, ValueError):
                quantity = 0
            if not quantity > 0:
                raise ApiError("Invalid quantity in your cart.", 400)
            if p.get("enquiryOnly"):
                raise ApiError(f"{p.get('name')} is sold on enquiry only — send an enquiry to the seller instead.", 409)
            if p.get("status") != "active" or p.get("deletedAt"):
                raise ApiError("An item in your cart is no longer available.", 409)
            if quantity < min_order_qty(p):
                raise ApiError(f"Minimum order quantity for {p.get('name')} is {min_order_qty(p)}.", 409)
            if variant["stock"] < quantity:
                raise ApiError(f"Only {variant['stock']} left of {p.get('name')}.", 409)
            groups.setdefault(product.store_slug, []).append({"product": p, "quantity": quantity, "variant": variant})

        number = _order_number()
        buyer_state_code = state_code_of(address.get("state"))
        categories = [c.data for c in Category.objects.all()]
        rules = [r.data for r in CommissionRule.objects.all()]
        stores = {s.slug: s.data for s in Store.objects.filter(slug__in=list(groups))}
        sub_orders = []
        for i, (slug, group_lines) in enumerate(groups.items()):
            store = stores.get(slug)
            if not store or store.get("status") != "approved":
                raise ApiError("An item in your cart is no longer available.", 409)
            methods = store.get("shippingMethods") or []
            choice = (shipping_choices or {}).get(slug)
            method = next((m for m in methods if m.get("id") == choice or str(m.get("id")) == str(choice)), methods[0] if methods else None)
            if not method:
                raise ApiError(f"{store.get('name')} has no delivery option for this order.", 409)
            sub = build_sub_order(buyer_state_code=buyer_state_code, categories=categories, lines=group_lines, method=method,
                                  number=f"{number}-{i + 1}", rules=rules, store=store)
            sub["timeline"].append({"at": now_iso(), "note": "Order placed (COD)" if payment_method == "cod" else "Payment captured", "status": "confirmed"})
            sub_orders.append(sub)

        grand_total = sum(s["total"] for s in sub_orders)
        if payment_method == "cod":
            _check_cod(buyer["email"], grand_total, sub_orders)

        for sub in sub_orders:
            for it in sub["items"]:
                move_stock(it["variantId"], -it["quantity"], "order_reserved", note="Checkout", actor="buyer", sub_order_number=sub["number"])
        order = Order.create({
            "address": address, "buyer": buyer, "createdAt": now_iso(), "gstin": gstin or "", "grandTotal": grand_total, "number": number,
            "paymentMethod": payment_method, "paymentStatus": "cod_pending" if payment_method == "cod" else "paid", "subOrders": sub_orders,
        }).data

        cod = payment_method == "cod"
        ship_note = f"{len(sub_orders)} sellers will ship separately." if len(sub_orders) > 1 else "We'll tell you when it ships."
        _to_buyer(order, "Order placed", f"{number} — {inr(grand_total)}{' (Cash on Delivery)' if cod else ' paid'}. {ship_note}")
        mail_buyer(order, f"Order confirmed — {number}", [
            f"Thank you for your order {number}.", "",
            *[f"• {_store_name(x['storeSlug'])}: {_items_label(x)} — {inr(x['total'])} ({x['method']['name']})" for x in sub_orders], "",
            f"Total: {inr(grand_total)} · {'Cash on Delivery' if cod else 'Paid online'}",
            f"Delivering to: {address.get('fullName')}, {address.get('line1')}, {address.get('city')} {address.get('pincode')}", "", "Your order summary is attached.",
        ], [_att("summary", order), *([] if cod else [_att("receipt", order)])])
        text_buyer(order, f"Order {number} confirmed. Total {inr(grand_total)}{' (COD)' if cod else ''}. We'll message you when it ships.")
        for s in sub_orders:
            _to_seller(s["storeSlug"], "New order received",
                       f"{s['number']}: {_items_label(s)} — {inr(s['total'])}{' · COD' if cod else ' · Paid'} · {s['method']['name']}. Deliver to {address.get('city')}.",
                       f"/seller/orders?order={s['number']}")
        _to_admin("New order", f"{number} by {buyer.get('name')} ({address.get('city')}) — {inr(grand_total)} from {', '.join(_store_name(s['storeSlug']) for s in sub_orders)}.",
                  f"/admin/orders?order={number}")
        if not Buyer.objects.filter(email=buyer["email"]).exists():
            Buyer.create({"address": address, "codBlocked": False, "email": buyer["email"], "isActive": True, "joinedAt": now_iso(), "name": buyer.get("name")})
        return order


def is_cod_blocked(email):
    b = Buyer.objects.filter(email=email).first()
    return bool(b and b.data.get("codBlocked"))


def _check_cod(email, grand_total, sub_orders):
    """Server-side re-check of the checkout page's COD rules (the page's checks are only a UX hint)."""
    platform = get_platform()
    if platform.get("codEnabled") is False:
        raise ApiError("Cash on Delivery is not available right now. Please pay online.")
    if is_cod_blocked(email):
        raise ApiError("Cash on Delivery is not available for your account. Please pay online.")
    limit = platform.get("codMaxOrderValue")
    if limit is not None and grand_total > limit:
        raise ApiError(f"Cash on Delivery is available for orders up to {inr(limit)}. Please pay online.")
    if any(not s["method"].get("codAllowed") for s in sub_orders):
        raise ApiError("Cash on Delivery isn't available for the chosen delivery option. Please pay online.")


# ---------- Returns ----------
def request_return_in_db(sub_order_number, variant_id, reason_code, quantity=1, description="", payout_to=None):
    """Buyer return request for one delivered item (caller checks ownership). Validates returnability, quantity,
    return window and duplicates; notifies seller + buyer. Refund = price × qty (+ fee if damaged/defective/wrong
    and the shipment had a single item)."""
    with atomic():
        order_row, sub = find_sub_order(sub_order_number, lock=True)
        order = order_row.data
        if sub["status"] != "delivered":
            raise ApiError("Only delivered items can be returned.")
        item = next((i for i in sub["items"] if i.get("variantId") == variant_id), None)
        if not item:
            raise ApiError("Item not found in this shipment.", 404)
        if item.get("isReturnable") is False:
            raise ApiError("This item is not returnable.")
        if quantity > item["quantity"] - (item.get("returnedQuantity") or 0):
            raise ApiError("You can't return more than you bought.")
        window = get_platform().get("defaultReturnWindowDays", 7)
        if now_ms() - parse_ms(sub.get("deliveredAt")) > window * DAY_MS:
            raise ApiError("The return window for this item has closed.")
        for r in Return.objects.filter(sub_order_number=sub_order_number):
            if r.data["items"][0].get("variantId") == variant_id and r.data.get("status") not in ("rejected", "cancelled", "refunded"):
                raise ApiError("A return for this item is already in progress.", 409)
        at = now_iso()
        fee_back = (sub.get("fee") or 0) if reason_code in ("damaged", "defective", "wrong_item") and len(sub["items"]) == 1 else 0
        refund_amount = item["price"] * quantity + fee_back
        ret = Return.create({
            "buyer": order["buyer"], "createdAt": at, "description": description, "escalated": False,
            "items": [{"name": item["name"], "quantity": quantity, "variantId": variant_id, "variantLabel": item.get("variantLabel")}],
            "number": f"RET-{sub['number'][4:]}-{Return.objects.count() + 1}", "orderNumber": order["number"], "paymentMethod": order.get("paymentMethod"),
            "payoutTo": payout_to or None, "reasonCode": reason_code, "refundAmount": refund_amount, "rejectionReason": None, "status": "requested",
            "storeSlug": sub["storeSlug"], "subOrderNumber": sub_order_number, "timeline": [{"at": at, "status": "requested"}],
        }).data
        qty = f" ×{quantity}" if quantity > 1 else ""
        _to_seller(sub["storeSlug"], "Return requested",
                   f"{order['buyer'].get('name')} wants to return {item['name']}{qty} from {sub['number']} — {reason_code.replace('_', ' ')}. Approve or reject within 48 hours.", "/seller/returns")
        _to_buyer(order, "Return request submitted", f"{ret['number']} for {item['name']}. {_store_name(sub['storeSlug'])} will respond within 48 hours.")
        return ret


RETURN_ACTIONS = {
    "approve": ["requested"], "cancel": ["requested"], "escalate": ["rejected"], "override": ["rejected"],
    "receive": ["approved", "in_transit"], "reject": ["requested"], "ship_back": ["approved"],
}


def update_return_in_db(id, action, actor="seller", note=None, reason=None, restock=True, tracking_number=None):  # noqa: A002
    """Return workflow: approve | reject | cancel | escalate | override | ship_back | receive (409 if not allowed from
    the current status). receive: marks items returned, optional restock, refund, credit note number."""
    with atomic():
        row = Return.objects.select_for_update().filter(pk=id).first()
        if not row:
            raise ApiError("Return not found.", 404)
        ret = row.data
        if ret.get("status") not in RETURN_ACTIONS.get(action, []):
            raise ApiError(f"Can't {str(action).replace('_', ' ', 1)} a return that is {ret.get('status')}.", 409)
        at = now_iso()
        if action in ("approve", "override"):
            ret["status"], ret["escalated"] = "approved", False
        if action == "reject":
            ret["status"], ret["rejectionReason"] = "rejected", reason
        if action == "escalate":
            ret["escalated"] = True
        if action == "cancel":
            ret["status"] = "cancelled"
        if action == "ship_back":
            ret["status"], ret["returnTracking"] = "in_transit", tracking_number
        if action == "receive":
            order_row, sub = find_sub_order(ret["subOrderNumber"], lock=True)
            order = order_row.data
            line = ret["items"][0]
            item = next(i for i in sub["items"] if i.get("variantId") == line["variantId"])
            item["returnedQuantity"] = (item.get("returnedQuantity") or 0) + line["quantity"]
            if restock:
                move_stock(item["variantId"], line["quantity"], "return_restock", note=f"Return {ret['number']}", actor=actor, sub_order_number=sub["number"])
            refund = create_refund(ret["refundAmount"], order, "return", sub, return_id=row.pk)
            ret["creditNoteNumber"] = _next_doc_number(ret["storeSlug"], "credit")
            ret["status"] = "refunded" if refund and refund.get("status") == "processed" else "received"
            _sync_order_status(order)
            order_row.save()
        entry = {"at": at, "by": actor, "status": "escalated" if action == "escalate" else ret["status"]}
        tl_note = reason if reason is not None else note if note is not None else (f"Tracking {tracking_number}" if tracking_number else None)
        if tl_note is not None:
            entry["note"] = tl_note
        ret.setdefault("timeline", []).append(entry)
        row.save()

        buyer_order = {"buyer": ret["buyer"]}
        what = f"{ret['number']} ({ret['items'][0]['name']})"
        shop = _store_name(ret["storeSlug"])
        buyer_name = ret["buyer"].get("name")
        if action in ("approve", "reject", "receive"):
            verdict = {
                "approve": f"Your return {what} was approved by {shop}.",
                "receive": f"{shop} received your return {what}.",
                "reject": f"Your return {what} was not approved by {shop}{f': {reason}' if reason else ''}. You can escalate it to Kartiva from My orders.",
            }[action]
            mail_buyer(buyer_order, f"Return update — {ret['number']}", [verdict])
        if action == "approve":
            _to_buyer(buyer_order, "Return approved", f"{what} was approved by {shop}. {'' if tracking_number else 'Pickup will be arranged, or ship it back with the return address shown.'}")
        if action == "override":
            _to_buyer(buyer_order, "Return approved by Kartiva", f"We reviewed {what} and approved your return.")
            _to_seller(ret["storeSlug"], "Return approved by Kartiva", f"Kartiva overrode the rejection of {what} after the buyer escalated it.", "/seller/returns")
        if action == "reject":
            _to_buyer(buyer_order, "Return rejected", f"{shop} rejected {what}{f': {reason}' if reason else ''}. You can escalate it to Kartiva from My orders.")
        if action == "escalate":
            _to_admin("Return escalated", f"{buyer_name} escalated {what} against {shop}. Review and decide.", "/admin/returns")
            _to_seller(ret["storeSlug"], "Return escalated to Kartiva", f"{buyer_name} escalated {what}. Kartiva will review it.", "/seller/returns")
        if action == "cancel":
            _to_seller(ret["storeSlug"], "Return cancelled", f"{buyer_name} cancelled {what}.", "/seller/returns")
        if action == "ship_back":
            _to_seller(ret["storeSlug"], "Return on its way", f"{what} is being shipped back{f' · {tracking_number}' if tracking_number else ''}.", "/seller/returns")
        if action == "receive":
            paid = "Your refund has been processed." if ret["status"] == "refunded" else "Your refund is being paid by bank transfer."
            _to_buyer(buyer_order, "Return received", f"{shop} received {what}. {paid}")
        return ret


update_return = update_return_in_db


def mark_refund_paid_in_db(id, utr):  # noqa: A002
    """Admin marks a pending (COD bank-transfer) refund as paid with the bank UTR; closes the linked return."""
    with atomic():
        row = Refund.objects.select_for_update().filter(pk=id).first()
        if not row:
            raise ApiError("Refund not found.", 404)
        utr = (utr or "").strip()
        if not utr:
            raise ApiError("Enter the bank UTR / reference number.")
        refund = row.data
        refund.update({"processedAt": now_iso(), "status": "processed", "utr": utr})
        row.save()
        if refund.get("returnId"):
            ret_row = Return.objects.select_for_update().filter(pk=refund["returnId"]).first()
            if ret_row:
                ret_row.data["status"] = "refunded"
                ret_row.data.setdefault("timeline", []).append({"at": now_iso(), "note": f"Bank transfer {utr}", "status": "refunded"})
                ret_row.save()
        order_row = Order.objects.filter(number=refund.get("orderNumber")).first()
        if order_row:
            order = order_row.data
            payout = refund.get("payoutTo") or "your account"
            text_buyer(order, f"Refund of {inr(refund['amount'])} for {refund['subOrderNumber']} sent · UTR {utr}.")
            mail_buyer(order, f"Refund paid — {refund['subOrderNumber']}", [f"We've paid your refund of {inr(refund['amount'])} for {refund['subOrderNumber']}.",
                                                                            f"Paid to: {payout}", f"Bank reference (UTR): {utr}"])
            _to_buyer(order, "Refund paid", f"{inr(refund['amount'])} for {refund['subOrderNumber']} was sent to {payout} · UTR {utr}.")
        return refund


# ---------- Ledger & settlements ----------
def ledger_for(store_slug):
    """Seller ledger {entries, balance, pending} (see pricing.compute_ledger)."""
    platform = get_platform()
    return compute_ledger(
        ads=[a.data for a in Ad.objects.filter(store_slug=store_slug)], orders=[o.data for o in Order.objects.filter(store_slugs__contains=[store_slug])],
        platform=platform, refunds=[r.data for r in Refund.objects.filter(store_slug=store_slug)], return_window_days=platform.get("defaultReturnWindowDays", 7),
        settlements=[s.data for s in Settlement.objects.filter(store_slug=store_slug)], store_slug=store_slug,
    )


def generate_settlement_in_db(store_slug):
    """Settle every open ledger entry (+ carried-forward balances) for a store. net > 0 → approved, else carried
    forward. Locks the included sub-orders, refunds and seller ads to the settlement. 409 if nothing to settle."""
    with atomic():
        list(Settlement.objects.select_for_update().filter(store_slug=store_slug))
        entries = ledger_for(store_slug)["entries"]
        open_entries = [e for e in entries if not e.get("settlementId") and e["type"] != "payout"]
        if not open_entries:
            raise ApiError("Nothing to settle for this store yet.", 409)
        carried_rows = [s for s in Settlement.objects.filter(store_slug=store_slug) if s.data.get("status") == "carried_forward" and not s.data.get("carriedInto")]
        carried = sum(s.data.get("net") or 0 for s in carried_rows)
        net = num(js_round((sum(e["amount"] for e in open_entries) + carried) * 100) / 100)
        breakdown = {}
        for e in open_entries:
            breakdown[e["type"]] = num(js_round(((breakdown.get(e["type"]) or 0) + e["amount"]) * 100) / 100)
        sub_numbers = list(dict.fromkeys(e.get("subOrderNumber") for e in open_entries if e.get("subOrderNumber")))
        new_id = (Settlement.objects.order_by("-id").values_list("id", flat=True).first() or 0) + 1
        now = now_iso()
        status = "approved" if net > 0 else "carried_forward"
        row = Settlement(pk=new_id, data={
            "breakdown": breakdown, "carriedIn": num(carried), "createdAt": now, "id": new_id, "net": net, "number": f"STL-{40 + new_id:04d}", "paidAt": None,
            "periodEnd": now[:10], "status": status, "storeSlug": store_slug, "subOrderNumbers": sub_numbers, "utr": None,
        })
        row.save()
        for s in carried_rows:
            s.data["carriedInto"] = new_id
            s.save()
        for o in Order.objects.select_for_update().filter(store_slugs__contains=[store_slug]):
            changed = False
            for s in o.data.get("subOrders") or []:
                if s.get("number") in sub_numbers:
                    s["settlementId"], changed = new_id, True
            if changed:
                o.save()
        for r in Refund.objects.select_for_update().filter(store_slug=store_slug, status="processed"):
            if not r.data.get("settlementId"):
                r.data["settlementId"] = new_id
                r.save()
        for a in Ad.objects.select_for_update().filter(store_slug=store_slug):
            if a.data.get("advertiserType") == "seller" and (a.data.get("spend") or 0) > 0 and not a.data.get("settlementId"):
                a.data["settlementId"] = new_id
                a.save()
        settlement = row.data
        n = len(sub_numbers)
        _to_seller(store_slug, "Settlement generated" if status == "approved" else "Balance carried forward",
                   f"{settlement['number']}: {inr(net)} for {n} order{'' if n == 1 else 's'}.{' Payout will be sent to your bank account.' if status == 'approved' else ''}", "/seller/earnings")
        return settlement


def mark_settlement_paid_in_db(id, utr):  # noqa: A002
    """Admin marks an approved settlement paid with the bank UTR; notifies the seller."""
    with atomic():
        row = Settlement.objects.select_for_update().filter(pk=id).first()
        if not row:
            raise ApiError("Settlement not found.", 404)
        s = row.data
        if s.get("status") != "approved":
            raise ApiError("Only approved settlements can be marked paid.", 409)
        utr = (utr or "").strip()
        if not utr:
            raise ApiError("Enter the bank UTR / reference number.")
        s.update({"paidAt": now_iso(), "status": "paid", "utr": utr})
        row.save()
        _to_seller(s["storeSlug"], "Payout sent", f"{s['number']}: {inr(s['net'])} transferred to your bank account · UTR {utr}.", "/seller/earnings")
        return s
