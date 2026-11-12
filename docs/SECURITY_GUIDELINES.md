# Security Guidelines

Treat this as a commercial payments application. Every item here maps to a control implemented in code or configuration, and is verified by a test or a deployment check.

## 1. Threat model (top risks)

| # | Threat | Where | Control |
|---|--------|-------|---------|
| T1 | **Price / total tampering** (browser sends a lower price) | Checkout | The client sends only ids and quantities. The server re-prices from the DB and the gateway amount comes from the server |
| T2 | **Fake payment success** (forged callback, edited JS) | Payment verify | HMAC-SHA256 signature check with the key secret **and** a server-side fetch of the payment status and amount from Razorpay |
| T3 | **Forged / replayed webhooks** | Webhook | HMAC over the **raw body** with the webhook secret, constant-time compare, unique event id, CSRF-exempt only on this view |
| T4 | **IDOR / cross-seller access** | Seller APIs | `SellerScopedQuerysetMixin` filters every queryset by the caller's store. Lookups by number or slug go **through** the scoped queryset → 404. Isolation tests cover every seller endpoint |
| T5 | **Privilege escalation** (self-assigning admin/seller role) | Auth | `role` is set only by the server. It is read-only in all serializers. Admins are created only by a CLI command |
| T6 | **Token theft via XSS** | SPA | Access token in memory. Refresh token in an httpOnly, Secure, SameSite=Strict cookie. CSP header. No `dangerouslySetInnerHTML` without DOMPurify |
| T7 | **Credential stuffing / brute force** | Login | Throttling (IP + email), generic error message, Argon2 hashing, Django password validators (min 8, not common, not numeric, not similar to the email) |
| T8 | **Account enumeration** | Register / forgot | Forgot-password always returns 200. Register returns the generic duplicate error only after throttling |
| T9 | **Malicious uploads** | Images | Size limit (5 MB, plus Nginx `client_max_body_size 10m`), Pillow decode check, MIME allow-list (JPEG/PNG/WebP), randomised storage keys, SVG rejected, files go to Cloudinary (never served from our app server) |
| T10 | **SQL injection** | All | Django ORM only. Raw SQL is banned except in reviewed selectors that use parameters |
| T11 | **Duplicate orders / double refunds** | Orders, payments | Idempotency keys, unique constraints, row locks (see SYSTEM_ARCHITECTURE §3.2) |
| T12 | **Secret leakage** | Repo / frontend | Secrets only in server `.env` (chmod 600), never committed (`.gitignore`). Frontend receives only `VITE_RAZORPAY_KEY_ID`. Secret scanning in CI (gitleaks) |
| T13 | **Sensitive data exposure** | DB, logs | Bank account encrypted (Fernet), masked in APIs. Logs exclude passwords, tokens, signatures and full addresses. No card data is ever received |
| T14 | **Admin misuse / unnoticed changes** | Admin | Every admin write goes to `audit_logs` (actor, IP, diff). Django admin at a non-default path, staff only |
| T15 | **Stored XSS via product/review text** | Storefront | React escaping. Descriptions stored as plain text or limited markdown rendered through a sanitiser. Max lengths |
| T16 | **Open redirect via banner links or `?next=`** | Storefront | Banner `link_url` validated (internal path or allow-list). `next` must start with `/` and not `//` |
| T17 | **Denial of wallet / scraping** | Public APIs | Nginx `limit_req` + DRF throttles, `page_size` max 100, cached home and category endpoints |
| T18 | **Malicious ads** (script injection, phishing links, skimming) | Ads | First-party ads only (images + validated links). No third-party ad JS. Ad images go through the same upload validation. `target_url` limited to internal paths or https URLs, checked against a blocklist and approved by an admin. `rel="sponsored noopener noreferrer"`. No ads on checkout/payment/auth/account pages |
| T19 | **Ad click / impression fraud** | Ads | Per-IP and per-session throttles, 30 s de-dupe per ad, bot user-agent filter, impressions only counted when visible |
| T20 | **COD abuse** (fake orders, refusals) | Checkout | Verified email, COD order limit, refusal tracking + `cod_blocked`, checkout throttle |
| T21 | **Tax document tampering / leakage** | Invoicing | PDFs in private storage, short-lived signed URLs, issued documents immutable (corrections only via credit notes) |
| T22 | **Return fraud** (claiming more than bought) | Returns | Quantity bounded by `quantity − returned_quantity`, window enforced on the server, photos required for damage claims, seller verifies on receipt |

## 2. Authentication & sessions

