from django.db import models

from apps.core.docmodel import DocModel


class AdSlot(DocModel):
    key = models.CharField(max_length=60, unique=True, null=True)
    INDEX = {"key": "key"}

    class Meta:
        ordering = ["id"]


class Ad(DocModel):
    slot = models.CharField(max_length=60, db_index=True, null=True)
    status = models.CharField(max_length=20, db_index=True, null=True)
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    INDEX = {"slot": "slot", "status": "status", "store_slug": "storeSlug"}

    class Meta:
        ordering = ["id"]


class AdRequest(DocModel):
    store_slug = models.CharField(max_length=100, db_index=True, null=True)
    status = models.CharField(max_length=20, null=True)
    INDEX = {"store_slug": "storeSlug", "status": "status"}

    class Meta:
        ordering = ["-id"]
