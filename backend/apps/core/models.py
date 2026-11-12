from django.db import models

from .docmodel import DocModel


class Singleton(models.Model):
    """Key → JSON blobs: platform settings, announcement, misc demo state."""
    key = models.CharField(max_length=60, primary_key=True)
    data = models.JSONField(default=dict)


class AuditLog(DocModel):
    at = models.DateTimeField(db_index=True, null=True)
    action = models.CharField(max_length=80, db_index=True, null=True)
    INDEX = {"at": "at", "action": "action"}

    class Meta:
        ordering = ["-id"]


class Notification(DocModel):
    """data.audience = { role: buyer|seller|admin|all, email?, storeSlug? }"""
    at = models.DateTimeField(db_index=True, null=True)
    role = models.CharField(max_length=10, db_index=True, null=True)
    email = models.EmailField(null=True, db_index=True)
    store_slug = models.CharField(max_length=80, null=True, db_index=True)

    def save(self, *args, **kwargs):
        aud = self.data.get("audience") or {}
        self.role, self.email, self.store_slug = aud.get("role"), aud.get("email"), aud.get("storeSlug")
        self.at = self.data.get("at")
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-at", "-id"]


class EmailOutbox(DocModel):
    sent_at = models.DateTimeField(db_index=True, null=True)
    INDEX = {"sent_at": "sentAt"}

    class Meta:
        ordering = ["-id"]


class SmsOutbox(DocModel):
    sent_at = models.DateTimeField(db_index=True, null=True)
    INDEX = {"sent_at": "sentAt"}

    class Meta:
        ordering = ["-id"]


class IdempotencyKey(models.Model):
    key = models.CharField(max_length=200, unique=True)
    result_ref = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)
