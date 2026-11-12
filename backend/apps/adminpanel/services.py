"""Admin read models — ports of the mock branches in frontend src/api/adminApi.js + adminGrowthApi.js that compute
dashboards, reports, analytics, risk flags, the money ledger and the tax centre. Pure reads (no writes here);
the views do the writes and the audit log. Every function returns the same camelCase JSON the mock returns."""
import re
from datetime import datetime, timedelta, timezone

from apps.accounts.models import User
from apps.catalog.models import Category, Product, Review, Store
from apps.catalog.services import build_reviews
from apps.core.models import AuditLog
from apps.core.services import get_platform
from apps.market.models import AdminStaff, Broadcast, Enquiry, KycDocument, Plan, Rfq, Subscription, Thread, Ticket
from apps.marketing.models import Ad
from apps.orders.models import Buyer, CommissionRule, Order, Refund, Return, SellerApplication, Settlement
from apps.orders.pricing import DAY_MS, js_round, ms_to_iso, now_ms, parse_ms, round2
from apps.orders.services import ledger_for

HOUR = 3_600_000
IST = timezone(timedelta(hours=5, minutes=30))
PLATFORM_STATE = "33"  # Kartiva is registered in Tamil Nadu
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
SLA_HOURS = {"high": 8, "low": 72, "medium": 24, "urgent": 4}
DEFAULT_HOME_SECTIONS = {"buyRequestBanner": True, "featuredStores": True, "heroCarousel": True, "sponsoredRow": True}
HIDDEN_PLATFORM_KEYS = {"idempotency", "dismissedRiskFlags"}


# ---------- small helpers ----------
def ms(iso):
    return parse_ms(iso) if iso else 0


def day_label(epoch_ms):
    """toLocaleDateString("en-IN", {day: "numeric", month: "short"}) in India time → "12 Nov"."""
    d = datetime.fromtimestamp(epoch_ms / 1000, IST)
    return f"{d.day} {'Sept' if d.month == 9 else d.strftime('%b')}"


def slugify(s):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", str(s).lower()))


def orders_data():
    return [o.data for o in Order.objects.all()]


def subs_of(orders, live=True):
    """Sub-orders flattened with the parent's createdAt and a reference to the parent order (liveSubs/allSubs)."""
    return [{**s, "createdAt": o.get("createdAt"), "order": o} for o in orders for s in o.get("subOrders") or [] if not live or s.get("status") != "cancelled"]


def tax_sum(s):
    t = s.get("tax") or {}
    return (t.get("cgst") or 0) + (t.get("sgst") or 0) + (t.get("igst") or 0)


def stores_map():
    return {s.slug: s.data for s in Store.objects.all()}


def public_platform():
    return {k: v for k, v in get_platform().items() if k not in HIDDEN_PLATFORM_KEYS}


# ---------- Dashboard ----------
def dashboard():
    now = now_ms()
    orders = orders_data()
    subs = subs_of(orders)
    ads = [a.data for a in Ad.objects.all()]
    last30 = [s for s in subs if now - ms(s["createdAt"]) < 30 * DAY_MS]
    gmv = sum(s.get("total") or 0 for s in last30)
    orders30 = len({s["order"]["number"] for s in last30})
    ad_revenue = sum(a.get("spend") or 0 for a in ads)
    weeks = []
    for i in range(8):
        end = now - (7 - i) * 7 * DAY_MS
        start = end - 7 * DAY_MS
        in_week = [s for s in subs if start < ms(s["createdAt"]) <= end]
        ad_total = 0
        for a in ads:
            if not a.get("spend"):
                continue
            a_start = ms(a.get("startsAt"))
            a_end = min(now, ms(a.get("endsAt")))
            overlap = max(0, min(end, a_end) - max(start, a_start))
            ad_total += (a["spend"] * overlap) / (a_end - a_start) if a_end > a_start else 0
        weeks.append({"ads": js_round(ad_total), "commission": js_round(sum(s.get("commissionAmount") or 0 for s in in_week)), "label": day_label(end)})
    method_counts = {}
    for o in orders:
        method_counts[o.get("paymentMethod")] = method_counts.get(o.get("paymentMethod"), 0) + 1
    n_orders = len(orders) or 1
    stores = [s.data for s in Store.objects.all()]
    store_gmv = []
    for store in stores:
        own = [s for s in subs if s.get("storeSlug") == store.get("slug")]
        store_gmv.append({"commission": sum(s.get("commissionAmount") or 0 for s in own), "gmv": sum(s.get("total") or 0 for s in own), "orders": len(own), "store": store})
    store_gmv.sort(key=lambda r: -r["gmv"])
    products = [p.data for p in Product.objects.all()]
    return {
        "alerts": {
            "codRefunds": Refund.objects.filter(status="pending").count(),
            "escalatedReturns": sum(1 for r in Return.objects.all() if r.data.get("escalated")),
            "lowStockVariants": sum(1 for p in products for v in p.get("variants") or [] if v.get("stock") == 0),
            "pendingAds": Ad.objects.filter(status="pending_approval").count(),
            "pendingProducts": sum(1 for p in products if p.get("status") == "pending_review" and not p.get("deletedAt")),
            "pendingSellers": SellerApplication.objects.filter(status="pending").count(),
            "settlementsToPay": Settlement.objects.filter(status="approved").count(),
        },
        "kpis": {
            "activeSellers": sum(1 for s in stores if s.get("status") == "approved"), "adRevenue": ad_revenue, "aov": gmv / orders30 if orders30 else 0,
            "buyers": Buyer.objects.count(), "commissionRevenue": sum(s.get("commissionAmount") or 0 for s in last30), "gmv": gmv,
            "liveProducts": sum(1 for p in products if p.get("status") == "active" and not p.get("deletedAt")), "orders": orders30,
        },
        "paymentMix": [
            {"label": "Online (UPI, cards, net banking, EMI)", "share": js_round((method_counts.get("online", 0) / n_orders) * 100)},
            {"label": "Cash on Delivery", "share": js_round((method_counts.get("cod", 0) / n_orders) * 100)},
        ],
        "recentAudit": [a.data for a in AuditLog.objects.all()[:6]],
        "revenueByWeek": weeks,
        "topStores": store_gmv[:6],
    }


