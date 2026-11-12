"""Shared marketplace operations (port of frontend/src/api/marketOps.js).

These are the public Python API used by the buyer, seller (Seller Hub) and admin apps so cross-role
effects (messages, unread counters, bell notifications, KYC/badges, RFQ dispatch emails) stay identical:

    audience_matches(audience, user) -> bool
    open_thread(buyer, store_slug, subject, context, first_message=None, sender="buyer") -> Thread
    append_message(thread, sender, body) -> Thread
    recompute_kyc(store_slug) -> Store | None
    refresh_badges(store) -> dict
    dispatch_rfq(rfq, store_slugs, by="auto", note="") -> list[str]

Plus small formatting helpers shared by the market views (inr, fmt_qty, need_by_label, store_lite, product_lite).
"""
from datetime import datetime, timedelta, timezone

from django.db import connection

from apps.accounts.models import User
from apps.catalog.models import Category, Store
from apps.core.services import notify, now_iso, send_email

from .models import KycDocument, Rfq, Thread

__all__ = [
    "REQUIRED_KYC", "append_message", "audience_matches", "dispatch_rfq", "notify", "open_thread", "recompute_kyc", "refresh_badges",
]

IST = timezone(timedelta(hours=5, minutes=30))
REQUIRED_KYC = ["gst_certificate", "pan_card", "cancelled_cheque"]


