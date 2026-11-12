"""Auth API (port of frontend src/api/authApi.js). Access token in the JSON body (kept in memory by the SPA);
refresh token in an httpOnly cookie scoped to /api/v1/auth/ (AD-10)."""
import hashlib
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.catalog.models import Store
from apps.core.errors import ApiError
from apps.core.permissions import require_user
from apps.core.services import atomic, audit, notify, now_iso, send_email
from apps.market.models import SellerStaff, Subscription
from apps.orders.models import SellerApplication

from .models import LoginAttempt, PasswordResetToken, User

MAX_ATTEMPTS, LOCK, WINDOW = 5, timedelta(minutes=15), timedelta(minutes=15)
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
PAN_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
COLORS = ["#0891b2", "#9333ea", "#16a34a", "#dc2626", "#ca8a04", "#2563eb", "#db2777"]


class AuthThrottle(ScopedRateThrottle):
    scope_attr = "throttle_scope"

    def get_cache_key(self, request, view):
        self.scope = "auth"
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return self.cache_format % {"scope": "auth", "ident": self.get_ident(request)}


def _session_response(user, status=200):
    refresh = RefreshToken.for_user(user)
    response = Response({"access": str(refresh.access_token), "user": user.public()}, status=status)
    c = settings.REFRESH_COOKIE
    response.set_cookie(c["key"], str(refresh), max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()), path=c["path"], httponly=c["httponly"], samesite=c["samesite"], secure=c["secure"])
    return response


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def login(request):
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", ""))
    now = timezone.now()
    rec, _ = LoginAttempt.objects.get_or_create(email=email, defaults={"first_at": now})
    if rec.locked_until and rec.locked_until > now:
        mins = max(1, int((rec.locked_until - now).total_seconds() // 60) + 1)
        raise ApiError(f"Too many failed attempts. For your security this account is locked for {mins} minute{'s' if mins != 1 else ''} — try again later or reset your password.", 429)
    user = authenticate(request, email=email, password=password)
    if user is None:
        if rec.first_at is None or now - rec.first_at > WINDOW:
            rec.count, rec.first_at = 0, now
        rec.count += 1
        if rec.count >= MAX_ATTEMPTS:
            rec.locked_until = now + LOCK
            if User.objects.filter(email=email).exists():
                audit("auth.locked", email, f"{MAX_ATTEMPTS} failed sign-in attempts — locked for 15 minutes", "system")
        rec.save()
        if rec.locked_until and rec.locked_until > now:
            raise ApiError("Too many failed attempts. For your security this account is locked for 15 minutes — try again later or reset your password.", 429)
        left = MAX_ATTEMPTS - rec.count
        msg = f"Incorrect email or password. {left} attempt{'s' if left != 1 else ''} left before the account is locked for 15 minutes." if left <= 2 else "Incorrect email or password."
        raise ApiError(msg, 401)
    if not user.is_active:
        raise ApiError("This account has been disabled. Contact support@kartiva.in.", 403)
    rec.delete()
    return _session_response(user)


@api_view(["POST"])
def refresh(request):
    token = request.COOKIES.get(settings.REFRESH_COOKIE["key"])
    if not token:
        raise ApiError("Session expired. Please sign in again.", 401)
    try:
        old = RefreshToken(token)
        user = User.objects.get(id=old["user_id"], is_active=True)
        old.blacklist()
    except (TokenError, User.DoesNotExist) as exc:
        raise ApiError("Session expired. Please sign in again.", 401) from exc
    return _session_response(user)


@api_view(["POST"])
def logout(request):
    token = request.COOKIES.get(settings.REFRESH_COOKIE["key"])
    if token:
        try:
            RefreshToken(token).blacklist()
        except TokenError:
            pass
    response = Response({"ok": True})
    response.delete_cookie(settings.REFRESH_COOKIE["key"], path=settings.REFRESH_COOKIE["path"])
    return response


@api_view(["GET"])
def me(request):
    return Response(require_user(request).public())


def _validate_signup(v, seller):
    email = str(v.get("email", "")).strip().lower()
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        raise ApiError("Enter a valid email address")
    if len(str(v.get("firstName", "")).strip()) < 2:
        raise ApiError("Enter your first name")
    if not re.match(r"^[6-9]\d{9}$", str(v.get("phone", ""))):
        raise ApiError("Enter a valid 10-digit Indian mobile number")
    pw = str(v.get("password", ""))
    if len(pw) < 8 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ApiError("Password must be at least 8 characters with a letter and a number")
    if seller:
        if len(str(v.get("businessName", "")).strip()) < 3:
            raise ApiError("Enter your business name")
        if not GSTIN_RE.match(str(v.get("gstin", "")).upper()):
            raise ApiError("Enter a valid 15-character GSTIN")
        if not PAN_RE.match(str(v.get("pan", "")).upper()):
            raise ApiError("Enter a valid 10-character PAN (e.g. ABCDE1234F)")
        for k in ("businessType", "category", "city", "state"):
            if not str(v.get(k, "")).strip():
                raise ApiError("Please fill in all business details")
        if v.get("terms") is not True:
            raise ApiError("Please accept the seller agreement to continue")
    if User.objects.filter(email=email).exists():
        raise ApiError("An account with this email already exists. Sign in instead.", 409)
    return email


def _slugify(s):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def register(request):
    v = request.data
    email = _validate_signup(v, seller=False)
    user = User.objects.create_user(email, v["password"], role="buyer", firstName=v["firstName"].strip(), lastName=str(v.get("lastName", "")).strip(), phone=f"+91{v['phone']}")
    return _session_response(user, 201)


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def register_seller(request):
    """Seller sign-up: creates the user, a PENDING store, a seller application, free plan and owner team row."""
    v = request.data
    email = _validate_signup(v, seller=True)
    with atomic():
        business = v["businessName"].strip()
        slug = _slugify(business) or "store"
        base, n = slug, 1
        while Store.objects.filter(slug=slug).exists():
            n += 1
            slug = f"{base}-{n}"
        first, last = v["firstName"].strip(), str(v.get("lastName", "")).strip()
        owner = f"{first} {last}".strip()
        color = COLORS[secrets.randbelow(len(COLORS))]
        city, state = v["city"].strip(), v["state"]
        Store.create({
            "address": f"{city}, {state}", "annualTurnover": v.get("annualTurnover") or "Up to ₹1 Cr", "badges": [], "banner": f"linear-gradient(120deg,#0f172a,{color} 60%,{color}cc)",
            "businessType": v["businessType"], "certifications": [], "city": city, "color": color, "contactPerson": owner, "employees": "1–10", "gstStateCode": v["gstin"][:2],
            "gstin": v["gstin"].upper(), "gstVerified": False, "initials": "".join(w[0] for w in business.split()[:2]).upper(), "isFeatured": False, "kycStatus": "not_submitted",
            "mainMarkets": [state], "name": business, "ownerEmail": email, "pan": v["pan"].upper(), "phone": f"+91{v['phone']}", "plan": "free", "rating": 0, "ratingCount": 0,
            "responseHours": None, "responseRate": None, "returnPolicy": "7-day returns on unused items in original packaging.",
            "shippingMethods": [{"codAllowed": True, "fee": 49, "freeAbove": 499, "id": 1000 + Store.objects.count(), "maxDays": 7, "minDays": 3, "name": "Standard Delivery", "type": "standard"}],
            "since": timezone.now().year, "slug": slug, "state": state, "status": "pending", "tagline": f"{v['businessType']} · {v['category']}", "yearEstablished": int(v.get("yearEstablished") or timezone.now().year),
        })
        user = User.objects.create_user(email, v["password"], role="seller", storeSlug=slug, firstName=first, lastName=last, phone=f"+91{v['phone']}")
        SellerApplication.create({
            "business": business, "businessType": v["businessType"], "category": v["category"], "city": f"{city}, {state}", "email": email, "gstin": v["gstin"].upper(), "owner": owner,
            "phone": f"+91{v['phone']}", "selfRegistered": True, "status": "pending", "storeSlug": slug, "submittedAt": now_iso(), "userId": user.id,
        })
        Subscription.create({"amount": 0, "endsAt": None, "invoiceNumber": None, "leadCreditsUsed": 0, "planCode": "free", "startsAt": now_iso(), "status": "active", "storeSlug": slug})
        SellerStaff.create({"email": email, "lastActiveAt": now_iso(), "name": owner, "role": "owner", "status": "active", "storeSlug": slug})
        notify({"role": "admin"}, "New seller sign-up", f"{business} ({city}) registered as a seller and is waiting for approval.", "/admin/sellers")
        audit("seller.registered", f"Store {slug}", f"{business} signed up ({v['businessType']}, {v['category']})", owner)
    return _session_response(user, 201)


def _sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def password_reset(request):
    """Same answer whether or not the email exists (no account enumeration)."""
    email = str(request.data.get("email", "")).strip().lower()
    user = User.objects.filter(email=email, is_active=True).first()
    demo_link = None
    if user:
        token = secrets.token_hex(24)
        PasswordResetToken.objects.filter(email=email).delete()
        PasswordResetToken.objects.create(email=email, token_hash=_sha(token), expires_at=timezone.now() + timedelta(minutes=30))
        link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        send_email(email, "Reset your Kartiva password", f"Hello {user.data.get('firstName', '')},\n\nWe received a request to reset your Kartiva password. Use this link within 30 minutes:\n{link}\n\nIf you didn't ask for this, ignore this email — your password stays the same.\n\n— Team Kartiva")
        audit("auth.reset_requested", email, "Password reset link sent", "system")
        if settings.DEBUG:
            demo_link = f"/reset-password?token={token}"
    return Response({"demoLink": demo_link, "ok": True})


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def password_reset_confirm(request):
    token, password = str(request.data.get("token", "")), str(request.data.get("password", ""))
    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ApiError("Password must be at least 8 characters with a letter and a number")
    rec = PasswordResetToken.objects.filter(token_hash=_sha(token)).first()
    if not rec or rec.used_at or rec.expires_at < timezone.now():
        raise ApiError("This reset link is invalid, expired or already used. Request a new one.")
    user = User.objects.filter(email=rec.email).first()
    if not user:
        raise ApiError("This reset link is invalid, expired or already used. Request a new one.")
    user.set_password(password)
    user.save()
    rec.used_at = timezone.now()
    rec.save()
    LoginAttempt.objects.filter(email=rec.email).delete()
    notify({"email": user.email, "role": user.role}, "Password changed", "Your password was changed. If this wasn't you, contact support immediately.")
    audit("auth.password_reset", user.email, "Password reset via email link", "system")
    return Response({"ok": True})
