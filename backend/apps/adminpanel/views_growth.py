"""Admin growth API — port of frontend src/api/adminGrowthApi.js: leads & RFQs, product requests, KYC, membership
plans, support desk, CMS / announcement / homepage sections, broadcasts, staff & roles, risk flags, analytics,
transactions and the tax centre. Admin JWT required; every write audit-logged with the admin's name."""
import re
from datetime import datetime, timezone

from rest_framework.response import Response

from apps.catalog.models import Store
from apps.core.errors import ApiError
from apps.core.services import atomic, audit, get_platform, get_singleton, notify, now_iso, save_platform, send_email, set_singleton
from apps.market.models import AdminStaff, Broadcast, CmsPage, Enquiry, KycDocument, Plan, Rfq, Subscription, Thread, Ticket
from apps.market.services import dispatch_rfq, recompute_kyc, refresh_badges
from apps.orders.pricing import DAY_MS, INDIAN_STATES, ms_to_iso, now_ms

from . import services as svc
from .views import actor, admin_api, body, get_or_404

HOUR = svc.HOUR
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SAFE_LINK = re.compile(r"^/(?!/)|^https://")
ADMIN_ROLES = ["super_admin", "operations", "finance", "catalogue", "support"]
STATE_BY_CODE = {code: name for name, code in INDIAN_STATES.items()}


def store_name(slug):
    s = Store.objects.filter(slug=slug).first()
    return s.data.get("name") if s else slug


# ---------- Growth summary ----------
@admin_api("GET")
def growth_summary(request):
    return svc.growth_summary()


# ---------- Leads & RFQs ----------
@admin_api("GET")
def leads(request):
    return svc.leads()


@admin_api("GET")
def thread_detail(request, pk):
    t = get_or_404(Thread.objects.filter(pk=pk), "Conversation not found.")
    return {**t.data, "storeName": store_name(t.data.get("storeSlug"))}


@admin_api("POST")
def enquiry_spam(request, pk, action):
    if action not in ("spam", "restore"):
        raise ApiError("Unknown action.")
    spam = action == "spam"
    with atomic():
        row = get_or_404(Enquiry.objects.select_for_update().filter(pk=pk), "Enquiry not found.")
        e = row.data
        if spam:
            e["prevStatus"] = e.get("prevStatus") if e.get("status") == "spam" else e.get("status")
            e["status"] = "spam"
        else:
            e["status"] = e["prevStatus"] if e.get("prevStatus") and e.get("prevStatus") != "spam" else "new"
            e["prevStatus"] = None
        e["updatedAt"] = now_iso()
        row.save()
        audit("enquiry.spam" if spam else "enquiry.restored", f"Enquiry #{pk}", f"{(e.get('buyer') or {}).get('name')} → {store_name(e.get('storeSlug'))}", actor(request))
    return e


@admin_api("POST")
def enquiry_reassign(request, pk):
    slug = body(request).get("storeSlug")
    who = actor(request)
    with atomic():
        row = get_or_404(Enquiry.objects.select_for_update().filter(pk=pk), "Enquiry not found.")
        e = row.data
        to = get_or_404(Store.objects.filter(slug=slug), "Store not found.").data
        if to.get("status") != "approved":
            raise ApiError("Choose an active store.")
        if e.get("storeSlug") == slug:
            raise ApiError("The enquiry is already with this store.")
        from_store = Store.objects.filter(slug=e.get("storeSlug")).first()
        from_name = from_store.data.get("name") if from_store else None
        at = now_iso()
        e.update({"assignedTo": None, "status": "new", "storeSlug": slug, "updatedAt": at})
        e["notes"] = [*(e.get("notes") or []), {"at": at, "author": who, "text": f"Reassigned by Kartiva from {from_name or 'another store'}."}]
        row.save()
        thread = Thread.objects.select_for_update().filter(pk=e.get("threadId")).first() if e.get("threadId") else None
        if thread:
            thread.data["storeSlug"] = slug
            thread.data.setdefault("unread", {"buyer": 0, "seller": 0})["seller"] = len(thread.data.get("messages") or [])
            thread.save()
        notify({"role": "seller", "storeSlug": slug}, "New enquiry (assigned by Kartiva)", f"{(e.get('buyer') or {}).get('name')}: {(e.get('message') or '')[:100]}", "/seller/leads")
        audit("enquiry.reassigned", f"Enquiry #{pk}", f"{from_name or '—'} → {to.get('name')}", who)
    return e


