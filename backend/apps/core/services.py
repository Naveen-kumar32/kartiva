"""Shared helpers used by every app (ports of the frontend mock helpers in src/api/mockDb.js + marketOps.js)."""
from datetime import datetime, timezone

from django.db import transaction
from django.db.models import Max

from .models import AuditLog, EmailOutbox, Notification, Singleton, SmsOutbox


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def next_id(model):
    """Max id + 1 for a DocModel table (mirrors nextId() in the mock)."""
    return (model.objects.aggregate(m=Max("id"))["m"] or 0) + 1


# ---------- Singletons ----------
DEFAULT_PLATFORM = {}


def get_platform():
    row, _ = Singleton.objects.get_or_create(key="platform", defaults={"data": DEFAULT_PLATFORM})
    return row.data


def save_platform(data):
    Singleton.objects.update_or_create(key="platform", defaults={"data": data})
    return data


def get_singleton(key, default=None):
    row = Singleton.objects.filter(key=key).first()
    return row.data if row else (default if default is not None else {})


def set_singleton(key, data):
    Singleton.objects.update_or_create(key=key, defaults={"data": data})
    return data


# ---------- Audit, notifications, outbox ----------
def audit(action, target, details, actor="system"):
    AuditLog.create({"action": action, "actor": actor or "system", "at": now_iso(), "details": details, "target": target})


def notify(audience, title, body, link=None):
    """audience: {role: buyer|seller|admin|all, email?, storeSlug?} — same as notify() in marketOps.js."""
    return Notification.create({"at": now_iso(), "audience": audience, "body": body, "link": link, "read": False, "title": title})


def send_email(to, subject, message, sent_by="Kartiva (automatic)", attachments=None, cc=None):
    """Records the email in the outbox. When EMAIL_BACKEND is SMTP/SES the backend also sends it (Phase 6)."""
    to_list = [to] if isinstance(to, str) else list(to)
    attachments = attachments or []
    return EmailOutbox.create({
        "attachment": attachments[0] if attachments else None, "attachments": attachments, "cc": cc, "message": message, "sentAt": now_iso(),
        "sentBy": sent_by, "status": "sent", "subject": subject, "to": to_list,
    })


def send_sms(to, text, channel="sms"):
    return SmsOutbox.create({"channel": channel, "sentAt": now_iso(), "status": "sent", "text": text[:300], "to": to})


atomic = transaction.atomic
