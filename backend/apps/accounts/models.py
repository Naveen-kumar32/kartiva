"""Users: real Django auth (hashed passwords, JWT) + the profile in `data` in the frontend's camelCase shape
(firstName, lastName, phone, businessName, gstin, city, addresses[], notificationPrefs{})."""
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, role="buyer", **data):
        email = self.normalize_email(email).lower()
        user = self.model(email=email, role=role, store_slug=data.pop("storeSlug", None), data=data)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, **data):
        return self.create_user(email, password, role="admin", **data)


class User(AbstractBaseUser):
    ROLES = [("buyer", "Buyer"), ("seller", "Seller"), ("admin", "Admin")]
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=ROLES, default="buyer", db_index=True)
    store_slug = models.CharField(max_length=80, null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    data = models.JSONField(default=dict)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    @property
    def is_staff(self):
        return self.role == "admin"

    def has_perm(self, perm, obj=None):
        return self.role == "admin"

    def has_module_perms(self, app_label):
        return self.role == "admin"

    def public(self):
        """What the frontend stores as `user` (never includes the password hash)."""
        return {**self.data, "createdAt": self.created_at.isoformat() if self.created_at else None, "email": self.email, "id": self.id,
                "isActive": self.is_active, "role": self.role, "storeSlug": self.store_slug}


class LoginAttempt(models.Model):
    """Brute-force protection: 5 wrong passwords in 15 min → locked 15 min (same rules as the demo)."""
    email = models.EmailField(unique=True)
    count = models.IntegerField(default=0)
    first_at = models.DateTimeField(null=True)
    locked_until = models.DateTimeField(null=True)


class PasswordResetToken(models.Model):
    """Single-use, 30-minute reset links. Only the SHA-256 of the token is stored."""
    email = models.EmailField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True)


class SeenMarker(models.Model):
    """'Last visit' per user + page area (NEW badges on orders)."""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    area = models.CharField(max_length=40)
    at = models.DateTimeField()
    prev = models.DateTimeField()

    class Meta:
        unique_together = [("user", "area")]
