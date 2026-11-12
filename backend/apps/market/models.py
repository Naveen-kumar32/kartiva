"""B2B marketplace features: enquiries (leads), quote requests (RFQs), messages, support, plans, KYC, teams, CMS."""
from django.db import models

from apps.core.docmodel import DocModel


class Enquiry(DocModel):
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    buyer_email = models.EmailField(db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    INDEX = {"store_slug": "storeSlug", "buyer_email": "buyer.email", "status": "status"}

    class Meta:
        ordering = ["-id"]


class Rfq(DocModel):
    """data.quotes[] and data.dispatches[] (which sellers received it, viewed, quoted)."""
    buyer_email = models.EmailField(db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    category_slug = models.CharField(max_length=100, db_index=True, null=True)
    INDEX = {"buyer_email": "buyer.email", "status": "status", "category_slug": "categorySlug"}

    class Meta:
        ordering = ["-id"]


class Thread(DocModel):
    """data.messages[] + data.unread {buyer, seller}."""
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    buyer_email = models.EmailField(db_index=True, null=True)
    updated_at = models.DateTimeField(null=True)
    INDEX = {"store_slug": "storeSlug", "buyer_email": "buyer.email", "updated_at": "updatedAt"}

    class Meta:
        ordering = ["-updated_at"]


class Ticket(DocModel):
    number = models.CharField(max_length=20, null=True, db_index=True)
    raised_by_email = models.EmailField(db_index=True, null=True)
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    INDEX = {"number": "number", "raised_by_email": "raisedBy.email", "store_slug": "raisedBy.storeSlug", "status": "status"}

    class Meta:
        ordering = ["-id"]


class Plan(DocModel):
    code = models.CharField(max_length=30, unique=True, null=True)
    INDEX = {"code": "code"}

    class Meta:
        ordering = ["id"]


class Subscription(DocModel):
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    INDEX = {"store_slug": "storeSlug", "status": "status"}

    class Meta:
        ordering = ["id"]


class KycDocument(DocModel):
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    INDEX = {"store_slug": "storeSlug", "status": "status"}

    class Meta:
        ordering = ["id"]


class SellerStaff(DocModel):
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    email = models.EmailField(null=True)
    INDEX = {"store_slug": "storeSlug", "email": "email"}

    class Meta:
        ordering = ["id"]


class AdminStaff(DocModel):
    email = models.EmailField(null=True)
    INDEX = {"email": "email"}

    class Meta:
        ordering = ["id"]


class CmsPage(DocModel):
    slug = models.SlugField(max_length=100, unique=True, null=True)
    published = models.BooleanField(null=True)
    INDEX = {"slug": "slug", "published": "published"}

    class Meta:
        ordering = ["id"]


class Broadcast(DocModel):
    class Meta:
        ordering = ["-id"]


class Wishlist(models.Model):
    email = models.EmailField(db_index=True)
    product_id = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("email", "product_id")]
        ordering = ["-id"]


class SellerHub(models.Model):
    """Private per-store Seller Hub data (CRM notes/tags, bulk-upload history)."""
    store_slug = models.CharField(max_length=100, unique=True)
    data = models.JSONField(default=dict)