# ---------- formatting (mirrors toLocaleString("en-IN")) ----------
def _group_in(int_str):
    """'1234567' → '12,34,567' (Indian digit grouping)."""
    if len(int_str) <= 3:
        return int_str
    head, tail = int_str[:-3], int_str[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail


def fmt_num(n):
    """Number formatted like Number(n).toLocaleString("en-IN") (max 3 decimals)."""
    try:
        value = float(n)
    except (TypeError, ValueError):
        return str(n)
    neg = value < 0
    text = f"{abs(value):.3f}".rstrip("0").rstrip(".")
    int_part, _, frac = text.partition(".")
    out = _group_in(int_part) + (f".{frac}" if frac else "")
    return f"-{out}" if neg else out


def inr(n):
    return f"₹{fmt_num(n)}"


def fmt_qty(rfq):
    return f"{fmt_num(rfq.get('quantity'))} {rfq.get('unit')}"


def need_by_label(iso):
    """'2026-11-17T18:29:59.000Z' → '17 Nov 2026' (en-IN short date, India time)."""
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(IST)
    except ValueError:
        return str(iso)
    month = "Sept" if d.month == 9 else d.strftime("%b")
    return f"{d.day} {month} {d.year}"


def store_lite(store):
    """Public supplier card (same keys as storeLite() in buyerMarketApi.js). Accepts a dict or None."""
    if not store:
        return None
    keys = ["badges", "city", "color", "gstVerified", "initials", "kycStatus", "name", "plan", "rating", "responseHours", "responseRate", "slug"]
    return {k: store.get(k) for k in keys}


def product_lite(product):
    if not product:
        return None
    return {"enquiryOnly": bool(product.get("enquiryOnly")), "id": product.get("id"), "name": product.get("name"), "slug": product.get("slug"), "thumbnail": product.get("thumbnail")}


# ---------- audience ----------
def _attr(user, key, attr):
    if isinstance(user, dict):
        return user.get(key)
    return getattr(user, attr, None)


def audience_matches(audience, user):
    """True when a notification audience {role, email?, storeSlug?} targets `user` (a User or a dict with
    role/email/storeSlug). role "all" matches everyone signed in."""
    if not user:
        return False
    audience = audience or {}
    if audience.get("role") == "all":
        return True
    if audience.get("role") != _attr(user, "role", "role"):
        return False
    if audience.get("email") and audience["email"] != _attr(user, "email", "email"):
        return False
    if audience.get("storeSlug") and audience["storeSlug"] != _attr(user, "storeSlug", "store_slug"):
        return False
    return True


# ---------- threads ----------
def _next_message_id():
    """Message ids are global across threads (like the mock): max(existing) + 1."""
    with connection.cursor() as cur:
        cur.execute(
            f"SELECT COALESCE(MAX((m->>'id')::bigint), 0) FROM {Thread._meta.db_table} t, "
            "jsonb_array_elements(COALESCE(t.data->'messages', '[]'::jsonb)) m"
        )
        return int(cur.fetchone()[0]) + 1


def open_thread(buyer, store_slug, subject, context, first_message=None, sender="buyer"):
    """Create a buyer↔store conversation and return the saved Thread.

    buyer: {email, name, city?, phone?}; context: {"type": "enquiry"|"rfq"|"order", "id": ...}.
    If first_message is given it is appended via append_message(thread, sender, first_message)
    (which bumps unread counters and notifies the other side)."""
    at = now_iso()
    thread = Thread.create({
        "buyer": {"city": buyer.get("city") or "", "email": buyer.get("email"), "name": buyer.get("name"), "phone": buyer.get("phone") or ""},
        "context": context, "messages": [], "storeSlug": store_slug, "subject": subject, "unread": {"buyer": 0, "seller": 0}, "updatedAt": at,
    })
    if first_message:
        append_message(thread, sender, first_message)
    return thread


def append_message(thread, sender, body):
    """Append a message from "buyer" or "seller" (anything not "buyer" counts as the seller side), bump the
    other side's unread counter, send the bell notification and save. Returns the Thread."""
    d = thread.data
    at = now_iso()
    d.setdefault("messages", []).append({"at": at, "body": str(body).strip(), "from": sender, "id": _next_message_id()})
    d["updatedAt"] = at
    unread = d.setdefault("unread", {"buyer": 0, "seller": 0})
    store = Store.objects.filter(slug=d.get("storeSlug")).first()
    if sender == "buyer":
        unread["seller"] = (unread.get("seller") or 0) + 1
        notify({"role": "seller", "storeSlug": d.get("storeSlug")}, f"Message from {d['buyer'].get('name')}", str(body)[:120], "/seller/messages")
    else:
        unread["buyer"] = (unread.get("buyer") or 0) + 1
        name = store.data.get("name") if store else "seller"
        notify({"email": d["buyer"].get("email"), "role": "buyer"}, f"Message from {name}", str(body)[:120], "/account/messages")
    thread.save()
    return thread


# ---------- KYC + badges ----------
def refresh_badges(store):
    """Recompute derived badges on a store DICT in place (does not save): "top_rated" from rating ≥ 4.5,
    "trusted" from trustedManual (True forces, False blocks) or paid plan + verified KYC. Other badges kept."""
    manual = [b for b in (store.get("badges") or []) if b not in ("top_rated", "trusted")]
    trusted_manual = store.get("trustedManual")
    trusted = trusted_manual is True or (trusted_manual is not False and store.get("plan") and store.get("plan") != "free" and store.get("kycStatus") == "verified")
    store["badges"] = [*manual, *(["top_rated"] if (store.get("rating") or 0) >= 4.5 else []), *(["trusted"] if trusted else [])]
    return store


def recompute_kyc(store_slug):
    """Recompute store.kycStatus / gstVerified from its KYC documents, refresh badges and save.
    Verified once GST certificate, PAN and cancelled cheque (latest of each) are all verified. Returns the Store or None."""
    store = Store.objects.filter(slug=store_slug).first()
    if not store:
        return None
    docs = [d.data for d in KycDocument.objects.filter(store_slug=store_slug)]

    def latest(doc_type):
        of_type = sorted((d for d in docs if d.get("type") == doc_type), key=lambda d: d.get("uploadedAt") or "", reverse=True)
        return of_type[0] if of_type else None

    s = store.data
    required = [latest(t) for t in REQUIRED_KYC]
    if all(d and d.get("status") == "verified" for d in required):
        s["kycStatus"] = "verified"
    elif any(d.get("status") == "pending" for d in docs):
        s["kycStatus"] = "pending"
    elif any(d.get("status") == "rejected" for d in docs):
        s["kycStatus"] = "rejected"
    else:
        s["kycStatus"] = "pending" if docs else "not_submitted"
    gst = latest("gst_certificate")
    s["gstVerified"] = bool(gst and gst.get("status") == "verified")
    refresh_badges(s)
    store.save()
    return store


# ---------- RFQ dispatch ----------
def dispatch_rfq(rfq, store_slugs, by="auto", note=""):
    """Send a buy request (Rfq model instance) to stores with FULL details: seller bell notification + email
    in the outbox; records rfq.data.dispatches [{storeSlug, at, by, note, viewedAt}] and saves the Rfq.
    by="auto" skips stores that already received it; an admin name re-sends (with the admin's note).
    Only approved stores receive it. Returns the list of store slugs it was sent to."""
    d = rfq.data
    dispatches = d.setdefault("dispatches", [])
    cat = Category.objects.filter(slug=d.get("categorySlug")).first()
    category = cat.data.get("name") if cat else d.get("categorySlug")
    qty = fmt_qty(d)
    need_by = need_by_label(d.get("deadline"))
    note = note or ""
    sent = []
    for slug in dict.fromkeys(store_slugs):
        store_obj = Store.objects.filter(slug=slug, status="approved").first()
        if not store_obj:
            continue
        store = store_obj.data
        existing = next((x for x in dispatches if x.get("storeSlug") == slug), None)
        if existing and by == "auto":
            continue
        at = now_iso()
        if existing:
            existing.update({"at": at, "by": by, "note": note or existing.get("note")})
        else:
            dispatches.append({"at": at, "by": by, "note": note, "storeSlug": slug, "viewedAt": None})
        from_admin = by != "auto"
        target = f" · target {inr(d['targetPrice'])}/{d.get('unit')}" if d.get("targetPrice") else ""
        kartiva_note = f" Kartiva: “{note}”" if note else ""
        notify(
            {"role": "seller", "storeSlug": slug},
            "Product request sent to you by Kartiva" if from_admin else "New product request in your category",
            f"{d.get('title')} — {qty}{target} · deliver to {d.get('deliveryCity')} by {need_by}.{kartiva_note} {(d.get('details') or '')[:140]}",
            f"/seller/buy-requests?rfq={rfq.pk}",
        )
        owner = store.get("ownerEmail")
        if not owner:
            u = User.objects.filter(store_slug=slug).order_by("id").first()
            owner = u.email if u else None
        if owner:
            buyer = d.get("buyer") or {}
            first = (buyer.get("name") or "").split()[0] if (buyer.get("name") or "").split() else ""
            biz = f" ({buyer['businessName']})" if buyer.get("businessName") else ""
            lines = [
                f"Hello {store.get('contactPerson') or store.get('name')},", "",
                "The Kartiva team has sent you a product request from a buyer:" if from_admin else "A buyer has posted a product request in your category:", "",
                f"Product / requirement: {d.get('title')}", f"Category: {category}", f"Quantity: {qty}",
                f"Target price: {inr(d['targetPrice']) + ' per ' + str(d.get('unit')) if d.get('targetPrice') else 'Open to offers'}",
                f"Delivery to: {d.get('deliveryCity')}", f"Needed by: {need_by}", f"Buyer: {first}{biz}, {buyer.get('city') or d.get('deliveryCity')}", "",
                f"Details: {d.get('details')}", *(["", f"Note from Kartiva: {note}"] if note else []), "",
                "Send your quote from Seller Hub → Buy requests before the deadline.", "— Team Kartiva",
            ]
            send_email([owner], f"Product request: {d.get('title')} ({qty}, {d.get('deliveryCity')})", "\n".join(lines),
                       sent_by=by if from_admin else "Kartiva (automatic)")
        sent.append(slug)
    rfq.save()
    return sent


def rfq_for_update(pk):
    return Rfq.objects.select_for_update().filter(pk=pk).first()
