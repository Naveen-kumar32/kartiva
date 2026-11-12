from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.core.docmodel import DocModel


class Order(DocModel):
    """Parent order; data.subOrders[] = one per seller (items, tax, timeline, method, status …)."""
    number = models.CharField(max_length=40, unique=True, null=True)
    buyer_email = models.EmailField(db_index=True, null=True)
    created_at = models.DateTimeField(db_index=True, null=True)
    payment_method = models.CharField(max_length=10, null=True)
    store_slugs = ArrayField(models.CharField(max_length=100), default=list)
    sub_numbers = ArrayField(models.CharField(max_length=50), default=list)
    INDEX = {"number": "number", "buyer_email": "buyer.email", "created_at": "createdAt", "payment_method": "paymentMethod"}

    def save(self, *args, **kwargs):
        subs = self.data.get("subOrders") or []
        self.store_slugs = sorted({s.get("storeSlug") for s in subs if s.get("storeSlug")})
        self.sub_numbers = [s.get("number") for s in subs if s.get("number")]
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-created_at"]


class Return(DocModel):
    number = models.CharField(max_length=60, null=True, db_index=True)
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    buyer_email = models.EmailField(db_index=True, null=True)
    sub_order_number = models.CharField(max_length=50, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    created_at = models.DateTimeField(null=True)
    INDEX = {"number": "number", "store_slug": "storeSlug", "buyer_email": "buyer.email", "sub_order_number": "subOrderNumber", "status": "status", "created_at": "createdAt"}

    class Meta:
        ordering = ["-id"]


class Refund(DocModel):
    order_number = models.CharField(max_length=40, db_index=True, null=True)
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    INDEX = {"order_number": "orderNumber", "store_slug": "storeSlug", "status": "status"}

    class Meta:
        ordering = ["-id"]


class Settlement(DocModel):
    number = models.CharField(max_length=30, null=True, db_index=True)
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    INDEX = {"number": "number", "store_slug": "storeSlug", "status": "status"}

    class Meta:
        ordering = ["-id"]


class CommissionRule(DocModel):
    scope = models.CharField(max_length=20, null=True)
    INDEX = {"scope": "scope"}

    class Meta:
        ordering = ["id"]


class Buyer(DocModel):
    """Customer list for admin (codBlocked, isActive, address)."""
    email = models.EmailField(unique=True, null=True)
    INDEX = {"email": "email"}

    class Meta:
        ordering = ["id"]


class SellerApplication(DocModel):
    status = models.CharField(max_length=20, db_index=True, null=True)
    store_slug = models.CharField(max_length=100, null=True)
    INDEX = {"status": "status", "store_slug": "storeSlug"}

    class Meta:
        ordering = ["-id"]