@admin_api("PATCH")
def rfq_update(request, pk):
    patch = body(request)
    who = actor(request)
    with atomic():
        row = get_or_404(Rfq.objects.select_for_update().filter(pk=pk), "Buy request not found.")
        rfq = row.data
        if patch.get("status") == "closed":
            if rfq.get("status") != "open":
                raise ApiError("Only open buy requests can be closed.", 409)
            rfq.update({"closedAt": now_iso(), "status": "closed"})
            notify({"email": (rfq.get("buyer") or {}).get("email"), "role": "buyer"}, "Buy request closed", f"“{rfq.get('title')}” was closed by Kartiva.", "/account/enquiries")
            audit("rfq.closed", f"RFQ #{pk}", rfq.get("title"), who)
        if "featured" in patch:
            rfq["featured"] = bool(patch["featured"])
            audit("rfq.featured" if rfq["featured"] else "rfq.unfeatured", f"RFQ #{pk}", rfq.get("title"), who)
        row.save()
    return rfq


@admin_api("POST")
def rfq_notify_sellers(request, pk):
    who = actor(request)
    with atomic():
        row = get_or_404(Rfq.objects.select_for_update().filter(pk=pk), "Buy request not found.")
        slugs = svc.matching_seller_slugs(row.data)
        dispatch_rfq(row, slugs, by=who or "Kartiva")
        row.data["notifiedAt"] = now_iso()
        row.save()
        audit("rfq.sellers_notified", f"RFQ #{pk}", f"{row.data.get('title')} → {len(slugs)} sellers", who)
    return {"count": len(slugs)}


# ---------- Product requests ----------
@admin_api("GET")
def product_requests(request):
    return svc.product_requests()


@admin_api("POST")
def forward_rfq(request, pk):
    data = body(request)
    slugs = data.get("storeSlugs") if isinstance(data.get("storeSlugs"), list) else []
    note = str(data.get("note") or "").strip()[:300]
    who = actor(request)
    with atomic():
        row = get_or_404(Rfq.objects.select_for_update().filter(pk=pk), "Product request not found.")
        rfq = row.data
        if rfq.get("status") != "open":
            raise ApiError("Only open requests can be forwarded.", 409)
        if not slugs:
            raise ApiError("Choose at least one seller.")
        sent = dispatch_rfq(row, [str(s) for s in slugs], by=who or "Kartiva", note=note)
        audit("rfq.forwarded", f"RFQ #{pk}", f"{rfq.get('title')} → {', '.join(store_name(s) for s in sent)}", who)
        n = len(sent)
        notify({"email": (rfq.get("buyer") or {}).get("email"), "role": "buyer"}, "More suppliers contacted",
               f"Kartiva sent “{rfq.get('title')}” to {n} more supplier{'' if n == 1 else 's'}. Quotes will appear in My enquiries & quotes.", "/account/enquiries")
    return {"count": n}


# ---------- KYC ----------
@admin_api("GET")
def kyc_queue(request):
    return svc.kyc_queue()


@admin_api("POST")
def kyc_review(request, pk, decision):
    if decision not in ("verified", "rejected"):
        raise ApiError("Unknown decision.")
    note = str(body(request).get("note") or "").strip()
    if decision == "rejected" and not note:
        raise ApiError("Give the seller a reason.")
    who = actor(request)
    with atomic():
        row = get_or_404(KycDocument.objects.select_for_update().filter(pk=pk), "Document not found.")
        doc = row.data
        doc.update({"note": note if decision == "rejected" else "", "reviewedAt": now_iso(), "reviewedBy": who, "status": decision})
        row.save()
        store_row = recompute_kyc(doc.get("storeSlug"))
        if not store_row:
            raise ApiError("Store not found.", 404)
        store = store_row.data
        label = str(doc.get("type") or "").replace("_", " ")
        notify({"role": "seller", "storeSlug": doc.get("storeSlug")}, "KYC document verified" if decision == "verified" else "KYC document rejected",
               f"Your {label} was verified. KYC status: {str(store.get('kycStatus')).replace('_', ' ')}." if decision == "verified" else f"Your {label} was rejected — {note}", "/seller/business")
        audit(f"kyc.{decision}", store.get("name"), f"{label} ({doc.get('fileName')}){f' — {note}' if decision == 'rejected' else ''}", who)
    return store


