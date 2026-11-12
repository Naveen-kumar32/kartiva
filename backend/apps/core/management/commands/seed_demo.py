"""Load the demo dataset (exported from the frontend's sample data) into PostgreSQL.

    python manage.py seed_demo            # load into an empty database
    python manage.py seed_demo --reset    # wipe all Kartiva data first (= "Reset demo data")
"""
import json
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand
from django.core.management.color import no_style
from django.db import connection, transaction

from apps.accounts.models import LoginAttempt, PasswordResetToken, SeenMarker, User
from apps.core.models import Singleton

# collection in demo_data.json → model label
COLLECTIONS = {
    "adSlots": "marketing.AdSlot", "ads": "marketing.Ad", "adRequests": "marketing.AdRequest",
    "applications": "orders.SellerApplication", "categories": "catalog.Category", "products": "catalog.Product", "stores": "catalog.Store",
    "stockMovements": "catalog.StockMovement", "auditLog": "core.AuditLog", "buyers": "orders.Buyer", "commissionRules": "orders.CommissionRule",
    "orders": "orders.Order", "refunds": "orders.Refund", "returns": "orders.Return", "settlements": "orders.Settlement",
    "outbox": "core.EmailOutbox", "smsOutbox": "core.SmsOutbox", "notifications": "core.Notification",
    "adminStaff": "market.AdminStaff", "broadcasts": "market.Broadcast", "cmsPages": "market.CmsPage", "enquiries": "market.Enquiry",
    "kycDocuments": "market.KycDocument", "plans": "market.Plan", "rfqs": "market.Rfq", "sellerStaff": "market.SellerStaff",
    "subscriptions": "market.Subscription", "threads": "market.Thread", "tickets": "market.Ticket",
}
EXTRA_MODELS = ["catalog.Review", "market.Wishlist", "market.SellerHub", "core.IdempotencyKey", "core.Singleton"]


class Command(BaseCommand):
    help = "Load the Kartiva demo dataset into the database."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing Kartiva data first.")
        parser.add_argument("--file", default=str(Path(settings.BASE_DIR) / "fixtures" / "demo_data.json"))

    @transaction.atomic
    def handle(self, *args, **opts):
        data = json.loads(Path(opts["file"]).read_text())
        all_models = [apps.get_model(lbl) for lbl in {*COLLECTIONS.values(), *EXTRA_MODELS}]
        if opts["reset"]:
            for m in all_models:
                m.objects.all().delete()
            for m in (SeenMarker, PasswordResetToken, LoginAttempt):
                m.objects.all().delete()
            User.objects.all().delete()
        elif User.objects.exists():
            self.stdout.write(self.style.WARNING("Database already has data — use --reset to reload the demo."))
            return

        counts = {}
        for key, label in COLLECTIONS.items():
            model = apps.get_model(label)
            rows = data.get(key) or []
            for i, row in enumerate(rows, start=1):
                row = dict(row)
                row.setdefault("id", i)
                obj = model(pk=row["id"], data=row)
                obj.save()
            counts[key] = len(rows)

        Review = apps.get_model("catalog.Review")
        hidden = set(map(str, data.get("hiddenReviews") or []))
        n = 0
        for pid, reviews in (data.get("reviewsByProduct") or {}).items():
            for r in reviews:
                n += 1
                Review(pk=n, data={**r, "hidden": str(r.get("id")) in hidden, "id": n, "productId": int(pid), "reviewKey": r.get("id")}).save()
        counts["reviews"] = n

        Wishlist = apps.get_model("market.Wishlist")
        for email, ids in (data.get("wishlists") or {}).items():
            for pid in ids:
                Wishlist.objects.get_or_create(email=email, product_id=pid)
        SellerHub = apps.get_model("market.SellerHub")
        for slug, hub in (data.get("sellerHub") or {}).items():
            SellerHub.objects.update_or_create(store_slug=slug, defaults={"data": hub})
        Singleton.objects.update_or_create(key="platform", defaults={"data": data.get("platform") or {}})
        Singleton.objects.update_or_create(key="announcement", defaults={"data": data.get("announcement") or {}})

        for u in data.get("users") or []:
            profile = {k: v for k, v in u.items() if k not in {"email", "password", "role", "storeSlug", "id", "isActive", "createdAt"}}
            user = User(id=u["id"], email=u["email"].lower(), role=u["role"], store_slug=u.get("storeSlug"), is_active=u.get("isActive", True), data=profile)
            user.set_password(u["password"])
            user.save()
        counts["users"] = len(data.get("users") or [])

        with connection.cursor() as cur:
            for sql in connection.ops.sequence_reset_sql(no_style(), [*all_models, User]):
                cur.execute(sql)
        self.stdout.write(self.style.SUCCESS("Demo data loaded: " + ", ".join(f"{k} {v}" for k, v in counts.items() if v)))