# ---------- Stores, buyers, settlements ----------
def stores_overview():
    subs = subs_of(orders_data())
    rules = [r.data for r in CommissionRule.objects.all()]
    products = [p.data for p in Product.objects.filter(deleted_at__isnull=True)]
    out = []
    for store in (s.data for s in Store.objects.all()):
        slug = store.get("slug")
        own = [s for s in subs if s.get("storeSlug") == slug]
        rule = next((r for r in rules if r.get("scope") == "store" and r.get("storeSlug") == slug and r.get("isActive")), None)
        out.append({**store, "balance": ledger_for(slug)["balance"], "commissionOverride": rule.get("rate") if rule else None,
                    "gmv": sum(s.get("total") or 0 for s in own), "orders": len(own), "products": sum(1 for p in products if p.get("storeSlug") == slug)})
    return out


def buyers_overview():
    orders = orders_data()
    out = []
    for b in (x.data for x in Buyer.objects.all()):
        own = sorted((o for o in orders if (o.get("buyer") or {}).get("email") == b.get("email")), key=lambda o: o.get("createdAt") or "", reverse=True)
        refusals = sum(1 for o in own for s in o.get("subOrders") or [] if s.get("status") == "undelivered")
        out.append({**b, "lastOrderAt": own[0].get("createdAt") if own else None, "orders": len(own), "refusals": refusals,
                    "spent": sum(o.get("grandTotal") or 0 for o in own)})
    return out


def settlements_overview():
    stores = []
    for store in (s.data for s in Store.objects.all()):
        ledger = ledger_for(store.get("slug"))
        open_entries = [e for e in ledger["entries"] if not e.get("settlementId") and e["type"] != "payout"]
        stores.append({"openAmount": js_round(sum(e["amount"] for e in open_entries) * 100) / 100, "openEntries": len(open_entries), "pending": ledger["pending"], "store": store})
    return {"settlements": [s.data for s in Settlement.objects.all()], "stores": stores}


# ---------- Reviews ----------
def admin_reviews():
    out = []
    for p in Product.objects.filter(deleted_at__isnull=True).order_by("id")[:30]:
        p = p.data
        rows = list(Review.objects.filter(product_id=p.get("id")).order_by("id")[:3])
        reviews = ([{**{k: v for k, v in r.data.items() if k not in ("productId", "reviewKey")}, "id": r.data.get("reviewKey") or r.data.get("id"), "hidden": bool(r.data.get("hidden"))} for r in rows]
                   if rows else [{**r, "hidden": False} for r in build_reviews(p, 3)])
        out += [{**r, "productName": p.get("name"), "productSlug": p.get("slug"), "storeSlug": p.get("storeSlug")} for r in reviews]
    return out


# ---------- Reports ----------
def reports(date_from=None, date_to=None):
    platform = get_platform()

    def in_range(iso):
        day = (iso or "")[:10]
        return (not date_from or day >= date_from) and (not date_to or day <= date_to)

    subs = [s for s in subs_of(orders_data()) if in_range(s["createdAt"])]

    def group(key_fn):
        acc = {}
        for s in subs:
            k = key_fn(s)
            g = acc.setdefault(k, {"commission": 0, "gmv": 0, "items": 0, "key": k, "orders": 0, "tax": 0})
            g["commission"] += s.get("commissionAmount") or 0
            g["gmv"] += s.get("total") or 0
            g["items"] += sum(i.get("quantity") or 0 for i in s.get("items") or [])
            g["orders"] += 1
            g["tax"] += tax_sum(s)
        return sorted(acc.values(), key=lambda g: g["key"], reverse=True)

    cats = {c.slug: c.data for c in Category.objects.all()}
    product_cat = {p.pk: p.category_slug for p in Product.objects.all()}
    by_cat = {}
    for s in subs:
        for it in s.get("items") or []:
            slug = product_cat.get(it.get("productId"))
            g = by_cat.setdefault(slug, {"gmv": 0, "items": 0, "key": (cats.get(slug) or {}).get("name", slug)})
            g["gmv"] += it.get("lineTotal") or 0
            g["items"] += it.get("quantity") or 0
    gst = {}
    for s in subs:
        state = (s["order"].get("address") or {}).get("state")
        g = gst.setdefault(state, {"cgst": 0, "igst": 0, "key": state, "sgst": 0, "taxable": 0})
        t = s.get("tax") or {}
        for k in ("cgst", "igst", "sgst", "taxable"):
            g[k] += t.get(k) or 0
    tcs_tds = []
    for store in (x.data for x in Store.objects.all()):
        own = [s for s in subs if s.get("storeSlug") == store.get("slug")]
        gross = sum(s.get("subtotal") or 0 for s in own)
        taxable = sum((s.get("tax") or {}).get("taxable") or 0 for s in own)
        if gross > 0:
            tcs_tds.append({"gross": gross, "gstin": store.get("gstin"), "key": store.get("name"), "taxable": taxable,
                            "tcs": taxable * platform.get("tcsRate", 0) / 100, "tds": gross * platform.get("tdsRate", 0) / 100})
    return {
        "byCategory": sorted(by_cat.values(), key=lambda g: -g["gmv"]),
        "byDay": group(lambda s: (s["createdAt"] or "")[:10]),
        "byPayment": group(lambda s: "Cash on Delivery" if s["order"].get("paymentMethod") == "cod" else "Online"),
        "byStore": group(lambda s: s.get("storeName")),
        "gst": sorted(gst.values(), key=lambda g: -g["taxable"]),
        "tcsTds": tcs_tds,
        "totals": {"commission": sum(s.get("commissionAmount") or 0 for s in subs), "gmv": sum(s.get("total") or 0 for s in subs),
                   "orders": len({s["order"]["number"] for s in subs}), "tax": sum(tax_sum(s) for s in subs)},
    }


