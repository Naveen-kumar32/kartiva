"""Seller Hub growth API (port of frontend src/api/sellerGrowthApi.js): leads, buy requests & quotes, customers (CRM),
analytics, business profile & KYC, membership plan, team, bulk upload, support tickets and the dashboard summary.
Everything is scoped to request.user.store_slug — other stores' records are 404."""
import re
from datetime import datetime, timedelta, timezone

from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.catalog.models import Category, Product, StockMovement
from apps.core.errors import ApiError
from apps.core.services import atomic, audit, get_platform, next_id, notify, now_iso, send_email
from apps.market import views as market_views
from apps.market.models import Enquiry, KycDocument, Plan, Rfq, SellerStaff, Subscription, Thread, Ticket
from apps.market.services import _next_message_id, fmt_num, need_by_label, open_thread, recompute_kyc, refresh_badges
from apps.orders import services as orders
from apps.orders.models import Return

from .services import (
    DAY_MS, IST, active_subscription, actor, as_num, between, consume_credit, credits_of, decorate_lead, hub_data, iso_ms, jround, js_number,
    month_key, now_ms, own_lead, own_store, response_hours_of, seeded, seller, short_date, slugify, store_products, sub_orders_of,
    text, time_ms,
)

ENQUIRIES_LINK = "/account/enquiries"