@admin_api("POST")
def store_trusted(request, slug):
    on = bool(body(request).get("trusted"))
    with atomic():
        row = get_or_404(Store.objects.select_for_update().filter(slug=slug), "Store not found.")
        store = row.data
        store["trustedManual"] = on
        others = [b for b in store.get("badges") or [] if b != "trusted"]
        store["badges"] = [*others, "trusted"] if on else others
        row.save()
        if on:
            notify({"role": "seller", "storeSlug": slug}, "Trusted Seller badge awarded", "Kartiva added the Trusted Seller badge to your store.", "/seller/business")
        audit("store.trusted_added" if on else "store.trusted_removed", store.get("name"), "Trusted Seller badge added manually" if on else "Trusted Seller badge removed", actor(request))
    return store


@admin_api("POST")
def store_verify_gstin(request, slug):
    """Simulated GST portal lookup: format + state code must match the store's registered state."""
    with atomic():
        row = get_or_404(Store.objects.select_for_update().filter(slug=slug), "Store not found.")
        store = row.data
        gstin = str(store.get("gstin") or "").upper()
        state_code = INDIAN_STATES.get(store.get("state"))
        format_ok = bool(svc.GSTIN_RE.match(gstin))
        state_ok = bool(state_code) and gstin[:2] == state_code
        valid = format_ok and state_ok
        seed = sum(ord(c) for c in gstin)
        name = str(store.get("name") or "")
        registered = None
        if valid:
            year = min(2025, max(2017, store.get("yearEstablished") or 2017))
            registered = ms_to_iso(int(datetime(year, seed % 12 + 1, (seed % 27) + 1, tzinfo=timezone.utc).timestamp() * 1000))
        response = {
            "checkedAt": now_iso(), "formatOk": format_ok, "gstin": gstin,
            "legalName": f"{name.upper()}{'' if re.search(r'pvt|ltd|llp', name, re.I) else ' (PROPRIETORSHIP)'}" if valid else None,
            "pan": gstin[2:12], "registeredOn": registered, "stateCode": gstin[:2], "stateName": STATE_BY_CODE.get(gstin[:2]), "stateOk": state_ok,
            "status": "Active" if valid else "Not found", "storeState": store.get("state"), "taxpayerType": "Regular", "valid": valid,
        }
        store["gstVerified"] = valid
        store["gstCheck"] = response
        refresh_badges(store)
        row.save()
        if valid:
            notify({"role": "seller", "storeSlug": slug}, "GSTIN verified", f"GSTIN {gstin} was verified with the GST portal.", "/seller/business")
        audit("store.gst_verified" if valid else "store.gst_failed", store.get("name"),
              f"{gstin} — {'Active' if valid else 'state code mismatch' if format_ok else 'invalid format'}", actor(request))
    return response


# ---------- Membership plans ----------
@admin_api("GET")
def plans(request):
    return svc.plans_overview()


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def _clean_num(n):
    return int(n) if float(n).is_integer() else n


@admin_api("PATCH")
def plan_detail(request, pk):
    plan = body(request)
    with atomic():
        row = get_or_404(Plan.objects.select_for_update().filter(pk=pk), "Plan not found.")
        existing = row.data
        price = _float(plan.get("priceYearly"))
        discount = _float(plan.get("commissionDiscount"))
        if not (price >= 0) or not (0 <= discount <= 10):
            raise ApiError("Check the price and commission discount.")
        credits = None if plan.get("leadCredits") in ("", None) else _float(plan.get("leadCredits"))
        if credits is not None and not (credits >= 0):
            raise ApiError("Lead credits must be 0 or more.")
        if existing.get("code") == "free" and price > 0:
            raise ApiError("The Starter plan must stay free.")
        name = str(plan.get("name") or "").strip()
        if not name:
            raise ApiError("Give the plan a name.")
        features = plan.get("features") if isinstance(plan.get("features"), list) else []
        existing.update({
            "commissionDiscount": _clean_num(discount), "features": [str(f).strip() for f in features if str(f).strip()],
            "isActive": True if existing.get("code") == "free" else plan.get("isActive") is not False,
            "leadCredits": None if credits is None else _clean_num(credits), "name": name, "priceYearly": _clean_num(price),
        })
        row.save()
        audit("plan.updated", f"Plan {existing.get('code')}",
              f"{name} · ₹{_clean_num(price)}/yr · {'unlimited' if credits is None else _clean_num(credits)} credits · {_clean_num(discount)}% off commission", actor(request))
    return existing