# ---------- Leads & product requests ----------
def first_seller_reply_hours(enquiry, threads):
    thread = threads.get(enquiry.get("threadId")) if enquiry.get("threadId") else None
    reply = next((m for m in (thread or {}).get("messages") or [] if m.get("from") == "seller"), None)
    return (ms(reply["at"]) - ms(enquiry.get("createdAt"))) / HOUR if reply else None


def leads():
    now = now_ms()
    stores = stores_map()
    cats = {c.slug: c.data for c in Category.objects.all()}
    product_names = {p.pk: p.data.get("name") for p in Product.objects.all()}
    threads = {t.pk: t.data for t in Thread.objects.all()}
    enquiries = sorted(({**e.data, "productName": product_names.get(e.data.get("productId")), "replyHours": first_seller_reply_hours(e.data, threads),
                         "storeName": (stores.get(e.data.get("storeSlug")) or {}).get("name", e.data.get("storeSlug"))} for e in Enquiry.objects.all()),
                       key=lambda e: e.get("createdAt") or "", reverse=True)
    raw_rfqs = [r.data for r in Rfq.objects.all()]
    rfqs = sorted(({**r, "categoryName": (cats.get(r.get("categorySlug")) or {}).get("name", r.get("categorySlug")),
                    "quotes": [{**q, "store": stores.get(q.get("storeSlug")) or {"name": q.get("storeSlug"), "slug": q.get("storeSlug")}} for q in r.get("quotes") or []]}
                   for r in raw_rfqs), key=lambda r: r.get("createdAt") or "", reverse=True)
    replies = [e["replyHours"] for e in enquiries if e["replyHours"] is not None]
    awarded = 0
    for r in raw_rfqs:
        if r.get("status") == "awarded":
            q = next((x for x in r.get("quotes") or [] if x.get("status") == "accepted"), None)
            awarded += q["pricePerUnit"] * r.get("quantity", 0) if q else 0
    by_status = {}
    for e in enquiries:
        by_status[e.get("status")] = by_status.get(e.get("status"), 0) + 1
    return {
        "enquiries": enquiries,
        "kpis": {
            "avgResponseHours": sum(replies) / len(replies) if replies else None, "awardedValue": awarded, "byStatus": by_status,
            "leads7d": sum(1 for e in enquiries if now - ms(e.get("createdAt")) < 7 * DAY_MS),
            "leadsToday": sum(1 for e in enquiries if now - ms(e.get("createdAt")) < DAY_MS),
            "openRfqs": sum(1 for r in raw_rfqs if r.get("status") == "open"),
            "quoteRate": (sum(1 for r in raw_rfqs if r.get("quotes")) / len(raw_rfqs)) * 100 if raw_rfqs else 0,
        },
        "rfqs": rfqs,
        "stores": sorted(({"name": s.get("name"), "slug": s.get("slug")} for s in stores.values() if s.get("status") == "approved"), key=lambda s: s["name"] or ""),
    }


def product_requests():
    now = now_ms()
    stores = stores_map()
    categories = [c.data for c in Category.objects.all()]
    cat_by_slug = {c.get("slug"): c for c in categories}
    cat_by_id = {c.get("id"): c for c in categories}
    products = [p.data for p in Product.objects.filter(deleted_at__isnull=True)]

    def root_of(slug):
        c = cat_by_slug.get(slug)
        return cat_by_id.get(c.get("parentId")) if c and c.get("parentId") else c

    def name_of(slug):
        return (stores.get(slug) or {}).get("name", slug)

    requests = []
    for r in (x.data for x in Rfq.objects.all()):
        root = root_of(r.get("categorySlug"))
        family = {r.get("categorySlug")}
        if root:
            family |= {root.get("slug"), *(c.get("slug") for c in categories if c.get("parentId") == root.get("id"))}
        suggested = [slug for slug in dict.fromkeys(p.get("storeSlug") for p in products if p.get("categorySlug") in family) if (stores.get(slug) or {}).get("status") == "approved"]
        quotes = r.get("quotes") or []
        dispatches = [{**d, "quote": next((q for q in quotes if q.get("storeSlug") == d.get("storeSlug")), None), "storeName": name_of(d.get("storeSlug"))} for d in r.get("dispatches") or []]
        for q in quotes:
            if not any(d.get("storeSlug") == q.get("storeSlug") for d in dispatches):
                dispatches.append({"at": q.get("createdAt"), "by": "self", "note": "", "quote": q, "storeName": name_of(q.get("storeSlug")), "storeSlug": q.get("storeSlug"), "viewedAt": q.get("createdAt")})
        expired = r.get("status") == "open" and ms(r.get("deadline")) < now
        stage = ("awarded" if r.get("status") == "awarded" else "closed" if r.get("status") == "closed" or expired
                 else "quoted" if quotes else "awaiting" if dispatches else "sourcing")
        requests.append({**r, "categoryName": (cat_by_slug.get(r.get("categorySlug")) or {}).get("name", r.get("categorySlug")), "dispatches": dispatches,
                         "rootName": (root or {}).get("name", ""), "stage": stage, "suggested": suggested,
                         "stats": {"quoted": sum(1 for d in dispatches if d.get("quote")), "sent": len(dispatches), "viewed": sum(1 for d in dispatches if d.get("viewedAt"))}})
    requests.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
    approved = [{"city": s.get("city"), "kycStatus": s.get("kycStatus"), "name": s.get("name"), "plan": s.get("plan"), "slug": s.get("slug")} for s in stores.values() if s.get("status") == "approved"]
    return {"requests": requests, "stores": approved}


