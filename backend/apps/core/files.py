"""Private file storage helpers (KYC proofs). Files are only ever returned through permission-checked views."""
import re

from django.http import HttpResponse

from apps.core.errors import ApiError
from apps.core.models import StoredFile

MAX_BYTES = 5 * 1024 * 1024
# Trust the bytes, not the browser: the file type comes from the file's own signature.
SIGNATURES = [(b"%PDF-", "application/pdf", "pdf"), (b"\x89PNG\r\n\x1a\n", "image/png", "png"), (b"\xff\xd8\xff", "image/jpeg", "jpg")]


def sniff(content):
    return next(((ctype, ext) for sig, ctype, ext in SIGNATURES if content.startswith(sig)), (None, None))


def safe_name(name, ext):
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", str(name or "document")).strip("-.")[:100] or "document"
    stem = re.sub(r"\.(pdf|png|jpe?g)$", "", stem, flags=re.I)
    return f"{stem}.{ext}"


def save_upload(kind, owner, upload):
    """Validate an uploaded PDF/JPG/PNG (≤ 5 MB, real file signature) and store it. Returns the StoredFile."""
    if upload.size > MAX_BYTES:
        raise ApiError("File must be smaller than 5 MB.")
    content = upload.read()
    ctype, ext = sniff(content)
    if not ctype:
        raise ApiError("Upload a PDF, JPG or PNG file.")
    return StoredFile.objects.create(kind=kind, owner=owner, name=safe_name(upload.name, ext), content_type=ctype, size=len(content), content=content)


def file_response(stored, download=False):
    res = HttpResponse(bytes(stored.content), content_type=stored.content_type)
    res["Content-Disposition"] = f'{"attachment" if download else "inline"}; filename="{stored.name}"'
    res["Content-Length"] = str(stored.size)
    res["Cache-Control"] = "private, no-store"
    res["X-Content-Type-Options"] = "nosniff"
    res["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    return res