@admin_api("POST")
def grant_plan(request):
    data = body(request)
    slug, code = data.get("storeSlug"), data.get("planCode")
    who = actor(request)
    with atomic():
        store_row = get_or_404(Store.objects.select_for_update().filter(slug=slug), "Store not found.")
        store = store_row.data
        plan_row = Plan.objects.filter(code=code).exclude(code="free").first()
        if not plan_row:
            raise ApiError("Choose a paid plan.")
        plan = plan_row.data
        span = _float(data.get("months"))
        if not (1 <= span <= 36):
            raise ApiError("Duration must be 1–36 months.")
        span = _clean_num(span)
        now = now_ms()
        subs = list(Subscription.objects.select_for_update().filter(store_slug=slug, status="active"))
        current = next((s for s in subs if s.data.get("planCode") == code and s.data.get("endsAt")), None)
        if current:
            start = max(now, svc.ms(current.data["endsAt"]))
            current.update(endsAt=ms_to_iso(start + span * 30 * DAY_MS))
            audit("subscription.extended", store.get("name"), f"{plan.get('name')} extended by {span} months (complimentary)", who)
        else:
            for s in subs:
                s.update(status="replaced")
            Subscription.create({"amount": 0, "complimentary": True, "endsAt": ms_to_iso(now + span * 30 * DAY_MS), "grantedBy": who, "invoiceNumber": None,
                                 "leadCreditsUsed": 0, "planCode": code, "startsAt": now_iso(), "status": "active", "storeSlug": slug})
            audit("subscription.granted", store.get("name"), f"{plan.get('name')} for {span} months (complimentary)", who)
        store["plan"] = code
        refresh_badges(store)
        store_row.save()
        notify({"role": "seller", "storeSlug": slug}, f"{plan.get('name')} activated", f"Kartiva has given your store {plan.get('name')} for {span} months at no charge.", "/seller/plan")
    return store


@admin_api("POST")
def cancel_subscription(request, pk):
    with atomic():
        row = get_or_404(Subscription.objects.select_for_update().filter(pk=pk), "Subscription not found.")
        sub = row.data
        if sub.get("status") != "active" or sub.get("planCode") == "free":
            raise ApiError("Only active paid plans can be cancelled.", 409)
        sub.update({"cancelledAt": now_iso(), "status": "cancelled"})
        row.save()
        store_row = Store.objects.select_for_update().filter(slug=sub.get("storeSlug")).first()
        if store_row:
            store = store_row.data
            store["plan"] = "free"
            refresh_badges(store)
            if store.get("trustedManual") and "trusted" not in store["badges"]:
                store["badges"].append("trusted")
            store_row.save()
            notify({"role": "seller", "storeSlug": store_row.slug}, "Membership cancelled", "Your store is now on the free Starter plan.", "/seller/plan")
        audit("subscription.cancelled", store_row.data.get("name") if store_row else sub.get("storeSlug"), f"Plan {sub.get('planCode')} cancelled", actor(request))
    return sub


# ---------- Support desk ----------
@admin_api("GET")
def tickets(request):
    return svc.tickets_overview()


def notify_requester(ticket, title, text):
    by = ticket.get("raisedBy") or {}
    if by.get("role") == "seller":
        notify({"role": "seller", "storeSlug": by.get("storeSlug")}, title, text, "/seller/support")
    else:
        notify({"email": by.get("email"), "role": "buyer"}, title, text, "/account/support")


def next_ticket_message_id():
    return max((m.get("id") or 0 for t in Ticket.objects.all() for m in t.data.get("messages") or []), default=0) + 1


@admin_api("POST")
def ticket_reply(request, pk):
    text = str(body(request).get("body") or "").strip()
    if not text:
        raise ApiError("Write a reply first.")
    who = actor(request)
    with atomic():
        row = get_or_404(Ticket.objects.select_for_update().filter(pk=pk), "Ticket not found.")
        t = row.data
        at = now_iso()
        t.setdefault("messages", []).append({"at": at, "author": who, "body": text[:5000], "from": "admin", "id": next_ticket_message_id()})
        if t.get("status") == "open":
            t["status"] = "in_progress"
        t["assignee"] = t.get("assignee") or who
        t["updatedAt"] = at
        row.save()
        notify_requester(t, f"Kartiva replied to {t.get('number')}", text[:120])
        audit("ticket.replied", t.get("number"), t.get("subject"), who)
    return t