def matching_seller_slugs(rfq):
    """Approved stores with products in the RFQ's category (or its direct sub-categories) that haven't quoted yet."""
    categories = [c.data for c in Category.objects.all()]
    cat = next((c for c in categories if c.get("slug") == rfq.get("categorySlug")), None)
    family = {rfq.get("categorySlug"), *(c.get("slug") for c in categories if cat and c.get("parentId") == cat.get("id"))}
    stores = stores_map()
    quoted = {q.get("storeSlug") for q in rfq.get("quotes") or []}
    slugs = dict.fromkeys(p.data.get("storeSlug") for p in Product.objects.filter(deleted_at__isnull=True).order_by("id") if p.data.get("categorySlug") in family)
    return [s for s in slugs if (stores.get(s) or {}).get("status") == "approved" and s not in quoted]


# ---------- KYC ----------
def kyc_queue():
    docs = [d.data for d in KycDocument.objects.all()]
    out = []
    for store in (s.data for s in Store.objects.exclude(status="rejected")):
        own = sorted((d for d in docs if d.get("storeSlug") == store.get("slug")), key=lambda d: d.get("uploadedAt") or "", reverse=True)
        out.append({"docs": own, "lastUpload": own[0].get("uploadedAt") if own else None, "pendingDocs": sum(1 for d in own if d.get("status") == "pending"), "store": store})
    return out


# ---------- Plans ----------
def plans_overview():
    now = now_ms()
    stores = stores_map()
    plans = [p.data for p in Plan.objects.all()]
    raw = [s.data for s in Subscription.objects.all()]
    subscriptions = []
    for s in raw:
        plan = next((p for p in plans if p.get("code") == s.get("planCode")), None)
        subscriptions.append({**s, "leadCredits": plan.get("leadCredits") if plan else None,
                              "renewalDue": s.get("status") == "active" and bool(s.get("endsAt")) and ms(s.get("endsAt")) - now < 30 * DAY_MS,
                              "planName": plan.get("name") if plan else s.get("planCode"), "storeName": (stores.get(s.get("storeSlug")) or {}).get("name", s.get("storeSlug"))})
    subscriptions.sort(key=lambda s: s.get("startsAt") or "", reverse=True)
    active_paid = [s for s in subscriptions if s.get("status") == "active" and (s.get("amount") or 0) > 0]
    active = [s for s in subscriptions if s.get("status") == "active"]
    live = [s for s in stores.values() if s.get("status") == "approved"]
    mix = [{"code": p.get("code"), "count": sum(1 for s in live if (s.get("plan") or "free") == p.get("code")), "name": p.get("name")} for p in plans]
    total = sum(m["count"] for m in mix) or 1
    commission = sum(s.get("commissionAmount") or 0 for s in subs_of(orders_data()))
    ads = sum(a.data.get("spend") or 0 for a in Ad.objects.all())
    memberships = sum(s.get("amount") or 0 for s in raw if (s.get("amount") or 0) > 0)
    stream_total = (commission + ads + memberships) or 1
    return {
        "streams": [{"key": k, "share": js_round((v / stream_total) * 100), "value": round2(v)} for k, v in (("commission", commission), ("ads", ads), ("memberships", memberships))],
        "kpis": {
            "activePaid": len(active_paid), "arr": sum(s.get("amount") or 0 for s in active_paid), "collected": memberships,
            "renewalsDue": sum(1 for s in active if s.get("endsAt") and ms(s["endsAt"]) > now and ms(s["endsAt"]) - now < 30 * DAY_MS),
        },
        "mix": [{**m, "share": js_round((m["count"] / total) * 100)} for m in mix],
        "plans": plans,
        "stores": sorted(({"name": s.get("name"), "plan": s.get("plan") or "free", "slug": s.get("slug")} for s in live), key=lambda s: s["name"] or ""),
        "subscriptions": subscriptions,
    }


# ---------- Support ----------
def first_response_at(t):
    return next((m.get("at") for m in t.get("messages") or [] if m.get("from") == "admin"), None)


def decorate_ticket(t, stores, now=None):
    now = now or now_ms()
    slug = (t.get("raisedBy") or {}).get("storeSlug")
    return {**t, "firstResponseAt": first_response_at(t), "overdue": t.get("status") in ("open", "in_progress") and ms(t.get("slaDueAt")) < now,
            "storeName": (stores.get(slug) or {}).get("name") if slug else None}


def tickets_overview():
    now = now_ms()
    stores = stores_map()
    tickets = sorted((decorate_ticket(t.data, stores, now) for t in Ticket.objects.all()), key=lambda t: t.get("updatedAt") or "", reverse=True)
    responded = [t for t in tickets if t["firstResponseAt"]]
    return {
        "kpis": {
            "avgFirstResponseHours": sum((ms(t["firstResponseAt"]) - ms(t.get("createdAt"))) / HOUR for t in responded) / len(responded) if responded else None,
            "open": sum(1 for t in tickets if t.get("status") in ("open", "in_progress")),
            "overdue": sum(1 for t in tickets if t["overdue"]),
            "resolvedWeek": sum(1 for t in tickets if t.get("status") in ("resolved", "closed") and now - ms(t.get("updatedAt")) < 7 * DAY_MS),
        },
        "staff": [{"name": s.data.get("name"), "role": s.data.get("role")} for s in AdminStaff.objects.all() if s.data.get("status") == "active"],
        "tickets": tickets,
    }


# ---------- Broadcasts ----------
def active_buyer_count():
    return sum(1 for b in Buyer.objects.all() if b.data.get("isActive") is not False)


def audience_size(audience, plan_code=None, store_slug=None):
    sellers = [s.data for s in Store.objects.filter(status="approved")]
    buyers = active_buyer_count()
    if audience == "sellers":
        return {"label": f"All sellers ({len(sellers)})", "recipients": len(sellers)}
    if audience == "buyers":
        return {"label": f"All buyers ({buyers})", "recipients": buyers}
    if audience == "everyone":
        return {"label": f"Everyone ({len(sellers) + buyers})", "recipients": len(sellers) + buyers}
    if audience == "store":
        store = next((s for s in sellers if s.get("slug") == store_slug), None)
        return {"label": store.get("name") if store else "—", "recipients": 1 if store else 0}
    if audience == "plan":
        plan = Plan.objects.filter(code=plan_code).first()
        n = sum(1 for s in sellers if (s.get("plan") or "free") == plan_code)
        return {"label": f"{plan.data.get('name') if plan else plan_code} sellers ({n})", "recipients": n}
    return {"label": "—", "recipients": 0}


