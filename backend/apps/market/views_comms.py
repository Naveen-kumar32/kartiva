"""Messages (messageApi.js), notification bell (notificationApi.js) and the mail outbox (mailApi.js)."""
import re

from django.db.models import Q
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.catalog.models import Store
from apps.core.errors import ApiError
from apps.core.models import EmailOutbox, Notification, SmsOutbox
from apps.core.permissions import actor_name, require_admin, require_user
from apps.core.services import atomic, audit, get_platform, now_iso
from apps.orders.models import Order, Refund

from .models import Thread
from .services import append_message

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# ---------- Messages ----------
def side_of(user):
    return "seller" if user.role == "seller" else "admin" if user.role == "admin" else "buyer"


def visible_threads(user):
    if user.role == "admin":
        return Thread.objects.all()
    if user.role == "seller":
        return Thread.objects.filter(store_slug=user.store_slug) if user.store_slug else Thread.objects.none()
    return Thread.objects.filter(buyer_email=user.email)


def decorate(thread, stores=None):
    slug = thread.data.get("storeSlug")
    store = stores.get(slug) if stores is not None else (lambda s: s.data if s else None)(Store.objects.filter(slug=slug).first())
    mini = {"color": store.get("color"), "initials": store.get("initials"), "name": store.get("name"), "slug": store.get("slug")} if store else None
    return {**thread.data, "store": mini}


@api_view(["GET"])
def threads(request):
    user = require_user(request)
    stores = {s.slug: s.data for s in Store.objects.all()}
    rows = sorted(visible_threads(user), key=lambda t: t.data.get("updatedAt") or "", reverse=True)
    return Response([decorate(t, stores) for t in rows])


@api_view(["GET"])
def unread_count(request):
    user = require_user(request)
    side = side_of(user)
    if side == "admin":
        return Response({"count": 0})
    return Response({"count": sum((t.data.get("unread") or {}).get(side) or 0 for t in visible_threads(user))})


@api_view(["POST"])
def thread_read(request, pk):
    user = require_user(request)
    with atomic():
        thread = visible_threads(user).select_for_update().filter(pk=pk).first()
        if not thread:
            raise ApiError("Conversation not found.", 404)
        side = side_of(user)
        unread = thread.data.setdefault("unread", {"buyer": 0, "seller": 0})
        if side != "admin" and unread.get(side):
            unread[side] = 0
            thread.save()
    return Response(decorate(thread))


@api_view(["POST"])
def thread_send(request, pk):
    user = require_user(request)
    body = str(request.data.get("body") or "")
    with atomic():
        thread = visible_threads(user).select_for_update().filter(pk=pk).first()
        if not thread or user.role == "admin":
            raise ApiError("Conversation not found.", 404)
        if not body.strip():
            raise ApiError("Type a message first.")
        append_message(thread, side_of(user), body[:2000])
    return Response(decorate(thread))


# ---------- Notifications ----------
def my_notifications_qs(user):
    """Same rule as audience_matches(): role "all", or matching role with optional email / storeSlug filters."""
    mine = Q(role=user.role) & (Q(email__isnull=True) | Q(email="") | Q(email=user.email)) & (Q(store_slug__isnull=True) | Q(store_slug="") | Q(store_slug=user.store_slug))
    return Notification.objects.filter(Q(role="all") | mine)


def _my_notifications(user):
    rows = sorted((n.data for n in my_notifications_qs(user).order_by("-at", "-id")[:200]), key=lambda n: n.get("at") or "", reverse=True)
    return rows[:50]


@api_view(["GET"])
def notifications(request):
    return Response(_my_notifications(require_user(request)))


@api_view(["POST"])
def notifications_read(request):
    user = require_user(request)
    nid = request.data.get("id")
    qs = my_notifications_qs(user)
    if nid is not None:
        qs = qs.filter(pk=nid)
    with atomic():
        for n in qs.select_for_update().filter(data__read=False):
            n.data["read"] = True
            n.save()
    return Response(_my_notifications(user))


# ---------- Mail outbox ----------
@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def emails(request):
    if request.method == "GET":
        require_admin(request)
        return Response({"results": [m.data for m in EmailOutbox.objects.all()[:500]]})
    user = require_user(request)
    recipients = [r for r in re.split(r"[,;\s]+", str(request.data.get("to") or "")) if r]
    if not recipients or any(not EMAIL_RE.match(r) for r in recipients):
        raise ApiError("Enter valid email address(es).")
    subject = str(request.data.get("subject") or "").strip()
    if not subject:
        raise ApiError("Add a subject.")
    cc = str(request.data.get("cc") or "").strip() or None
    if cc and any(not EMAIL_RE.match(r) for r in re.split(r"[,;\s]+", cc) if r):
        raise ApiError("Enter valid email address(es).")
    upload = request.FILES.get("attachment")
    attachment = {"filename": upload.name[:200], "size": upload.size} if upload else None  # the file itself is never stored
    sent_by = actor_name(user)
    mail = EmailOutbox.create({
        "attachment": attachment, "cc": cc, "message": str(request.data.get("message") or "")[:20000], "sentAt": now_iso(), "sentBy": sent_by,
        "status": "sent", "subject": subject[:300], "to": recipients,
    })
    suffix = f" · {attachment['filename']}" if attachment else ""
    audit("email.sent", ", ".join(recipients), f"{subject}{suffix}", sent_by)
    return Response(mail.to_dict(), status=201)


@api_view(["GET"])
def sms(request):
    require_admin(request)
    return Response({"results": [m.data for m in SmsOutbox.objects.all()[:500]]})


@api_view(["GET"])
def attachment_source(request):
    """Data to regenerate an emailed PDF from its recipe {kind, orderNumber, subOrderNumber}.
    Admin, the buyer who owns the order, or the seller of that sub-order only."""
    user = require_user(request)
    number = request.query_params.get("orderNumber")
    sub_number = request.query_params.get("subOrderNumber") or None
    order = Order.objects.filter(number=number).first() if number else None
    if not order:
        raise ApiError("The order for this attachment no longer exists.", 404)
    o = order.data
    sub = next((s for s in o.get("subOrders") or [] if s.get("number") == sub_number), None) if sub_number else None
    allowed = user.role == "admin" or (user.role == "buyer" and (o.get("buyer") or {}).get("email") == user.email) \
        or (user.role == "seller" and sub is not None and sub.get("storeSlug") == user.store_slug)
    if not allowed:
        raise ApiError("The order for this attachment no longer exists.", 404)
    store = None
    if sub:
        s = Store.objects.filter(slug=sub.get("storeSlug")).first()
        store = s.data if s else None
    return Response({"order": o, "platform": {k: v for k, v in get_platform().items() if k not in {"idempotency", "dismissedRiskFlags"}}, "refunds": [r.data for r in Refund.objects.filter(order_number=o.get("number"))], "store": store, "sub": sub})