- `djangorestframework-simplejwt` with `ROTATE_REFRESH_TOKENS=True` and `BLACKLIST_AFTER_ROTATION=True`. Access token 15 min, refresh token 7 days.
- Refresh cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/`.
- **CSRF:** the only cookie-authenticated endpoints are `/auth/refresh/` and `/auth/logout/`. They are protected by SameSite=Strict **and** an `Origin`/`Referer` check against `CSRF_TRUSTED_ORIGINS`. All other endpoints use the Bearer header, so they are not CSRF-prone.
- Deactivated users and suspended sellers: the token authentication class rejects `is_active=False` on every request. Seller-specific permissions check `seller_profile.status == approved` on every request, not from the token.
- Password reset and email verification use Django's `PasswordResetTokenGenerator`: time-limited and invalidated by a password change.

## 3. Authorisation model

```python
# apps/core/permissions.py (shape)
class IsBuyer(BasePermission):          # user.role == "buyer"
class IsSeller(BasePermission):         # user.role == "seller"
class IsApprovedSeller(IsSeller):       # + seller_profile.status == "approved"
class IsAdmin(BasePermission):          # user.role == "admin" and user.is_staff
```

- Default DRF permission is `IsAuthenticated`. Public endpoints opt out explicitly with `AllowAny`.
- Object-level ownership comes **from the queryset**, not `has_object_permission` alone, so lists and details cannot diverge.
- The role-to-URL mapping is enforced on both sides. The frontend `ProtectedRoute` is UX only. The backend is the real control.

## 4. Payments (Razorpay)

1. The amount always comes from `orders.grand_total` and is converted to paise by the adapter.
2. Signature check: `hmac.compare_digest(hmac_sha256(order_id + "|" + payment_id, KEY_SECRET), signature)`.
3. After the signature passes, fetch the payment and require `status == "captured"` (auto-capture on), `order_id` to match, and `amount` to match.
4. Webhook: verify `X-Razorpay-Signature` against the raw `request.body` with `RAZORPAY_WEBHOOK_SECRET`. Store the event, then process. Return 200 even for already-processed events.
5. Refunds can only be started by the cancellation service (buyer/seller cancel inside the rules) or an admin. Every refund is audit-logged.
6. Test-mode and live-mode keys are separated by environment. Live keys exist only on the production server.

## 5. Input validation

- Every write goes through a DRF serializer with explicit `fields`. Never `__all__` on writable serializers. `read_only_fields` covers ids, role, status, store, prices computed by the server, and ratings.
- Server-side validators: Indian PIN code, phone (E.164 +91), GSTIN, PAN, IFSC, quantities (1..max), price ≤ MRP, spec list size.
- Frontend Yup schemas mirror these rules for UX only.

## 6. HTTP & infrastructure hardening

- Nginx: TLS 1.2+, HSTS (`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a **CSP** allowing self, Razorpay checkout (`checkout.razorpay.com`, `api.razorpay.com`) and Cloudinary (`res.cloudinary.com`). There are no third-party ad domains in v1, which keeps the CSP tight.
- Encrypted fields (seller bank account, COD refund payout details): Fernet with `FIELD_ENCRYPTION_KEY` from env. Key rotation is supported with a MultiFernet key list.
- Django prod settings: `DEBUG=False`, `SECURE_PROXY_SSL_HEADER`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, strict `ALLOWED_HOSTS`. CORS is disabled in prod (same origin) and only allows `localhost:5173` in dev.
- Server: SSH key-only login, root login disabled, UFW allowing 22/80/443 only, fail2ban, unattended security upgrades. Postgres listens on localhost only, with a dedicated least-privilege DB user.
- Backups: daily `pg_dump`, encrypted, copied off-server, restore tested monthly.

## 7. Dependency & code hygiene

- Pinned versions (`requirements/*.txt`, `package-lock.json`).
- `pip-audit` and `npm audit --omit=dev` in CI. GitHub Dependabot enabled.
- `gitleaks` pre-commit hook and CI secret scan.
- Every PR touching `payments/`, `orders/services/` or `core/permissions.py` needs tests and a review.

## 8. Logging & monitoring

- Structured logs (JSON) for the app, with a request id on each line.
- Security events logged: failed logins, throttling hits, invalid webhook signatures, permission denials on seller/admin APIs, refund creation, role/status changes.
- Never logged: passwords, tokens, `Authorization` headers, Razorpay signatures and secrets, bank account numbers.
- Error tracking: Sentry (free tier) with PII scrubbing. Recommended, and it needs client approval as an external service.

## 8a. Data protection (DPDP Act 2023)

- **Minimise:** collect only what orders, tax and payouts need. No card data ever (Razorpay handles it).
- **Notice & consent:** privacy notice at signup and checkout. Marketing emails are opt-in and separate from order emails.
- **Rights:** export ("download my data") and deletion. Deletion anonymises the user but keeps invoices/orders for the GST retention period (confirm the period with the CA).
- **Data in India:** VPS, backups and future AWS region (ap-south-1) stay in India.
- **Access:** admin roles are least-privilege, every admin read of bank/payout details is audit-logged, and staff access is reviewed quarterly.
- **Breach:** follow the incident runbook ([OPERATIONS_GUIDE §6](OPERATIONS_GUIDE.md#6-incident-response-short-runbook)), then notify the Data Protection Board and affected users.
- **Non-production data:** staging uses seed data or an anonymised copy. Real customer data never goes onto developer laptops.

## 9. Security test checklist (automated, see TESTING_GUIDE)

- [ ] Buyer cannot call `/seller/*` or `/admin-api/*` (403)
- [ ] Seller A gets 404 on Seller B's product, sub-order and settlement, for both read and write
- [ ] Pending, rejected and suspended sellers cannot create products or see orders
- [ ] `role` in register or profile PATCH payloads is ignored
- [ ] Tampered `price` or `total` fields in checkout are ignored
- [ ] Invalid payment signature → 400, order stays `pending_payment`
- [ ] Webhook with bad signature → 400, nothing processed. Replayed event → no double effect
- [ ] Refund total cannot exceed the payment amount
- [ ] Upload of a `.php` renamed to `.jpg`, an oversize file, or an SVG → rejected
- [ ] Login throttling triggers
- [ ] Seller A cannot edit Seller B's variants, shipping methods, returns, ledger or ads (404)
- [ ] Ad `target_url` with `javascript:`, `data:` or a non-https scheme is rejected
- [ ] COD rejected when over the limit, the buyer is blocked, or a seller method disallows it
- [ ] Return quantity above what was bought, or outside the window, is rejected