def broadcast_data():
    sellers = [s.data for s in Store.objects.filter(status="approved")]
    plans = [p.data for p in Plan.objects.all()]
    return {
        "counts": {"buyers": active_buyer_count(), "plans": {p.get("code"): sum(1 for s in sellers if (s.get("plan") or "free") == p.get("code")) for p in plans}, "sellers": len(sellers)},
        "history": sorted((b.data for b in Broadcast.objects.all()), key=lambda b: b.get("sentAt") or "", reverse=True),
        "plans": [{"code": p.get("code"), "name": p.get("name")} for p in plans],
        "stores": sorted(({"name": s.get("name"), "slug": s.get("slug")} for s in sellers), key=lambda s: s["name"] or ""),
    }


# ---------- Risk ----------
def last10(phone):
    return re.sub(r"\D", "", str(phone or ""))[-10:]


def risk_flags():
    now = now_ms()
    orders = orders_data()
    buyers = [b.data for b in Buyer.objects.all()]
    returns = [r.data for r in Return.objects.all()]
    buyer_by_email = {b.get("email"): b for b in buyers}
    flags = []

    per_buyer = {}
    for o in orders:
        ob = o.get("buyer") or {}
        b = per_buyer.setdefault(ob.get("email"), {"cancelled": 0, "email": ob.get("email"), "name": ob.get("name"), "returns": 0, "subs": 0, "undelivered": 0})
        for s in o.get("subOrders") or []:
            b["subs"] += 1
            b["cancelled"] += s.get("status") == "cancelled"
            b["undelivered"] += s.get("status") == "undelivered"
    for r in returns:
        email = (r.get("buyer") or {}).get("email")
        if email in per_buyer:
            per_buyer[email]["returns"] += 1
    for b in per_buyer.values():
        bad = b["cancelled"] + b["returns"] + b["undelivered"]
        if bad < 2:
            continue
        flags.append({
            "entity": {"email": b["email"], "kind": "buyer", "name": b["name"]}, "key": f"buyer-abuse:{b['email']}", "metric": f"{js_round((bad / b['subs']) * 100)}%",
            "reason": {"cancelled": b["cancelled"], "returns": b["returns"], "subs": b["subs"], "undelivered": b["undelivered"]},
            "severity": "high" if bad >= 3 or b["undelivered"] >= 2 else "medium", "type": "buyer_returns",
            "codBlocked": bool((buyer_by_email.get(b["email"]) or {}).get("codBlocked")),
        })
    for o in orders:
        if o.get("paymentMethod") != "cod" or (o.get("grandTotal") or 0) <= 5000:
            continue
        open_subs = [s for s in o.get("subOrders") or [] if s.get("status") not in ("delivered", "cancelled", "undelivered")]
        if not open_subs:
            continue
        ob = o.get("buyer") or {}
        flags.append({
            "codBlocked": bool((buyer_by_email.get(ob.get("email")) or {}).get("codBlocked")), "entity": {"email": ob.get("email"), "kind": "order", "name": o.get("number")},
            "key": f"cod-high:{o.get('number')}", "metric": o.get("grandTotal"), "reason": {"amount": o.get("grandTotal"), "buyer": ob.get("name"), "status": open_subs[0].get("status")},
            "severity": "high" if o["grandTotal"] > 10000 else "medium", "type": "cod_high_value",
        })
    for b in buyers:
        if b.get("codBlocked"):
            flags.append({"codBlocked": True, "entity": {"email": b.get("email"), "kind": "buyer", "name": b.get("name")}, "key": f"cod-blocked:{b.get('email')}", "reason": {}, "severity": "low", "type": "cod_blocked"})
    all_subs = [s for o in orders for s in o.get("subOrders") or []]
    for store in (s.data for s in Store.objects.exclude(status="rejected")):
        slug = store.get("slug")
        subs = [s for s in all_subs if s.get("storeSlug") == slug]
        cancelled = sum(1 for s in subs if s.get("status") == "cancelled")
        n_returns = sum(1 for r in returns if r.get("storeSlug") == slug)
        rate = (cancelled / len(subs)) * 100 if subs else 0
        entity = {"kind": "store", "name": store.get("name"), "slug": slug, "status": store.get("status")}
        if (len(subs) >= 5 and rate >= 10) or n_returns >= 2:
            flags.append({"entity": entity, "key": f"seller-quality:{slug}", "metric": f"{rate:.1f}%", "reason": {"cancelled": cancelled, "rate": rate, "returns": n_returns, "subs": len(subs)},
                          "severity": "high" if rate >= 15 or n_returns >= 3 else "medium", "type": "seller_quality"})
        recent = sum(1 for s in subs if s.get("status") != "cancelled")
        if store.get("status") == "approved" and store.get("kycStatus") != "verified" and recent > 0:
            flags.append({"entity": dict(entity), "key": f"kyc-selling:{slug}", "reason": {"kycStatus": store.get("kycStatus"), "orders": recent}, "severity": "high", "type": "kyc_selling"})
    stores = stores_map()
    for e in (x.data for x in Enquiry.objects.filter(status="spam")):
        flags.append({"entity": {"email": (e.get("buyer") or {}).get("email"), "kind": "enquiry", "name": (e.get("buyer") or {}).get("name")}, "key": f"spam:{e.get('id')}",
                      "reason": {"message": e.get("message"), "store": (stores.get(e.get("storeSlug")) or {}).get("name")}, "severity": "low", "type": "spam_enquiry"})
    phones = {}

    def add_phone(phone, email, name):
        p = last10(phone)
        if len(p) == 10:
            phones.setdefault(p, {})[email] = name

    for b in buyers:
        add_phone((b.get("address") or {}).get("phone"), b.get("email"), b.get("name"))
    for u in User.objects.filter(role="buyer"):
        d = u.data or {}
        add_phone(d.get("phone"), u.email, f"{d.get('firstName')} {d.get('lastName')}")
    for o in orders:
        ob = o.get("buyer") or {}
        add_phone(ob.get("phone"), ob.get("email"), ob.get("name"))
    for phone, m in phones.items():
        if len(m) > 1:
            flags.append({"entity": {"kind": "phone", "name": f"+91 {phone[:5]} {phone[5:]}"}, "key": f"dup-phone:{phone}", "reason": {"accounts": list(m.values()), "emails": list(m.keys())},
                          "severity": "high" if len(m) > 2 else "medium", "type": "duplicate_phone"})
    for f in flags:
        f["isBuyer"] = bool(f["entity"].get("email") and f["entity"]["email"] in buyer_by_email)
    dismissed = set(get_platform().get("dismissedRiskFlags") or [])
    visible = [f for f in flags if f["key"] not in dismissed]
    rank = {"high": 0, "low": 2, "medium": 1}
    visible.sort(key=lambda f: rank[f["severity"]])
    return {"checkedAt": ms_to_iso(now), "dismissedCount": len(flags) - len(visible), "flags": visible}