@admin_api("PATCH")
def ticket_update(request, pk):
    patch = body(request)
    with atomic():
        row = get_or_404(Ticket.objects.select_for_update().filter(pk=pk), "Ticket not found.")
        t = row.data
        changes = []
        if patch.get("status") and patch["status"] != t.get("status"):
            if patch["status"] not in ("open", "in_progress", "resolved", "closed"):
                raise ApiError("Unknown status.")
            changes.append(f"status {t.get('status')} → {patch['status']}")
            t["status"] = patch["status"]
            if t["status"] in ("resolved", "closed"):
                notify_requester(t, f"{t.get('number')} {t['status']}", f"Your ticket “{t.get('subject')}” was marked {t['status']}.")
        if patch.get("priority") and patch["priority"] != t.get("priority"):
            if patch["priority"] not in svc.SLA_HOURS:
                raise ApiError("Unknown priority.")
            changes.append(f"priority {t.get('priority')} → {patch['priority']}")
            t["priority"] = patch["priority"]
            t["slaDueAt"] = ms_to_iso(svc.ms(t.get("createdAt")) + svc.SLA_HOURS[t["priority"]] * HOUR)
        if "assignee" in patch and patch["assignee"] != t.get("assignee"):
            assignee = str(patch["assignee"] or "").strip() or None
            if assignee and not any(s.data.get("name") == assignee for s in AdminStaff.objects.all()):
                raise ApiError("Choose a team member.")
            changes.append(f"assignee → {assignee or 'unassigned'}")
            t["assignee"] = assignee
        if not changes:
            return t
        t["updatedAt"] = now_iso()
        row.save()
        audit("ticket.updated", t.get("number"), ", ".join(changes), actor(request))
    return t


@admin_api("POST")
def ticket_note(request, pk):
    text = str(body(request).get("text") or "").strip()
    if not text:
        raise ApiError("Write a note first.")
    who = actor(request)
    with atomic():
        row = get_or_404(Ticket.objects.select_for_update().filter(pk=pk), "Ticket not found.")
        t = row.data
        t["internalNotes"] = [*(t.get("internalNotes") or []), {"at": now_iso(), "author": who, "text": text[:5000]}]
        row.save()
        audit("ticket.note", t.get("number"), "Internal note added", who)
    return t


# ---------- Content ----------
@admin_api("GET")
def content(request):
    return {"announcement": get_singleton("announcement"), "homeSections": {**svc.DEFAULT_HOME_SECTIONS, **(get_platform().get("homeSections") or {})},
            "pages": [p.data for p in CmsPage.objects.all()]}


def save_page(request, pk):
    page = body(request)
    title = str(page.get("title") or "").strip()
    slug = str(page.get("slug") or "").strip()
    if not title:
        raise ApiError("Add a title.")
    if not SLUG_RE.match(slug):
        raise ApiError("Slug must be lowercase words joined by hyphens (e.g. seller-policy).")
    who = actor(request)
    with atomic():
        if CmsPage.objects.filter(slug=slug).exclude(pk=pk).exists():
            raise ApiError("Another page already uses this slug.", 409)
        fields = {"body": str(page.get("body") or "")[:100000], "published": bool(page.get("published")), "slug": slug, "title": title[:200], "updatedAt": now_iso(), "updatedBy": who}
        if pk:
            row = get_or_404(CmsPage.objects.select_for_update().filter(pk=pk), "Page not found.")
            row.update(**fields)
        else:
            row = CmsPage.create(fields)
        audit("page.updated" if pk else "page.created", f"Page /{slug}", f"{title}{' (published)' if fields['published'] else ' (draft)'}", who)
    return row.data


@admin_api("POST")
def pages(request):
    return Response(save_page(request, None), status=201)


@admin_api("PATCH")
def page_detail(request, pk):
    return save_page(request, pk)


