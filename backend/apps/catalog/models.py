from django.db import models

from apps.core.docmodel import DocModel


class Category(DocModel):
    id = models.BigIntegerField(primary_key=True)
    slug = models.SlugField(max_length=100, unique=True, null=True)
    parent_id = models.BigIntegerField(null=True, db_index=True)
    is_active = models.BooleanField(null=True)
    sort_order = models.IntegerField(null=True)
    INDEX = {"slug": "slug", "parent_id": "parentId", "is_active": "isActive", "sort_order": "sortOrder"}

    class Meta:
        ordering = ["sort_order", "id"]


class Store(DocModel):
    slug = models.SlugField(max_length=100, unique=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    INDEX = {"slug": "slug", "status": "status"}

    class Meta:
        ordering = ["id"]


class Product(DocModel):
    """data = full product incl. variants[], images[], specifications[], priceTiers[], moq, enquiryOnly …"""
    id = models.BigIntegerField(primary_key=True)
    slug = models.SlugField(max_length=200, unique=True, null=True)
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    category_slug = models.CharField(max_length=100, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    deleted_at = models.DateTimeField(null=True)
    INDEX = {"slug": "slug", "store_slug": "storeSlug", "category_slug": "categorySlug", "status": "status", "deleted_at": "deletedAt"}

    class Meta:
        ordering = ["id"]


class Review(DocModel):
    product_id = models.BigIntegerField(db_index=True, null=True)
    INDEX = {"product_id": "productId"}


class StockMovement(DocModel):
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    at = models.DateTimeField(null=True)
    INDEX = {"store_slug": "storeSlug", "at": "at"}

    class Meta:
        ordering = ["-id"]