# ---------- Analytics ----------
M32 = 0xFFFFFFFF


def prng(seed):
    """mulberry32 — identical sequence to the JS prng() in adminGrowthApi.js."""
    state = [seed & M32]

    def nxt():
        a = (state[0] + 0x6D2B79F5) & M32
        state[0] = a
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return nxt


def share(items, total):
    return [{**x, "share": js_round((x["value"] / total) * 100) if total else 0} for x in items]


def analytics(days=30):
    now = now_ms()
    start = now - days * DAY_MS
    orders_all = orders_data()

    def in_range(iso):
        return start < ms(iso) <= now

    subs = [s for s in subs_of(orders_all) if in_range(s["createdAt"])]
    orders = [o for o in orders_all if in_range(o.get("createdAt")) and any(s.get("status") != "cancelled" for s in o.get("subOrders") or [])]
    gmv = sum(s.get("total") or 0 for s in subs)
    bucket_days = 3 if days <= 30 else 7
    buckets = -(-days // bucket_days)
    trend = []
    for i in range(buckets):
        end = now - (buckets - 1 - i) * bucket_days * DAY_MS
        frm = end - bucket_days * DAY_MS
        in_b = [s for s in subs if frm < ms(s["createdAt"]) <= end]
        trend.append({"gmv": js_round(sum(s.get("total") or 0 for s in in_b)), "label": day_label(end), "orders": len({s["order"]["number"] for s in in_b})})
    first_order = {}
    for o in sorted(orders_all, key=lambda o: o.get("createdAt") or ""):
        first_order.setdefault((o.get("buyer") or {}).get("email"), o.get("createdAt"))
    buyer_emails = list(dict.fromkeys((o.get("buyer") or {}).get("email") for o in orders))
    new_buyers = sum(1 for e in buyer_emails if in_range(first_order.get(e)))

    categories = [c.data for c in Category.objects.all()]
    cat_by_slug = {c.get("slug"): c for c in categories}
    cat_by_id = {c.get("id"): c for c in categories}
    product_cat = {p.pk: p.category_slug for p in Product.objects.all()}

    def top_of(slug):
        cat = cat_by_slug.get(slug)
        parent = cat_by_id.get(cat.get("parentId")) if cat and cat.get("parentId") else None
        return parent or cat

    by_cat, by_state = {}, {}
    for s in subs:
        for it in s.get("items") or []:
            k = (top_of(product_cat.get(it.get("productId"))) or {}).get("name") or "Other"
            by_cat[k] = by_cat.get(k, 0) + (it.get("lineTotal") or 0)
        k = (s["order"].get("address") or {}).get("state")
        by_state[k] = by_state.get(k, 0) + (s.get("total") or 0)
    cat_items = sorted(({"label": k, "value": v} for k, v in by_cat.items()), key=lambda x: -x["value"])
    state_items = sorted(({"label": k, "value": v} for k, v in by_state.items()), key=lambda x: -x["value"])[:10]

    every = subs_of(orders_all, live=False)
    leaderboard = []
    for store in (s.data for s in Store.objects.all()):
        own = [s for s in every if s.get("storeSlug") == store.get("slug") and in_range(s["createdAt"])]
        live = [s for s in own if s.get("status") != "cancelled"]
        if not live:
            continue
        leaderboard.append({"cancelRate": (sum(1 for s in own if s.get("status") == "cancelled") / len(own)) * 100 if own else 0, "gmv": sum(s.get("total") or 0 for s in live),
                            "name": store.get("name"), "orders": len(live), "plan": store.get("plan") or "free", "rating": store.get("rating"), "slug": store.get("slug"), "store": store})
    leaderboard.sort(key=lambda r: -r["gmv"])

    rand = prng(days * 7919 + len(orders))
    cart = js_round(len(orders) * (3.1 + rand() * 0.8))
    views = js_round(cart * (6 + rand() * 2))
    sessions = js_round(views * (1.6 + rand() * 0.4))
    funnel = [{"key": k, "rate": (v / sessions) * 100 if sessions else 0, "value": v} for k, v in (("sessions", sessions), ("views", views), ("cart", cart), ("orders", len(orders)))]

    enquiries = [e.data for e in Enquiry.objects.all() if in_range(e.data.get("createdAt"))]
    rfqs_all = [r.data for r in Rfq.objects.all()]
    rfqs = [r for r in rfqs_all if in_range(r.get("createdAt"))]
    all_quotes = [q for r in rfqs_all for q in r.get("quotes") or []]
    quotes = [q for q in all_quotes if in_range(q.get("createdAt"))]
    decided = [q for q in all_quotes if q.get("status") != "submitted"]
    commission = sum(s.get("commissionAmount") or 0 for s in subs)
    ads_rev = 0
    for a in (x.data for x in Ad.objects.all()):
        if not a.get("spend"):
            continue
        a_start = ms(f"{a.get('startsAt')}T00:00:00Z")
        a_end = min(now, ms(f"{a.get('endsAt')}T23:59:59Z"))
        overlap = max(0, min(now, a_end) - max(start, a_start))
        ads_rev += (a["spend"] * overlap) / (a_end - a_start) if a_end > a_start else 0
    memberships = 0
    for s in (x.data for x in Subscription.objects.all()):
        if (s.get("amount") or 0) > 0 and s.get("endsAt"):
            overlap = max(0, min(now, ms(s["endsAt"])) - max(start, ms(s.get("startsAt"))))
            memberships += (s["amount"] * overlap) / max(DAY_MS, ms(s["endsAt"]) - ms(s.get("startsAt")))
    revenue = [{"key": k, "value": js_round(v)} for k, v in (("commission", commission), ("ads", ads_rev), ("memberships", memberships))]
    rev_total = sum(r["value"] for r in revenue)
    return {
        "byCategory": share(cat_items, gmv), "byState": share(state_items, gmv), "funnel": funnel, "leaderboard": leaderboard,
        "leads": {"enquiries": len(enquiries), "quotes": len(quotes), "rfqs": len(rfqs),
                  "winRate": (sum(1 for q in decided if q.get("status") == "accepted") / len(decided)) * 100 if decided else 0,
                  "won": sum(1 for e in enquiries if e.get("status") == "won")},
        "revenue": [{**r, "share": js_round((r["value"] / rev_total) * 100) if rev_total else 0} for r in revenue], "revenueTotal": rev_total,
        "totals": {"aov": gmv / len(orders) if orders else 0, "buyers": len(buyer_emails), "gmv": gmv, "newBuyers": new_buyers, "orders": len(orders), "returningBuyers": len(buyer_emails) - new_buyers},
        "trend": trend,
    }


# ---------- Transactions ----------
def transactions():
    now = now_ms()
    orders = orders_data()
    stores = stores_map()
    rows = []

    def add(r):
        rows.append({**r, "id": f"{r['type']}-{r['reference']}-{len(rows)}"})

    for o in orders:
        buyer = (o.get("buyer") or {}).get("name")
        if o.get("paymentMethod") == "online":
            status = "pending" if o.get("paymentStatus") == "pending_payment" else "reconciled" if now - ms(o.get("createdAt")) > 2 * DAY_MS else "captured"
            add({"amount": o.get("grandTotal"), "date": o.get("createdAt"), "method": "online", "party": buyer, "reference": o.get("number"), "status": status, "type": "payment"})
        else:
            for s in o.get("subOrders") or []:
                if s.get("status") == "delivered":
                    add({"amount": s.get("total"), "date": s.get("deliveredAt") or o.get("createdAt"), "method": "cod", "party": f"{buyer} → {s.get('storeName')}",
                         "reference": s.get("number"), "status": "reconciled" if s.get("settlementId") else "pending", "type": "cod"})
    order_by_number = {o.get("number"): o for o in orders}
    for r in (x.data for x in Refund.objects.all()):
        add({"amount": -(r.get("amount") or 0), "date": r.get("processedAt") or r.get("createdAt"), "method": "online" if r.get("method") == "gateway" else "bank_transfer",
             "party": ((order_by_number.get(r.get("orderNumber")) or {}).get("buyer") or {}).get("name") or "—",
             "reference": f"{r.get('subOrderNumber')} · {r.get('utr')}" if r.get("utr") else r.get("subOrderNumber"),
             "status": "reconciled" if r.get("status") == "processed" else "pending", "type": "refund"})
    sub_by_number = {s.get("number"): s for o in orders for s in o.get("subOrders") or []}
    for s in (x.data for x in Settlement.objects.all()):
        party = (stores.get(s.get("storeSlug")) or {}).get("name") or s.get("storeSlug")
        bd = s.get("breakdown") or {}
        commission = abs(bd["commission"]) if bd.get("commission") is not None else sum((sub_by_number.get(n) or {}).get("commissionAmount") or 0 for n in s.get("subOrderNumbers") or [])
        if commission:
            add({"amount": round2(commission), "date": s.get("createdAt"), "method": "ledger", "party": party, "reference": s.get("number"), "status": "reconciled", "type": "commission"})
        if s.get("status") == "paid":
            add({"amount": -(s.get("net") or 0), "date": s.get("paidAt"), "method": "bank_transfer", "party": party, "reference": f"{s.get('number')} · {s.get('utr')}", "status": "reconciled", "type": "payout"})
        if s.get("status") == "approved":
            add({"amount": -(s.get("net") or 0), "date": s.get("createdAt"), "method": "bank_transfer", "party": party, "reference": s.get("number"), "status": "pending", "type": "payout"})
    for a in (x.data for x in Ad.objects.all()):
        if (a.get("spend") or 0) > 0:
            add({"amount": a["spend"], "date": f"{a.get('startsAt')}T00:00:00.000Z", "method": "ledger" if a.get("advertiserType") == "seller" else "online", "party": a.get("advertiser"),
                 "reference": f"AD-{a.get('id'):04d}", "status": "reconciled" if a.get("settlementId") or a.get("advertiserType") != "seller" else "captured", "type": "ad"})
    for s in (x.data for x in Subscription.objects.all()):
        if (s.get("amount") or 0) > 0:
            add({"amount": s["amount"], "date": s.get("startsAt"), "method": "online", "party": (stores.get(s.get("storeSlug")) or {}).get("name") or s.get("storeSlug"),
                 "reference": s.get("invoiceNumber") or f"MEM-{s.get('id')}", "status": "reconciled" if now - ms(s.get("startsAt")) > 2 * DAY_MS else "captured", "type": "membership"})
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    online = [o for o in orders if o.get("paymentMethod") == "online"]
    unmatched = [o for o in online if o.get("paymentStatus") == "pending_payment"]
    return {
        "reconciliation": {"capturedAmount": sum(o.get("grandTotal") or 0 for o in online if o.get("paymentStatus") != "pending_payment"),
                           "matched": len(online) - len(unmatched), "onlineOrders": len(online), "unmatched": [{"amount": o.get("grandTotal"), "number": o.get("number")} for o in unmatched]},
        "rows": rows,
    }


# ---------- Tax centre ----------
def tax_centre(month=None):
    p = get_platform()
    orders = orders_data()
    stores = stores_map()
    months = sorted({(o.get("createdAt") or "")[:7] for o in orders}, reverse=True)
    m = month if month and month in months else (months[0] if months else None)
    subs = [s for s in subs_of(orders) if (s["createdAt"] or "")[:7] == m]
    gst_rate = p.get("commissionGstRate") or 0

    def state_of(slug):
        return (stores.get(slug) or {}).get("gstStateCode")

    def fee_row(stream, items):
        out = {"cgst": 0, "igst": 0, "sgst": 0, "stream": stream, "taxable": 0}
        for amount, state_code in items:
            tax = amount * gst_rate / 100
            out["taxable"] += amount
            if state_code == PLATFORM_STATE:
                out["cgst"] += tax / 2
                out["sgst"] += tax / 2
            else:
                out["igst"] += tax
        return {k: round2(v) if isinstance(v, (int, float)) else v for k, v in out.items()}

    ads = [a.data for a in Ad.objects.all()]
    subscriptions = [s.data for s in Subscription.objects.all()]
    platform_gst = [
        fee_row("commission", [(s.get("commissionAmount") or 0, state_of(s.get("storeSlug"))) for s in subs]),
        fee_row("ads", [(a["spend"], state_of(a.get("storeSlug")) if a.get("storeSlug") else None) for a in ads
                        if (a.get("spend") or 0) > 0 and (a.get("startsAt") or "")[:7] == m and a.get("advertiserType") != "house"]),
        fee_row("memberships", [(s["amount"], state_of(s.get("storeSlug"))) for s in subscriptions if (s.get("amount") or 0) > 0 and (s.get("startsAt") or "")[:7] == m]),
    ]
    refunds = [r.data for r in Refund.objects.filter(status="processed") if (r.data.get("processedAt") or r.data.get("createdAt") or "")[:7] == m]
    sub_by_number = {s.get("number"): s for o in orders for s in o.get("subOrders") or []}

    def interstate(s):
        return s["interstate"] if s.get("interstate") is not None else ((s.get("tax") or {}).get("igst") or 0) > 0

    sellers = []
    for store in stores.values():
        own = [s for s in subs if s.get("storeSlug") == store.get("slug")]
        gross = sum(s["tax"]["taxable"] for s in own)
        gross_inter = sum(s["tax"]["taxable"] for s in own if interstate(s))
        returns = returns_inter = 0
        for r in refunds:
            if r.get("storeSlug") != store.get("slug"):
                continue
            sub = sub_by_number.get(r.get("subOrderNumber"))
            if not sub or not sub.get("total"):
                continue
            taxable = (r["amount"] * sub["tax"]["taxable"]) / sub["total"]
            returns += taxable
            if interstate(sub):
                returns_inter += taxable
        net = gross - returns
        net_inter = gross_inter - returns_inter
        net_intra = net - net_inter
        gross_sales = sum(s.get("subtotal") or 0 for s in own)
        tcs_igst = max(0, net_inter) * p.get("tcsRate", 0) / 100
        tcs_half = max(0, net_intra) * p.get("tcsRate", 0) / 200
        pan_src = str(store.get("pan") or store.get("gstin") or "")
        row = {
            "gross": round2(gross), "grossSales": round2(gross_sales), "gstin": store.get("gstin"), "name": store.get("name"), "net": round2(net), "orders": len(own),
            "pan": pan_src[0:10] if store.get("pan") else pan_src[2:12], "returns": round2(returns), "slug": store.get("slug"), "state": store.get("state"),
            "tcsCgst": round2(tcs_half), "tcsIgst": round2(tcs_igst), "tcsSgst": round2(tcs_half), "tcsTotal": round2(tcs_igst + 2 * tcs_half), "tds": round2(gross_sales * p.get("tdsRate", 0) / 100),
        }
        if row["orders"] > 0 or row["returns"] > 0:
            sellers.append(row)
    sellers.sort(key=lambda r: -r["gross"])
    return {"month": m, "months": months, "platform": {"address": p.get("address"), "commissionGstRate": gst_rate, "gstin": p.get("gstin"), "legalName": p.get("legalName"),
                                                     "tcsRate": p.get("tcsRate"), "tdsRate": p.get("tdsRate")}, "platformGst": platform_gst, "sellers": sellers}


# ---------- Growth summary ----------
def growth_summary():
    now = now_ms()
    open_tickets = [t.data for t in Ticket.objects.filter(status__in=["open", "in_progress"])]
    pending_slugs = set(KycDocument.objects.filter(status="pending").values_list("store_slug", flat=True))
    return {
        "arr": sum(s.data.get("amount") or 0 for s in Subscription.objects.filter(status="active") if (s.data.get("amount") or 0) > 0),
        "leadsToday": sum(1 for e in Enquiry.objects.all() if now - ms(e.data.get("createdAt")) < DAY_MS),
        "openRfqs": Rfq.objects.filter(status="open").count(),
        "openTickets": len(open_tickets),
        "overdueTickets": sum(1 for t in open_tickets if ms(t.get("slaDueAt")) < now),
        "pendingKyc": Store.objects.exclude(status="rejected").filter(slug__in=pending_slugs).count(),
    }