@admin_api("POST")
def page_publish(request, pk):
    published = bool(body(request).get("published"))
    with atomic():
        row = get_or_404(CmsPage.objects.select_for_update().filter(pk=pk), "Page not found.")
        row.update(published=published, updatedAt=now_iso())
        audit("page.published" if published else "page.unpublished", f"Page /{row.data.get('slug')}", row.data.get("title"), actor(request))
    return row.data


@admin_api("PUT")
def announcement(request):
    value = body(request)
    text = str(value.get("text") or "").strip()[:300]
    link = str(value.get("link") or "").strip()
    if value.get("active") and not text:
        raise ApiError("Add the announcement text.")
    if link and not SAFE_LINK.search(link):
        raise ApiError("Link must be an internal path (/...) or an https:// URL.")
    data = {**get_singleton("announcement"), "active": bool(value.get("active")), "link": link or None, "text": text}
    set_singleton("announcement", data)
    audit("announcement.updated", "Announcement bar", f"{'On' if data['active'] else 'Off'} · {text[:80]}", actor(request))
    return data


@admin_api("PUT")
def home_sections(request):
    sections = body(request)
    with atomic():
        p = get_platform()
        p["homeSections"] = {**svc.DEFAULT_HOME_SECTIONS, **(p.get("homeSections") or {}), **{k: sections.get(k) is not False for k in svc.DEFAULT_HOME_SECTIONS}}
        save_platform(p)
        audit("home.sections", "Homepage", ", ".join(f"{k}: {'on' if v else 'off'}" for k, v in p["homeSections"].items()), actor(request))
    return p["homeSections"]


# ---------- Broadcasts ----------
AUDIENCES = {"sellers", "buyers", "everyone", "store", "plan"}
CHANNELS = {"in_app", "email"}


@admin_api("GET", "POST")
def broadcasts(request):
    if request.method == "GET":
        return svc.broadcast_data()
    values = body(request)
    audience, plan_code, slug = values.get("audience"), values.get("planCode"), values.get("storeSlug")
    title = str(values.get("title") or "").strip()[:200]
    text = str(values.get("body") or "").strip()[:5000]
    channels = [c for c in (values.get("channels") or []) if c in CHANNELS] if isinstance(values.get("channels"), list) else []
    if not title or not text:
        raise ApiError("Add a title and a message.")
    if not channels:
        raise ApiError("Choose at least one channel.")
    if audience not in AUDIENCES:
        raise ApiError("Choose an audience.")
    size = svc.audience_size(audience, plan_code, slug)
    if not size["recipients"]:
        raise ApiError("This audience has no recipients.")
    link = str(values.get("link") or "").strip() or None
    if link and not SAFE_LINK.search(link):
        raise ApiError("Link must be an internal path (/...) or an https:// URL.")
    who = actor(request)
    with atomic():
        if "in_app" in channels:
            if audience == "sellers":
                notify({"role": "seller"}, title, text, link)
            if audience == "buyers":
                notify({"role": "buyer"}, title, text, link)
            if audience == "everyone":
                notify({"role": "all"}, title, text, link)
            if audience == "store":
                notify({"role": "seller", "storeSlug": slug}, title, text, link)
            if audience == "plan":
                for s in Store.objects.filter(status="approved"):
                    if (s.data.get("plan") or "free") == plan_code:
                        notify({"role": "seller", "storeSlug": s.slug}, title, text, link)
        entry = {"audience": audience, "audienceLabel": size["label"], "body": text, "channels": channels, "recipients": size["recipients"], "sentAt": now_iso(), "sentBy": who, "title": title}
        if audience == "plan":
            entry["planCode"] = plan_code
        if audience == "store":
            entry["storeSlug"] = slug
        row = Broadcast.create(entry)
        audit("broadcast.sent", f"Broadcast #{row.pk}", f"{title} → {size['label']} via {' + '.join(channels)}", who)
        if "email" in channels:
            # One outbox entry per broadcast; the mailing-list alias stands in for the expanded recipient list.
            store = Store.objects.filter(slug=slug).first() if audience == "store" else None
            alias = (store.data.get("ownerEmail") if store else None) or \
                f"{f'{plan_code}-sellers' if audience == 'plan' else slug if audience == 'store' else f'all-{audience}'}@lists.kartiva.in"
            subject = f"[{size['label']}] {title}"
            send_email([alias], subject, f"{text}\n\n— Sent to {size['label']}", sent_by=who)
            audit("email.sent", alias, subject, who)
    return Response(row.data, status=201)


