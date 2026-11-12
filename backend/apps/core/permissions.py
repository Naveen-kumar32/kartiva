"""Role checks. Sellers are always scoped to request.user.store_slug (tenant isolation, SECURITY_GUIDELINES §3)."""
from .errors import ApiError


def require_user(request, *roles):
    user = request.user
    if not user or not user.is_authenticated:
        raise ApiError("Please sign in to continue.", 401)
    if roles and user.role not in roles:
        raise ApiError("You don't have access to this.", 403)
    return user


def require_buyer(request):
    return require_user(request, "buyer")


def require_seller(request):
    user = require_user(request, "seller")
    if not user.store_slug:
        raise ApiError("No store is linked to this account.", 403)
    return user


def require_admin(request):
    return require_user(request, "admin")


def actor_name(user):
    d = user.data or {}
    return f"{d.get('firstName', '')} {d.get('lastName', '')}".strip() or user.email