# ---------- Leads & enquiries ----------
@api_view(["GET"])
def leads(request):
    _, store_row = seller(request)
    store, slug = store_row.data, store_row.slug
    rows = sorted((e.data for e in Enquiry.objects.filter(store_slug=slug)), key=lambda e: e.get("createdAt") or "", reverse=True)
    today = datetime.now(IST)
    month_start = int(today.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
    closed = [x for x in rows if x.get("status") in ("won", "lost")]
    times = [h for h in (response_hours_of(x) for x in rows) if h is not None]
    won = [x for x in rows if x.get("status") == "won"]
    return Response({
        "kpis": {
            "avgResponseHours": sum(times) / len(times) if times else None,
            "conversion": (len(won) / len(closed)) * 100 if closed else 0,
            "inProgress": sum(1 for x in rows if x.get("status") in ("contacted", "quoted")),
            "newCount": sum(1 for x in rows if x.get("status") == "new"),
            "wonThisMonth": sum(1 for x in won if time_ms(x.get("updatedAt")) >= month_start),
        },
        "leads": [decorate_lead(x, store) for x in rows], "plan": store.get("plan") or "free",
    })


LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"]


def _product_name(pid, fallback):
    p = Product.objects.filter(pk=pid).first() if pid else None
    return p.data.get("name") if p else fallback


@api_view(["POST"])
def lead_status(request, pk):
    user, store_row = seller(request)
    store = store_row.data
    status = request.data.get("status")
    with atomic():
        lead = own_lead(store_row.slug, pk, lock=True)
        d = lead.data
        if status not in LEAD_STATUSES:
            raise ApiError("Unknown status.")
        if d.get("status") == status:
            return Response(decorate_lead(d, store))
        if d.get("status") == "new" and not d.get("respondedAt"):
            d["respondedAt"] = now_iso()
        before = d.get("status")
        d["status"], d["updatedAt"] = status, now_iso()
        lead.save()
        what = _product_name(d.get("productId"), "your enquiry")
        to = {"email": (d.get("buyer") or {}).get("email"), "role": "buyer"}
        if status == "quoted":
            notify(to, f"Quotation from {store['name']}", f"{store['name']} has sent a quotation for {what}. Check your messages.", ENQUIRIES_LINK)
        if status == "won":
            notify(to, f"{store['name']} confirmed your order request", f"Your enquiry for {what} is confirmed. The seller will share next steps.", ENQUIRIES_LINK)
        audit("lead.status", f"Enquiry #{lead.pk}", f"{store['name']}: {before} → {status}", actor(user, store_row))
    return Response(decorate_lead(d, store))


@api_view(["POST"])
def lead_note(request, pk):
    user, store_row = seller(request)
    note = text(request.data.get("text"), 1000)
    with atomic():
        lead = own_lead(store_row.slug, pk, lock=True)
        if not note:
            raise ApiError("Write a note first.")
        lead.data["notes"] = [*(lead.data.get("notes") or []), {"at": now_iso(), "author": actor(user, store_row), "text": note}]
        lead.save()
    return Response(decorate_lead(lead.data, store_row.data))


@api_view(["POST"])
def lead_reply(request, pk):
    """Opens (or reuses) the buyer conversation for an enquiry → {threadId}."""
    _, store_row = seller(request)
    slug, store = store_row.slug, store_row.data
    with atomic():
        lead = own_lead(slug, pk, lock=True)
        d = lead.data
        if d.get("status") == "spam":
            raise ApiError("This enquiry is marked as spam.")
        existing = None
        if d.get("threadId"):
            existing = Thread.objects.filter(store_slug=slug, pk=d["threadId"]).first()
        existing = existing or Thread.objects.filter(store_slug=slug, data__context__type="enquiry", data__context__id=lead.pk).first()
        if existing:
            lead.update(threadId=existing.pk)
            return Response({"threadId": existing.pk})
        product = Product.objects.filter(pk=d.get("productId")).first() if d.get("productId") else None
        subject = f"{product.data['name']} — enquiry" if product else f"Enquiry for {store['name']}"
        thread = open_thread(d.get("buyer") or {}, slug, subject, {"id": lead.pk, "type": "enquiry"}, sender="seller")
        # The buyer's original enquiry opens the conversation (no notification — it was sent already).
        thread.data["messages"].append({"at": d.get("createdAt"), "body": d.get("message"), "from": "buyer", "id": _next_message_id()})
        thread.save()
        d["threadId"] = thread.pk
        if d.get("status") == "new":
            d["status"], d["respondedAt"], d["updatedAt"] = "contacted", now_iso(), now_iso()
        lead.save()
    return Response({"threadId": thread.pk})


# ---------- Buy requests (RFQ) ----------
def matching_slugs(store_slug):
    cats = {c.slug: c.data for c in Category.objects.all()}
    by_id = {c.get("id"): c for c in cats.values()}
    slugs = set()
    for p in store_products(store_slug):
        slugs.add(p.get("categorySlug"))
        cat = cats.get(p.get("categorySlug"))
        root = by_id.get(cat.get("parentId")) if cat and cat.get("parentId") else None
        if root:
            slugs.add(root.get("slug"))
    return slugs


def decorate_rfq(rfq, store_slug, slugs):
    cat = Category.objects.filter(slug=rfq.get("categorySlug")).first()
    mine = next((q for q in rfq.get("quotes") or [] if q.get("storeSlug") == store_slug), None)
    thread = Thread.objects.filter(store_slug=store_slug, data__context__type="rfq", data__context__id=rfq["id"]).first()
    dispatch = next((x for x in rfq.get("dispatches") or [] if x.get("storeSlug") == store_slug), None)
    buyer = rfq.get("buyer") or {}
    return {
        "forwardedByKartiva": bool(dispatch and dispatch.get("by") != "auto"), "kartivaNote": (dispatch or {}).get("note") or "", "sentToMe": bool(dispatch),
        "viewedAt": (dispatch or {}).get("viewedAt"),
        "buyer": {"city": buyer.get("city") or rfq.get("deliveryCity"), "name": (buyer.get("name") or "").split()[0] if (buyer.get("name") or "").split() else ""},
        "categoryName": cat.data.get("name") if cat else rfq.get("categorySlug"), "categorySlug": rfq.get("categorySlug"), "createdAt": rfq.get("createdAt"),
        "deadline": rfq.get("deadline"), "deliveryCity": rfq.get("deliveryCity"), "details": rfq.get("details"), "id": rfq["id"],
        "matches": rfq.get("categorySlug") in slugs or bool(dispatch), "myQuote": mine, "quantity": rfq.get("quantity"), "quoteCount": len(rfq.get("quotes") or []),
        "status": rfq.get("status"), "targetPrice": rfq.get("targetPrice"), "threadId": thread.pk if thread else None, "title": rfq.get("title"), "unit": rfq.get("unit"),
    }


def _visible_to(rfq, slug):
    return rfq.get("status") == "open" or any(q.get("storeSlug") == slug for q in rfq.get("quotes") or []) or any(x.get("storeSlug") == slug for x in rfq.get("dispatches") or [])


@api_view(["GET"])
def rfqs(request):
    _, store_row = seller(request)
    slug, store = store_row.slug, store_row.data
    slugs = matching_slugs(slug)
    visible = sorted((r.data for r in Rfq.objects.all() if _visible_to(r.data, slug)), key=lambda r: r.get("createdAt") or "", reverse=True)
    return Response({"credits": credits_of(store), "plan": store.get("plan") or "free", "rfqs": [decorate_rfq(r, slug, slugs) for r in visible]})


@api_view(["POST"])
def rfq_viewed(request, pk):
    _, store_row = seller(request)
    with atomic():
        rfq = Rfq.objects.select_for_update().filter(pk=pk).first()
        dispatch = next((x for x in (rfq.data.get("dispatches") or []) if x.get("storeSlug") == store_row.slug), None) if rfq else None
        if dispatch and not dispatch.get("viewedAt"):
            dispatch["viewedAt"] = now_iso()
            rfq.save()
    return Response(True)


@api_view(["POST"])
def rfq_quote(request, pk):
    """quote: {pricePerUnit, leadTimeDays, validTill (yyyy-mm-dd), note} — first quote on a request uses a plan credit."""
    user, store_row = seller(request)
    store, slug = store_row.data, store_row.slug
    q = request.data
    if store.get("status") and store.get("status") != "approved":
        raise ApiError("Your store must be approved before you can quote on buy requests.", 403)
    with atomic():
        row = Rfq.objects.select_for_update().filter(pk=pk).first()
        if not row or not _visible_to(row.data, slug):
            raise ApiError("Buy request not found.", 404)
        rfq = row.data
        if rfq.get("status") != "open" or time_ms(rfq.get("deadline")) < now_ms():
            raise ApiError("This buy request is no longer accepting quotes.", 409)
        price_raw, lead_raw = js_number(q.get("pricePerUnit")), js_number(q.get("leadTimeDays"))
        price = as_num(jround(price_raw * 100) / 100) if price_raw == price_raw else price_raw
        lead = jround(lead_raw) if lead_raw == lead_raw else lead_raw
        try:
            valid_till = datetime.fromisoformat(f"{q.get('validTill')}T23:59:59+05:30")
        except (TypeError, ValueError):
            valid_till = None
        if not (price > 0):
            raise ApiError("Enter a valid price per unit.")
        if not (1 <= lead <= 365):
            raise ApiError("Lead time must be 1–365 days.")
        if not valid_till or valid_till.timestamp() * 1000 < now_ms():
            raise ApiError("Validity must be a future date.")
        note = text(q.get("note"), 1000)
        total = jround(price * rfq["quantity"])
        quotes = rfq.setdefault("quotes", [])
        existing = next((x for x in quotes if x.get("storeSlug") == slug), None)
        if existing:
            if existing.get("status") != "submitted":
                raise ApiError("This quote can no longer be edited.", 409)
            existing.update({"leadTimeDays": lead, "note": note, "pricePerUnit": price, "updatedAt": now_iso(), "validTill": iso_ms(valid_till)})
        else:
            credits = credits_of(store)
            if credits["total"] is not None and credits["used"] >= credits["total"]:
                raise ApiError("You've used all buy-request quotes in your plan this month. Upgrade to quote more.", 402)
            qid = max([x.get("id") or 0 for r in Rfq.objects.all() for x in r.data.get("quotes") or []] or [0]) + 1
            quotes.append({"createdAt": now_iso(), "id": qid, "leadTimeDays": lead, "note": note, "pricePerUnit": price, "status": "submitted", "storeSlug": slug,
                           "validTill": iso_ms(valid_till)})
            consume_credit(store, now_iso())
        row.save()
        unit = rfq.get("unit")
        summary = (f"Quotation for “{rfq.get('title')}”: ₹{fmt_num(price)} per {unit} × {fmt_num(rfq['quantity'])} = ₹{fmt_num(total)} (+ GST as applicable). "
                   f"Lead time {lead} days, valid till {need_by_label(iso_ms(valid_till))}." + (f"\n\n{note}" if note else ""))
        if not Thread.objects.filter(store_slug=slug, data__context__type="rfq", data__context__id=row.pk).exists():
            open_thread(rfq.get("buyer") or {}, slug, f"RFQ: {rfq.get('title')}", {"id": row.pk, "type": "rfq"}, first_message=summary, sender="seller")
        notify({"email": (rfq.get("buyer") or {}).get("email"), "role": "buyer"}, "Quote updated" if existing else "New quote received",
               f"{store['name']} quoted ₹{fmt_num(price)} / {unit} for “{rfq.get('title')}”.", ENQUIRIES_LINK)
        audit("rfq.quote_updated" if existing else "rfq.quoted", f"RFQ #{row.pk}", f"{store['name']} quoted ₹{price} / {unit} ({lead} days)", actor(user, store_row))
    return Response(decorate_rfq(rfq, slug, matching_slugs(slug)))


# ---------- Customers (CRM) ----------
def segment_of(c):
    if not c["orders"]:
        return "lead"
    if c["orders"] >= 3 or c["totalSpent"] >= 50000:
        return "vip"
    if now_ms() - time_ms(c["lastOrder"]) > 45 * DAY_MS:
        return "at_risk"
    return "repeat" if c["orders"] >= 2 else "new"


@api_view(["GET"])
def customers(request):
    _, store_row = seller(request)
    slug = store_row.slug
    notes = hub_data(slug).data["customerNotes"]
    enquiries = [e.data for e in Enquiry.objects.filter(store_slug=slug)]
    threads = [t.data for t in Thread.objects.filter(store_slug=slug)]
    returns = [r.data for r in Return.objects.filter(store_slug=slug)]
    by_email = {}
    for s in sub_orders_of(slug, address_key="address", extra=False):
        b, addr = s.get("buyer") or {}, s.get("address") or {}
        key = b.get("email")
        c = by_email.get(key) or {"city": addr.get("city") or "", "email": key, "history": [], "name": b.get("name"), "orders": 0, "phone": b.get("phone") or "",
                                   "state": addr.get("state") or "", "totalSpent": 0}
        c["history"].append({"createdAt": s.get("createdAt"), "items": sum(i.get("quantity") or 0 for i in s.get("items") or []), "number": s.get("number"),
                             "status": s.get("status"), "total": s.get("total")})
        if s.get("status") != "cancelled":
            c["orders"] += 1
            c["totalSpent"] = as_num(c["totalSpent"] + (s.get("total") or 0))
        by_email[key] = c
    for e in enquiries:
        b = e.get("buyer") or {}
        if e.get("status") != "spam" and b.get("email") not in by_email:
            by_email[b.get("email")] = {"businessName": b.get("businessName"), "city": b.get("city") or "", "email": b.get("email"), "history": [], "name": b.get("name"),
                                        "orders": 0, "phone": b.get("phone") or "", "state": "", "totalSpent": 0}
    out = []
    for c in by_email.values():
        dates = sorted(h["createdAt"] for h in c["history"])
        mine = sorted((t for t in threads if (t.get("buyer") or {}).get("email") == c["email"]), key=lambda t: t.get("updatedAt") or "", reverse=True)
        row = {
            **c, "aov": jround(c["totalSpent"] / c["orders"]) if c["orders"] else 0, "enquiries": sum(1 for e in enquiries if (e.get("buyer") or {}).get("email") == c["email"]),
            "firstOrder": dates[0] if dates else None, "history": sorted(c["history"], key=lambda h: h["createdAt"] or "", reverse=True), "lastOrder": dates[-1] if dates else None,
            "notes": (notes.get(c["email"]) or {}).get("notes") or "", "returns": sum(1 for r in returns if (r.get("buyer") or {}).get("email") == c["email"]),
            "tags": (notes.get(c["email"]) or {}).get("tags") or [], "threadId": mine[0]["id"] if mine else None,
        }
        out.append({**row, "segment": segment_of(row)})
    out.sort(key=lambda c: (-c["totalSpent"], (c["name"] or "").lower()))
    return Response(out)


@api_view(["PUT"])
def customer_notes(request):
    _, store_row = seller(request)
    slug = store_row.slug
    email = text(request.data.get("email"))
    known = any((s.get("buyer") or {}).get("email") == email for s in sub_orders_of(slug, extra=False)) or Enquiry.objects.filter(store_slug=slug, buyer_email=email).exists()
    if not email or not known:
        raise ApiError("Customer not found.", 404)
    tags = request.data.get("tags") if isinstance(request.data.get("tags"), list) else []
    clean = {"notes": text(request.data.get("notes"), 2000), "tags": list(dict.fromkeys(t for t in (text(x, 24) for x in tags) if t))[:10], "updatedAt": now_iso()}
    with atomic():
        hub = hub_data(slug)
        hub.data["customerNotes"][email] = clean
        hub.save()
    return Response(clean)


# ---------- Analytics (deterministic sample traffic anchored on real orders) ----------
STOP = {"with", "and", "for", "the", "pack", "of", "set", "in", "-", "&"}


@api_view(["GET"])
def analytics(request):
    _, store_row = seller(request)
    slug = store_row.slug
    try:
        days = int(request.query_params.get("days") or 30)
    except ValueError:
        days = 30
    rng = days if days in (7, 30, 90) else 30
    now = now_ms()
    start = now - rng * DAY_MS
    all_subs = [s for s in sub_orders_of(slug, address_key="address", extra=False) if s.get("status") != "cancelled"]
    in_range = [s for s in all_subs if time_ms(s["createdAt"]) > start]
    prev = [s for s in all_subs if start - rng * DAY_MS < time_ms(s["createdAt"]) <= start]
    revenue = as_num(sum(s.get("total") or 0 for s in in_range))
    prev_revenue = as_num(sum(s.get("total") or 0 for s in prev))
    products = list(reversed(store_products(slug)))  # catalogue order (oldest first), like the mock array
    rand = seeded(f"{slug}:{rng}")

    n_orders = len(in_range)
    active = sum(1 for p in products if p.get("status") == "active")
    product_views = jround(n_orders * between(rand, 40, 70) if n_orders else active * rng * between(rand, 0.8, 2))
    store_views = jround(product_views * between(rand, 0.25, 0.4))
    add_to_carts = jround(max(n_orders, n_orders * between(rand, 3, 5)) if n_orders else product_views * between(rand, 0.02, 0.05))
    checkouts = jround(max(n_orders, n_orders * between(rand, 1.3, 1.7)) if n_orders else add_to_carts * 0.3)

    bucket_days = 1 if rng == 7 else 7
    buckets = -(-rng // bucket_days)
    series = []
    for i in range(buckets):
        end = now - (buckets - 1 - i) * bucket_days * DAY_MS
        frm = end - bucket_days * DAY_MS
        value = as_num(sum(s.get("total") or 0 for s in in_range if frm < time_ms(s["createdAt"]) <= end))
        series.append({"label": short_date(end, "weekday" if rng == 7 else "day_month"), "value": value})

    per_product = {}
    for s in in_range:
        for it in s.get("items") or []:
            r = per_product.setdefault(it.get("productId"), {"orders": 0, "revenue": 0, "units": 0})
            r["orders"] += 1
            r["units"] += it.get("quantity") or 0
            r["revenue"] = as_num(r["revenue"] + (it.get("lineTotal") or 0))
    top = []
    for p in products:
        r = per_product.get(p["id"]) or {"orders": 0, "revenue": 0, "units": 0}
        views = jround(r["orders"] * between(rand, 35, 80) if r["orders"] else between(rand, 4, 30) * (rng / 7))
        top.append({**r, "conversion": (r["orders"] / views) * 100 if views else 0, "id": p["id"], "name": p.get("name"), "thumbnail": p.get("thumbnail"), "views": views})
    top.sort(key=lambda x: (-x["revenue"], -x["views"]))

    by_state = {}
    for s in in_range:
        st = (s.get("address") or {}).get("state") or "—"
        by_state[st] = as_num(by_state.get(st, 0) + (s.get("total") or 0))
    states = sorted(by_state.items(), key=lambda kv: -kv[1])
    rest = as_num(sum(v for _, v in states[5:]))
    sales_by_state = [{"label": label, "share": jround((value / revenue) * 100) if revenue else 0, "value": value}
                      for label, value in [*states[:5], *([("Other states", rest)] if rest else [])]]

    first_at = {}
    for s in all_subs:
        t, e = time_ms(s["createdAt"]), (s.get("buyer") or {}).get("email")
        if e not in first_at or t < first_at[e]:
            first_at[e] = t
    buyers = list(dict.fromkeys((s.get("buyer") or {}).get("email") for s in in_range))
    new_customers = sum(1 for e in buyers if first_at.get(e, 0) > start)

    lead_rows = [e.data for e in Enquiry.objects.filter(store_slug=slug).order_by("id") if e.data.get("status") != "spam" and time_ms(e.data.get("createdAt")) > start]
    responded = [h for h in (response_hours_of(x) for x in lead_rows) if h is not None]

    words = {}
    for p in products:
        tokens = [w for w in re.split(r"[\s,()/]+", (p.get("name") or "").lower()) if len(w) > 2 and w not in STOP and not re.fullmatch(r"\d+", w)]
        first = tokens[0] if tokens else None
        for k in [" ".join(tokens[:2]), first, f"{first or ''} price"]:
            if k and len(k.strip()) > 2:
                words[k] = words.get(k, 0) + 1
    keywords = [{"clicks": 0, "keyword": k, "searches": jround(between(rand, 20, 400) * (rng / 30) + 5)} for k in list(words)[:10]]
    keywords = [{**k, "clicks": jround(k["searches"] * between(rand, 0.08, 0.3))} for k in keywords]
    keywords.sort(key=lambda k: -k["searches"])

    return Response({
        "funnel": {"addToCarts": add_to_carts, "checkouts": checkouts, "orders": n_orders, "productViews": product_views, "storeViews": store_views},
        "kpis": {"aov": revenue / n_orders if n_orders else 0, "conversion": (n_orders / product_views) * 100 if product_views else 0, "orders": n_orders,
                 "prevOrders": len(prev), "prevRevenue": prev_revenue, "revenue": revenue},
        "keywords": keywords,
        "leadFunnel": {"avgResponseHours": sum(responded) / len(responded) if responded else None, "enquiries": len(lead_rows),
                       "quoted": sum(1 for x in lead_rows if x.get("status") in ("quoted", "won")), "won": sum(1 for x in lead_rows if x.get("status") == "won")},
        "customers": {"new": new_customers, "repeat": len(buyers) - new_customers},
        "range": rng, "revenueSeries": series, "salesByState": sales_by_state, "topProducts": top[:8],
    })


# ---------- Business profile & KYC ----------
KYC_REQUIRED = ["gst_certificate", "pan_card", "cancelled_cheque"]
KYC_OPTIONAL = ["address_proof", "trade_licence", "fssai_bis_licence"]
KYC_MAX_KB = 5 * 1024
BUSINESS_TYPES = ["Manufacturer", "Manufacturer & Exporter", "Wholesaler", "Distributor", "Brand", "Authorised Dealer", "Authorised Retailer", "Retailer", "Service Provider"]
TURNOVER_BANDS = ["Up to ₹1 Cr", "₹1–5 Cr", "₹5–10 Cr", "₹10–25 Cr", "₹25–50 Cr", "₹50 Cr+"]


def _business_profile(store_row):
    docs = sorted((k.data for k in KycDocument.objects.filter(store_slug=store_row.slug)), key=lambda x: x.get("uploadedAt") or "", reverse=True)
    latest = {t: next((x for x in docs if x.get("type") == t), None) for t in [*KYC_REQUIRED, *KYC_OPTIONAL]}
    return {"documents": latest, "store": store_row.data}


def _list(v, max_items):
    items = v if isinstance(v, list) else str(v or "").split(",")
    return list(dict.fromkeys(x for x in (str(i).strip() for i in items) if x))[:max_items]


@api_view(["GET", "PATCH"])
def business(request):
    if request.method == "GET":
        _, store_row = seller(request)
        return Response(_business_profile(store_row))
    p = request.data
    with atomic():
        user, store_row = own_store(request, lock=True)
        try:
            year = int(js_number(p.get("yearEstablished")))
        except (TypeError, ValueError, OverflowError):
            year = 0
        if p.get("businessType") not in BUSINESS_TYPES:
            raise ApiError("Choose a business type.")
        if p.get("annualTurnover") not in TURNOVER_BANDS:
            raise ApiError("Choose an annual turnover band.")
        if not (1900 <= year <= datetime.now(IST).year):
            raise ApiError("Enter a valid year of establishment.")
        s = store_row.data
        s.update({
            "annualTurnover": p["annualTurnover"], "businessType": p["businessType"], "certifications": [c[:60] for c in _list(p.get("certifications"), 12)],
            "contactPerson": text(p.get("contactPerson"), 80), "description": text(p.get("description"), 1500), "employees": str(p.get("employees") or "")[:20],
            "mainMarkets": [m[:40] for m in _list(p.get("mainMarkets"), 12)], "phone": text(p.get("phone"), 20), "yearEstablished": year,
        })
        store_row.save()
        audit("store.profile_updated", f"Store {store_row.slug}", f"{s['name']} updated its business profile", actor(user, store_row))
    return Response(s)


@api_view(["POST"])
def kyc_upload(request):
    """Multipart (file) or JSON metadata {docType, name, size, type}. Only metadata is stored — never the file contents."""
    user, store_row = seller(request)
    slug, store = store_row.slug, store_row.data
    doc_type = request.data.get("docType")
    upload = request.FILES.get("file")
    name = upload.name if upload else str(request.data.get("name") or "")
    size = upload.size if upload else js_number(request.data.get("size"))
    if doc_type not in [*KYC_REQUIRED, *KYC_OPTIONAL]:
        raise ApiError("Unknown document type.")
    ext = name.lower().rsplit(".", 1)[-1]
    if ext not in ("pdf", "jpg", "jpeg", "png"):
        raise ApiError("Upload a PDF, JPG or PNG file.")
    size_kb = -(-int(size) // 1024) if size == size and size > 0 else 0
    if not (size_kb > 0) or size_kb > KYC_MAX_KB:
        raise ApiError("File must be smaller than 5 MB.")
    with atomic():
        KycDocument.objects.filter(store_slug=slug, data__type=doc_type).delete()  # a re-upload replaces the previous one
        doc = KycDocument.create({
            "fileName": name[:120], "fileType": "application/pdf" if ext == "pdf" else f"image/{'jpeg' if ext == 'jpg' else ext}", "note": "", "reviewedAt": None,
            "reviewedBy": None, "sizeKb": size_kb, "status": "pending", "storeSlug": slug, "type": doc_type, "uploadedAt": now_iso(),
        }).data
        store_row = recompute_kyc(slug)
        notify({"role": "admin"}, "KYC document uploaded", f"{store['name']} uploaded {doc_type.replace('_', ' ')} ({doc['fileName']}) for verification.", "/admin/verification")
        audit("kyc.uploaded", f"Store {slug}", f"{store['name']} uploaded {doc_type}", actor(user, store_row))
    return Response({"doc": doc, "store": store_row.data}, status=201)


# ---------- Membership plan ----------
GST_RATE = 18


@api_view(["GET"])
def plan(request):
    _, store_row = seller(request)
    slug = store_row.slug
    history = sorted((s.data for s in Subscription.objects.filter(store_slug=slug)), key=lambda s: s.get("startsAt") or "", reverse=True)
    sub = active_subscription(slug)
    return Response({"credits": credits_of(store_row.data), "history": history, "plans": [p.data for p in Plan.objects.all() if p.data.get("isActive")],
                     "store": store_row.data, "subscription": sub.data if sub else None})


@api_view(["POST"])
def plan_change(request):
    """{planCode, paymentRef} — paid plans need the (simulated) payment reference; issues a membership invoice number."""
    plan_code, payment_ref = request.data.get("planCode"), request.data.get("paymentRef")
    with atomic():
        user, store_row = own_store(request, lock=True)
        store, slug = store_row.data, store_row.slug
        plan_row = Plan.objects.filter(code=plan_code).first() if plan_code else None
        if not plan_row or not plan_row.data.get("isActive"):
            raise ApiError("Plan not found.", 404)
        p = plan_row.data
        if (store.get("plan") or "free") == p["code"]:
            raise ApiError("You're already on this plan.", 409)
        amount = as_num(js_number(p.get("priceYearly")) or 0)
        if amount > 0 and not payment_ref:
            raise ApiError("Payment is required to activate this plan.", 402)
        prev = Subscription.objects.select_for_update().filter(store_slug=slug, status="active")
        for row in prev:
            row.update(replacedAt=now_iso(), status="replaced")
        starts = datetime.now(timezone.utc)
        invoiced = sum(1 for s in Subscription.objects.all() if s.data.get("invoiceNumber"))
        gst = as_num(jround(amount * GST_RATE) / 100)
        sub = Subscription.create({
            "amount": amount, "creditsMonth": month_key(), "endsAt": iso_ms(starts + timedelta(days=365)) if amount else None, "gst": gst,
            "invoiceNumber": f"KTV-MEM/26-27/{invoiced + 1:04d}" if amount else None, "leadCreditsUsed": 0, "paymentRef": payment_ref or None,
            "planCode": p["code"], "startsAt": iso_ms(starts), "status": "active", "storeSlug": slug, "total": as_num(amount + gst),
        }).data
        before = store.get("plan") or "free"
        store["plan"] = p["code"]
        refresh_badges(store)
        store_row.save()
        paid = f"₹{fmt_num(amount + gst)}"
        audit("plan.changed", f"Store {slug}", f"{store['name']} switched plan {before} → {p['code']}" + (f" ({paid} incl. GST, {sub['invoiceNumber']})" if amount else ""), actor(user, store_row))
        notify({"role": "admin"}, "New membership purchase" if amount else "Membership downgraded", f"{store['name']} is now on {p.get('name')}" + (f" — {paid} paid" if amount else "") + ".", "/admin/plans")
    return Response({"store": store, "subscription": sub})


# ---------- Team ----------
TEAM_ROLES = ["manager", "catalogue", "orders", "accounts"]
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def own_member(slug, pk):
    m = SellerStaff.objects.select_for_update().filter(pk=pk, store_slug=slug).first()
    if not m:
        raise ApiError("Team member not found.", 404)
    return m


@api_view(["GET", "POST"])
def team(request):
    user, store_row = seller(request)
    slug, store = store_row.slug, store_row.data
    if request.method == "GET":
        return Response([m.data for m in SellerStaff.objects.filter(store_slug=slug).order_by("id")])
    b = request.data
    email = text(b.get("email")).lower()
    if not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address.")
    if b.get("role") not in TEAM_ROLES:
        raise ApiError("Choose a role.")
    name = text(b.get("name"), 80)
    if not name:
        raise ApiError("Enter the team member's name.")
    with atomic():
        if SellerStaff.objects.filter(email=email).exists():
            raise ApiError("This email is already part of a seller team.", 409)
        member = SellerStaff.create({"email": email, "invitedAt": now_iso(), "lastActiveAt": None, "name": name, "role": b["role"], "status": "invited", "storeSlug": slug}).data
        send_email([email], f"You're invited to {store['name']} on Kartiva Seller Hub",
                   "\n".join([f"Hello {name},", "", f"{actor(user, store_row)} invited you to help manage {store['name']} on Kartiva Seller Hub as {b['role']}.",
                              "Accept the invite by signing in to Kartiva with this email address.", "", "— Team Kartiva"]))
        audit("team.invited", f"Store {slug}", f"{name} <{email}> invited as {b['role']}", actor(user, store_row))
    return Response(member, status=201)


@api_view(["PATCH", "DELETE"])
def team_member(request, pk):
    user, store_row = seller(request)
    slug = store_row.slug
    with atomic():
        m = own_member(slug, pk)
        d = m.data
        if request.method == "DELETE":
            if d.get("role") == "owner":
                raise ApiError("The store owner can't be removed.", 403)
            m.delete()
            audit("team.removed", f"Store {slug}", f"{d.get('name')} <{d.get('email')}> removed", actor(user, store_row))
            return Response(d)
        if d.get("role") == "owner":
            raise ApiError("The store owner can't be changed.", 403)
        patch, changes = request.data, []
        if patch.get("role") and patch["role"] != d.get("role"):
            if patch["role"] not in TEAM_ROLES:
                raise ApiError("Choose a role.")
            changes.append(f"role {d.get('role')} → {patch['role']}")
            d["role"] = patch["role"]
        if patch.get("status") and patch["status"] != d.get("status"):
            if patch["status"] not in ("active", "disabled"):
                raise ApiError("Unknown status.")
            if patch["status"] == "active" and d.get("status") == "invited":
                raise ApiError("Invited members become active when they accept.", 409)
            changes.append("disabled" if patch["status"] == "disabled" else "enabled")
            d["status"] = patch["status"]
        if patch.get("resend"):
            if d.get("status") != "invited":
                raise ApiError("Only pending invites can be resent.", 409)
            d["invitedAt"] = now_iso()
            changes.append("invite resent")
            send_email([d["email"]], f"You're invited to {store_row.data['name']} on Kartiva Seller Hub",
                       "\n".join([f"Hello {d.get('name')},", "", f"Reminder: you're invited to help manage {store_row.data['name']} on Kartiva Seller Hub as {d.get('role')}.", "", "— Team Kartiva"]))
        m.save()
        if changes:
            audit("team.updated", f"Store {slug}", f"{d.get('name')}: {', '.join(changes)}", actor(user, store_row))
    return Response(d)


# ---------- Bulk upload ----------
@api_view(["GET"])
def bulk(request):
    _, store_row = seller(request)
    variants = [{"mrp": v.get("mrp"), "price": v.get("price"), "product": p.get("name"), "sku": v.get("sku"), "stock": v.get("stock"),
                 "variant": " / ".join(str(x) for x in (v.get("attributes") or {}).values()) or "Default"}
                for p in reversed(store_products(store_row.slug)) for v in p.get("variants") or []]
    return Response({"uploads": hub_data(store_row.slug).data["uploads"], "variants": variants})


def record_upload(slug, entry):
    hub = hub_data(slug)
    uploads = hub.data["uploads"]
    uploads.insert(0, {"at": now_iso(), "id": max([u.get("id") or 0 for u in uploads] or [0]) + 1, **entry})
    del uploads[30:]
    hub.save()


def _rows(request, limit):
    rows = request.data.get("rows")
    if not isinstance(rows, list):
        raise ApiError("No rows to upload.")
    return [r if isinstance(r, dict) else {} for r in rows[:limit]], text(request.data.get("fileName"), 120) or "upload.csv"


@api_view(["POST"])
def bulk_price_stock(request):
    """rows [{sku, price, mrp, stock}] — applied to this store's SKUs only; anything else is 'Unknown SKU'."""
    user, store_row = seller(request)
    slug, store = store_row.slug, store_row.data
    rows, file_name = _rows(request, 5000)
    errors, applied = [], 0
    with atomic():
        own = {}
        for p in Product.objects.select_for_update().filter(store_slug=slug, deleted_at__isnull=True):
            for v in p.data.get("variants") or []:
                own[str(v.get("sku") or "").upper()] = (p.pk, v.get("id"))
        for i, row in enumerate(rows):
            hit = own.get(text(row.get("sku")).upper())
            if not hit:
                errors.append({"row": i + 2, "sku": row.get("sku"), "error": "Unknown SKU"})
                continue
            price, mrp, stock = js_number(row.get("price")), js_number(row.get("mrp")), js_number(row.get("stock"))
            if not (price > 0) or not (mrp > 0):
                errors.append({"row": i + 2, "sku": row.get("sku"), "error": "Invalid price"})
                continue
            if price > mrp:
                errors.append({"row": i + 2, "sku": row.get("sku"), "error": "Price is higher than MRP"})
                continue
            if stock != stock or stock != int(stock) or stock < 0:
                errors.append({"row": i + 2, "sku": row.get("sku"), "error": "Invalid stock"})
                continue
            product = Product.objects.get(pk=hit[0])
            variant = next(v for v in product.data["variants"] if v.get("id") == hit[1])
            changed = False
            if variant.get("price") != price or variant.get("mrp") != mrp:
                variant["price"], variant["mrp"], changed = as_num(price), as_num(mrp), True
                product.save()
            if int(stock) != variant.get("stock"):
                orders.move_stock(hit[1], int(stock) - variant["stock"], "bulk_upload", note=f"Bulk upload · {file_name}", actor="seller")
                changed = True
            if changed:
                applied += 1
                Product.objects.get(pk=hit[0]).update(updatedAt=now_iso())
        record_upload(slug, {"failed": len(errors), "fileName": file_name, "mode": "update", "ok": applied})
        audit("catalog.bulk_update", f"Store {slug}", f"{store['name']} bulk-updated {applied} variant(s) from {file_name}", actor(user, store_row))
    return Response({"applied": applied, "errors": errors})


@api_view(["POST"])
def bulk_create(request):
    """rows [{name, categorySlug, brand, description, price, mrp, stock, hsn, gstRate, imageUrl}] → new products for this store."""
    user, store_row = seller(request)
    slug, store = store_row.slug, store_row.data
    rows, file_name = _rows(request, 500)
    platform = get_platform()
    moderation = platform.get("productModerationEnabled") is not False
    gst_choices = platform.get("gstRateChoices") or [0, 5, 12, 18, 28]
    cats = {c.slug: c.data for c in Category.objects.all()}
    errors, created = [], []
    from .views import max_variant_id
    with atomic():
        vid = max_variant_id()
        used = {str(v.get("sku") or "").upper() for p in store_products(slug) for v in p.get("variants") or []}
        for i, row in enumerate(rows):
            def fail(error, row=row, i=i):
                errors.append({"error": error, "name": row.get("name"), "row": i + 2})
            name = text(row.get("name"))
            category = cats.get(text(row.get("categorySlug")))
            price, mrp, stock, gst_rate = js_number(row.get("price")), js_number(row.get("mrp")), js_number(row.get("stock")), js_number(row.get("gstRate"))
            hsn, image = text(row.get("hsn")), text(row.get("imageUrl"))
            if len(name) < 3:
                fail("Name is too short")
            elif not category or not category.get("parentId"):
                fail("Category must be an existing sub-category")
            elif not (price > 0) or not (mrp > 0):
                fail("Invalid price")
            elif price > mrp:
                fail("Price is higher than MRP")
            elif stock != stock or stock != int(stock) or stock < 0:
                fail("Invalid stock")
            elif not re.fullmatch(r"\d{4,8}", hsn):
                fail("HSN must be 4–8 digits")
            elif gst_rate not in gst_choices:
                fail(f"GST must be one of {', '.join(str(g) for g in gst_choices)}")
            elif image and not re.fullmatch(r"https://\S+", image):
                fail("Image URL must start with https://")
            else:
                pid = next_id(Product)
                sku = "-".join(w[:3] for w in slugify(name).split("-")[:3]).upper() + f"-{pid}"
                while sku in used:
                    sku += "X"
                used.add(sku)
                vid += 1
                stock = int(stock)
                variant = {"attributes": {}, "id": vid, "isDefault": True, "lowStockThreshold": 3, "mrp": as_num(mrp), "price": as_num(price), "sku": sku, "stock": stock}
                product = {
                    "brand": text(row.get("brand")) or store["name"], "categorySlug": category["slug"], "createdAt": now_iso(), "deletedAt": None,
                    "description": text(row.get("description")) or name, "gstRate": as_num(gst_rate), "hsnCode": hsn, "id": pid, "images": [image or "/placeholder-product.svg"],
                    "isFeatured": False, "isReturnable": True, "name": name, "rating": 0, "returnWindowDays": platform.get("defaultReturnWindowDays", 7), "reviewCount": 0,
                    "slug": f"{slugify(name)}-{pid}", "soldCount": 0, "specifications": [], "status": "pending_review" if moderation else "active", "storeSlug": slug,
                    "thumbnail": image or "/placeholder-product.svg", "variantOptions": [], "variants": [variant],
                }
                Product.create(product)
                if stock:
                    StockMovement.create({"actor": "seller", "at": now_iso(), "delta": stock, "note": f"Opening stock · bulk upload {file_name}", "productId": pid,
                                          "productName": name, "reason": "initial", "sku": sku, "stockAfter": stock, "storeSlug": slug, "variantId": vid})
                created.append({"id": pid, "name": name, "status": product["status"]})
        record_upload(slug, {"failed": len(errors), "fileName": file_name, "mode": "create", "ok": len(created)})
        audit("catalog.bulk_create", f"Store {slug}", f"{store['name']} added {len(created)} product(s) from {file_name}", actor(user, store_row))
    return Response({"created": created, "errors": errors, "moderation": moderation})


# ---------- Help & support ----------
SELLER_TICKET_CATEGORIES = ["payments", "orders", "catalogue", "kyc", "ads", "technical", "other"]
SLA_PRIORITIES = ["high", "low", "medium", "urgent"]


def own_ticket(slug, pk):
    t = Ticket.objects.select_for_update().filter(pk=pk, store_slug=slug).first()
    if not t:
        raise ApiError("Ticket not found.", 404)
    return t


@api_view(["GET", "POST"])
def tickets(request):
    user, store_row = seller(request)
    slug = store_row.slug
    if request.method == "GET":
        return Response(sorted((t.data for t in Ticket.objects.filter(store_slug=slug)), key=lambda t: t.get("updatedAt") or "", reverse=True))
    b = request.data
    category = b.get("category")
    if category not in SELLER_TICKET_CATEGORIES:
        raise ApiError("Choose a category.")
    if b.get("priority") not in SLA_PRIORITIES:
        raise ApiError("Choose a priority.")
    if not text(b.get("subject")) or not text(b.get("message")):
        raise ApiError("Subject and message are required.")
    with atomic():
        ticket = market_views.create_ticket(user, {"category": category, "message": b.get("message"), "orderNumber": "", "priority": b.get("priority"), "subject": b.get("subject")})
        row = Ticket.objects.get(pk=ticket["id"])
        row.update(category=category)  # seller categories (catalogue, kyc, ads, technical) aren't in the buyer list
    return Response(row.data, status=201)


@api_view(["POST"])
def ticket_reply(request, pk):
    _, store_row = seller(request)
    body = text(request.data.get("body"), 4000)
    with atomic():
        t = own_ticket(store_row.slug, pk)
        if not body:
            raise ApiError("Type a message first.")
        d, at = t.data, now_iso()
        d.setdefault("messages", []).append({"at": at, "body": body, "from": "seller", "id": market_views._next_ticket_message_id()})
        d["updatedAt"] = at
        if d.get("status") in ("resolved", "closed"):
            d["status"] = "open"
        t.save()
        notify({"role": "admin"}, "Ticket reply", f"{d.get('number')}: {store_row.data['name']} replied.", "/admin/support")
    return Response(d)


@api_view(["POST"])
def ticket_resolve(request, pk):
    _, store_row = seller(request)
    with atomic():
        t = own_ticket(store_row.slug, pk)
        at = now_iso()
        t.update(resolvedAt=at, status="resolved", updatedAt=at)
    return Response(t.data)


# ---------- Dashboard summary ----------
@api_view(["GET"])
def growth_summary(request):
    _, store_row = seller(request)
    slug, store = store_row.slug, store_row.data
    slugs = matching_slugs(slug)
    products = store_products(slug)
    profile = bool(store.get("businessType") and store.get("yearEstablished") and store.get("contactPerson") and store.get("phone") and store.get("mainMarkets")
                   and (store.get("description") or store.get("certifications")))
    now = now_ms()
    open_rfqs = sum(1 for r in (x.data for x in Rfq.objects.filter(status="open"))
                    if r.get("categorySlug") in slugs and time_ms(r.get("deadline")) > now and not any(q.get("storeSlug") == slug for q in r.get("quotes") or []))
    return Response({
        "checklist": {"kyc": store.get("kycStatus") == "verified", "plan": (store.get("plan") or "free") != "free", "product": len(products) > 0, "profile": profile,
                      "shipping": len(store.get("shippingMethods") or []) > 0},
        "credits": credits_of(store), "kycStatus": store.get("kycStatus") or "not_submitted",
        "newLeads": Enquiry.objects.filter(store_slug=slug, status="new").count(), "openRfqs": open_rfqs,
        "unreadMessages": sum(((t.data.get("unread") or {}).get("seller") or 0) for t in Thread.objects.filter(store_slug=slug)),
    })