# ---------- Staff ----------
def staff_list():
    return [s.data for s in AdminStaff.objects.all()]


@admin_api("GET", "POST")
def staff(request):
    if request.method == "GET":
        return staff_list()
    data = body(request)
    email = str(data.get("email") or "").strip().lower()
    name = str(data.get("name") or "").strip()
    role = data.get("role")
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        raise ApiError("Enter a valid email address.")
    if not name:
        raise ApiError("Enter the team member's name.")
    if role not in ADMIN_ROLES:
        raise ApiError("Choose a role.")
    who = actor(request)
    with atomic():
        if any(s.data.get("email") == email for s in AdminStaff.objects.select_for_update().all()):
            raise ApiError("This email is already on the team.", 409)
        row = AdminStaff.create({"email": email, "invitedAt": now_iso(), "invitedBy": who, "lastActiveAt": None, "name": name[:120], "role": role, "status": "invited", "twoFactor": False})
        audit("staff.invited", email, f"{name} invited as {role}", who)
    return Response(row.data, status=201)


@admin_api("PATCH", "DELETE")
def staff_detail(request, pk):
    who = actor(request)
    with atomic():
        members = list(AdminStaff.objects.select_for_update().all())
        member = next((m for m in members if m.pk == pk), None)
        if not member:
            raise ApiError("Team member not found.", 404)
        m = member.data
        if request.method == "DELETE":
            if m.get("email") == request.user.email:
                raise ApiError("You can't remove yourself.", 409)
            if m.get("role") == "super_admin" and sum(1 for x in members if x.data.get("role") == "super_admin") <= 1:
                raise ApiError("Keep at least one super admin.", 409)
            member.delete()
            audit("staff.removed", m.get("email"), m.get("name"), who)
            return pk
        patch = body(request)
        supers = [x for x in members if x.data.get("role") == "super_admin" and x.data.get("status") == "active"]
        last_super = m.get("role") == "super_admin" and len(supers) <= 1 and m.get("status") == "active"
        if patch.get("role") and patch["role"] != m.get("role"):
            if patch["role"] not in ADMIN_ROLES:
                raise ApiError("Unknown role.")
            if last_super:
                raise ApiError("Keep at least one active super admin.", 409)
            audit("staff.role", m.get("email"), f"{m.get('role')} → {patch['role']}", who)
            m["role"] = patch["role"]
        if patch.get("status") and patch["status"] != m.get("status"):
            if patch["status"] not in ("active", "disabled", "invited"):
                raise ApiError("Unknown status.")
            if patch["status"] == "disabled" and last_super:
                raise ApiError("Keep at least one active super admin.", 409)
            if patch["status"] == "disabled" and (m.get("name") == who or m.get("email") == request.user.email):
                raise ApiError("You can't disable your own account.", 409)
            audit("staff.disabled" if patch["status"] == "disabled" else "staff.enabled", m.get("email"), m.get("name"), who)
            m["status"] = patch["status"]
        member.save()
    return m


# ---------- Risk ----------
@admin_api("GET")
def risk(request):
    return svc.risk_flags()


@admin_api("POST")
def risk_dismiss(request):
    key = str(body(request).get("key") or "").strip()[:200]
    if not key:
        raise ApiError("Choose a flag.")
    with atomic():
        p = get_platform()
        lst = p.setdefault("dismissedRiskFlags", [])
        if key not in lst:
            lst.append(key)
        save_platform(p)
        audit("risk.dismissed", "Risk flag", key, actor(request))
    return key


@admin_api("POST")
def risk_restore(request):
    with atomic():
        p = get_platform()
        n = len(p.get("dismissedRiskFlags") or [])
        p["dismissedRiskFlags"] = []
        save_platform(p)
        audit("risk.restored", "Risk flags", f"{n} dismissed flags restored", actor(request))
    return n


# ---------- Analytics, transactions, tax ----------
@admin_api("GET")
def analytics(request):
    try:
        days = int(request.query_params.get("days") or 30)
    except ValueError:
        days = 30
    return svc.analytics(max(1, min(days, 365)))


@admin_api("GET")
def transactions(request):
    return svc.transactions()


@admin_api("GET")
def tax(request):
    return svc.tax_centre(request.query_params.get("month") or None)

