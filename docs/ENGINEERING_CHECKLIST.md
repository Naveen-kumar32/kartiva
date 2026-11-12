# Engineering Checklist (107 production practices)

Where each practice stands for Kartiva. Last reviewed: 2026-11-12.

**Status:** ✅ done (working now) · 🟢 done as a template/config, switched on at deploy · 📐 designed in the docs, built in the phase shown · ⬜ later / only if needed

**Priority:** **P0** = must have before launch · **P1** = should have at launch · **P2** = later or only when scale needs it

> The frontend demo runs on a mock API. Every server rule (ownership checks, validation, idempotency, lockout) is already enforced in that mock layer, so the backend (Phase 3+) has a working reference.

## Part 1 — Core

| # | Practice | Pri | Status | Where / notes |
|---|----------|-----|--------|---------------|
| 1 | Load balancing | P2 | ⬜ | Single VPS at launch. Nginx upstream / AWS ALB at scale ([SYSTEM_ARCHITECTURE §8](SYSTEM_ARCHITECTURE.md)) |
| 2 | Rate limiting | P0 | 🟢 📐 | `deployment/nginx/kartiva.conf` (`limit_req` on auth + API) + DRF throttles in Phase 3 |
| 3 | Environment variables | P0 | ✅ | `VITE_*` in `.env.example`; backend env list in SYSTEM_ARCHITECTURE §6.4 |
| 4 | Secrets management | P0 | ✅ 📐 | Never in git (`.gitignore` + gitleaks in CI); server env file 640; password-manager vault ([HANDOVER](HANDOVER.md)) |
| 5 | Authentication | P0 | ✅ 📐 | Demo login/register; JWT access token in memory + httpOnly refresh cookie in Phase 3 (AD-10) |
| 6 | Authorization | P0 | ✅ | Role routes + **session-checked ownership** in every mock API (`src/api/session.js`) |
| 7 | Input validation | P0 | ✅ | Yup schemas (client) + checks inside every API function (server-side) |
| 8 | HTTP status codes | P0 | ✅ | API errors carry 400/401/403/404/409/429 (`apiError`) |
| 9 | Error handling | P0 | ✅ | ErrorBoundary at app + layout level; uniform `{detail}` errors; friendly toasts |
| 10 | Automated testing | P0 | ✅ | **Vitest 86 unit tests** + **Playwright 24-step E2E**, both in CI |
| 11 | Database indexing | P0 | 📐 | Indexes listed per table in [DATABASE_SCHEMA](DATABASE_SCHEMA.md) (Phase 3) |
| 12 | Database migrations | P0 | 📐 | Django migrations only, `makemigrations --check` in CI (Phase 3) |
| 13 | Backups | P0 | 🟢 | `deployment/scripts/backup_db.sh` (encrypted, off-site, health ping); plan in [OPERATIONS_GUIDE §3](OPERATIONS_GUIDE.md) |
| 14 | Caching | P1 | 🟢 📐 | Browser/CDN cache headers in Nginx; DB cache → Redis at scale |
| 15 | CDNs | P1 | ✅ 🟢 | Images via Cloudinary CDN; hashed assets `immutable` (CloudFront/Cloudflare-ready) |
| 16 | Logging | P0 | 🟢 📐 | JSON access logs with request id (Nginx); Django JSON logs (Phase 3) |
| 17 | Monitoring | P0 | 📐 | UptimeRobot/Better Stack + Sentry + healthchecks ([OPERATIONS_GUIDE §1](OPERATIONS_GUIDE.md)) |
| 18 | Timeouts | P0 | ✅ 🟢 | Axios 15 s; Nginx proxy 30 s; Gunicorn 30 s |
| 19 | Exponential backoff | P1 | ✅ | Axios retries GET/idempotent calls on network/429/5xx with backoff + jitter, honours `Retry-After` |
| 20 | Idempotency | P0 | ✅ | **Checkout idempotency key** — a retry or double click never creates two orders; Razorpay webhook events deduped (design) |
| 21 | Circuit breakers | P2 | ⬜ | Only if a third-party API becomes flaky (courier tracking) |
| 22 | Reverse proxies | P0 | 🟢 | Nginx in front of Gunicorn (`deployment/nginx/`) |
| 23 | API gateways | P2 | ⬜ | Not needed for one monolith; Nginx covers routing/limits |
| 24 | Docker | P1 | 📐 | `backend/Dockerfile` from Phase 3 (portability rule P12) |
| 25 | CI/CD | P0 | ✅ | GitHub Actions: lint, locale order, **unit tests**, build, **size budget**, npm audit, E2E, gitleaks |
| 26 | Message queues | P2 | ⬜ | Celery + Redis only at scale stage S2 |
| 27 | HTTPS / TLS | P0 | 🟢 | Let's Encrypt, TLS 1.2+/1.3, HTTP→HTTPS, HSTS |
| 28 | Session management | P0 | ✅ | Refresh-token rotation (design) + **auto sign-out after 30 min idle** in Seller Hub/Admin |
| 29 | Two-factor authentication | P1 | 📐 | Admin staff 2FA flag exists; TOTP for admins in Phase 7 |
| 30 | SQL injection | P0 | 📐 | Django ORM only, no raw SQL (Phase 3 rule) |
| 31 | XSS | P0 | ✅ | React escaping, **no `dangerouslySetInnerHTML`**, safe `RichText` renderer (blocks `javascript:` links), CSP |
| 32 | CSRF | P0 | 📐 | Bearer token for API; refresh cookie `SameSite=Strict` + Django CSRF for cookie routes |

## Part 2 — Operations & delivery

| # | Practice | Pri | Status | Where / notes |
|---|----------|-----|--------|---------------|
| 33 | Dependency vulnerabilities | P0 | ✅ | `npm audit` = 0 vulns; in CI; Dependabot weekly |
| 34 | Principle of least privilege | P0 | ✅ 🟢 | Seller/admin roles + staff RBAC; systemd sandboxing; DB user without superuser |
| 35 | Race conditions | P0 | 📐 | Stock reserved with `SELECT … FOR UPDATE` / conditional updates (SYSTEM_ARCHITECTURE §3.3) |
| 36 | Connection pooling | P1 | 📐 | Django `CONN_MAX_AGE`; PgBouncer / RDS Proxy at scale |
| 37 | Database normalization | P0 | ✅ | Schema rev 3 normalised; deliberate snapshots on order lines (price/name/address) |
| 38 | Soft deletes | P1 | ✅ | Products `deletedAt`; orders/money never deleted (PROTECT) |
| 39 | Server-side validation | P0 | ✅ | Prices, totals, MOQ, slab prices, COD limits recomputed in the API; client values ignored |
| 40 | File upload security | P0 | ✅ 📐 | Type + 5 MB limits (KYC, images); server re-checks MIME, strips SVG, private bucket (Phase 4) |
| 41 | Webhooks | P0 | 📐 | Razorpay webhook: signature check, idempotent by event id (SECURITY_GUIDELINES §4) |
| 42 | Background jobs | P1 | 📐 | Management commands (order expiry, reconciliation, settlements) |
| 43 | Cron jobs | P1 | 📐 | systemd timers → EventBridge on AWS |
| 44 | Cache invalidation | P2 | 📐 | Hashed asset names; category/ads cache keys bumped on admin save |
| 45 | Read replicas | P2 | ⬜ | Scale stage S4 |
| 46 | Horizontal vs vertical scaling | P2 | 📐 | Vertical first (bigger VPS), horizontal later (stateless app) |
| 47 | Stateless services | P0 | ✅ 📐 | JWT + external media; rule P2 in [AWS_MIGRATION](AWS_MIGRATION.md) |
| 48 | Health checks | P0 | 📐 | `GET /api/v1/health/` (Phase 3); Nginx route already defined |
| 49 | Graceful shutdown | P1 | 🟢 | `deployment/systemd/gunicorn.service` (`--graceful-timeout`, `SIGTERM`, `TimeoutStopSec`) |
| 50 | Alerting | P0 | 📐 | Uptime + Sentry + backup heartbeat → email/WhatsApp group |
| 51 | Distributed tracing | P2 | ✅ (basic) | `X-Request-ID` on every API call → Nginx log → Django log; full tracing (OpenTelemetry) later |
| 52 | Structured logging | P0 | 🟢 📐 | JSON logs (Nginx template now, Django Phase 3) |
| 53 | Error tracking | P0 | 📐 | Sentry (frontend + backend) — needs client approval |
| 54 | Uptime monitoring | P0 | 📐 | UptimeRobot / Better Stack every minute |
| 55 | Feature flags | P2 | ⬜ | Admin toggles exist (product moderation, COD, home sections); a flag service only if needed |
| 56 | Staging environments | P0 | 📐 | `staging.<domain>` with test Razorpay keys ([ENGINEERING_WORKFLOW §6](ENGINEERING_WORKFLOW.md)) |
| 57 | Infrastructure as Code | P2 | 📐 | Configs in `deployment/`; Terraform/CDK for AWS migration |
| 58 | Code review | P0 | ✅ | PR template with security + portability checklist |
| 59 | Branching strategies | P0 | ✅ | Trunk-based, protected `main` |
| 60 | Semantic versioning | P1 | ✅ | `vMAJOR.MINOR.PATCH` tags + CHANGELOG |
| 61 | API versioning | P0 | ✅ | `/api/v1/` everywhere |
| 62 | API documentation | P0 | ✅ | [API_DOCUMENTATION](API_DOCUMENTATION.md); OpenAPI (drf-spectacular) in Phase 3 |
| 63 | Unit vs integration vs E2E tests | P0 | ✅ 📐 | Unit (Vitest) ✅, E2E (Playwright) ✅, integration (pytest + Postgres) Phase 3 |
| 64 | Load testing | P1 | 📐 | k6 script before launch (50 concurrent shoppers) |

## Part 3 — Quality & security

| # | Practice | Pri | Status | Where / notes |
|---|----------|-----|--------|---------------|
| 65 | Debugging | — | ✅ | Source maps in dev, request ids, readable errors |
| 66 | Profiling | P2 | 📐 | `pg_stat_statements`, django-silk on staging only |
| 67 | Time zones | P0 | ✅ | Stored UTC, shown in IST (`Asia/Kolkata`) |
| 68 | Character encoding | P0 | ✅ | UTF-8 everywhere (₹, Hindi/Tamil names); PDFs use "Rs." (font limitation) |
| 69 | Concurrency | P0 | 📐 | Same as #35; settlement + refund in DB transactions |
| 70 | Async / await | — | ✅ | All API calls async with loading/error states |
| 71 | Memory leaks | P1 | ✅ | Effects clean up listeners/timers; Gunicorn `--max-requests` recycling |
| 72 | Cost monitoring | P1 | 📐 | Monthly cost review ([OPERATIONS_GUIDE §5](OPERATIONS_GUIDE.md)) |
| 73 | Disaster recovery | P0 | 📐 | RPO 24 h → 5 min with WAL, RTO 2–4 h, monthly restore test |
| 74 | Data privacy (DPDP Act 2023 / GDPR) | P0 | ✅ 📐 | Privacy policy, download-my-data, deletion request, data in India |
| 75 | Accessibility | P0 | ✅ | Labels, keyboard dropdowns, focus rings, not colour-only status |
| 76 | Mobile responsiveness | P0 | ✅ | Checked at 390 px in E2E (no horizontal scroll) |
| 77 | Performance budgets | P1 | ✅ | **`npm run check:size` in CI** (storefront 97 kB / 130 kB gzip) |
| 78 | Technical debt | P1 | ✅ | Tracked in DEVELOPMENT_PROGRESS + GitHub issues |
| 79 | Reading documentation | — | ✅ | `docs/` is the source of truth |
| 80 | Reading error messages | — | ✅ | Clear user messages; detailed logs for developers |
| 81 | Content Security Policy | P0 | 🟢 | Strict CSP in Nginx (self + Razorpay + Cloudinary, `frame-ancestors 'none'`) |
| 82 | Security headers | P0 | 🟢 | HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP |
| 83 | Clickjacking | P0 | 🟢 | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| 84 | SSRF | P1 | 📐 | Server never fetches user-supplied URLs; image URLs only via Cloudinary upload API |
| 85 | Open redirects | P0 | ✅ | **Fixed** `safeNextPath` (blocked `/\evil.com`, control chars) + unit tests; ad links only `/…` or `https://` |
| 86 | Path traversal | P0 | 🟢 📐 | Nginx denies dotfiles/backup files; uploads stored by generated keys, never user file names |
| 87 | Command injection | P0 | 📐 | No shell calls from the app; PDF/CSV generated in code |
| 88 | Mass assignment | P0 | ✅ | **Whitelisted fields** in store, buyer, settings and ad updates; DRF serializers with explicit fields |
| 89 | IDOR | P0 | ✅ | **Fixed**: buyers can't open/cancel/return others' orders; sellers can't touch other stores (404) |
| 90 | Brute force protection | P0 | ✅ 🟢 | **5 wrong passwords → 15-min lock** + Nginx auth rate limit |
| 91 | Account lockout | P0 | ✅ | Same as #90; unlocked by password reset; audit-logged |
| 92 | Password reset flows | P0 | ✅ | **Forgot/reset password**: single-use, 30-min link, only the SHA-256 hash stored, no account enumeration |
| 93 | Magic links | P2 | ⬜ | Not planned; mobile OTP login is the likely Indian alternative (client question) |
| 94 | Passkeys | P2 | ⬜ | Later |
| 95 | Single Sign-On (SSO) | P2 | ⬜ | "Sign in with Google" only if the client wants it |
| 96 | Role-Based Access Control | P0 | ✅ | Buyer / seller (+ team roles) / admin (+ staff roles) |

## Part 4 — Data protection

| # | Practice | Pri | Status | Where / notes |
|---|----------|-----|--------|---------------|
| 97 | Row-level security | P0 | ✅ 📐 | Tenant scoping on every seller query (store = session store); optional Postgres RLS later |
| 98 | API keys | P1 | 📐 | Only for partner integrations later (hashed, scoped, revocable) |
| 99 | Token expiration and refresh | P0 | 📐 | Access 15 min, refresh 7 days rotating + blacklist (SimpleJWT) |
| 100 | Cookie flags | P0 | 📐 | Refresh cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/` |
| 101 | Secret rotation | P1 | 📐 | Quarterly ([OPERATIONS_GUIDE §5](OPERATIONS_GUIDE.md)); MultiFernet for field keys |
| 102 | Audit logs | P0 | ✅ | Every admin/seller business action + security events (lockout, password reset) |
| 103 | Encryption at rest | P0 | 📐 | Encrypted backups (age); bank details Fernet-encrypted; disk encryption on VPS/RDS |
| 104 | Encryption in transit | P0 | 🟢 | HTTPS everywhere; DB on localhost / TLS on RDS |
| 105 | Hashing vs encryption | P0 | ✅ 📐 | Passwords hashed (Django PBKDF2/Argon2), reset tokens SHA-256; bank details encrypted (reversible) |
| 106 | Salting | P0 | 📐 | Built into Django password hashers |
| 107 | Penetration testing | P1 | 📐 | Security test checklist (SECURITY_GUIDELINES §9) + external pentest before launch |

## The short list — must be done before launch (P0 still open)

These are designed but can only be finished once the backend exists:

1. **Real authentication** (JWT + refresh cookie flags + token expiry) — Phase 3
2. **Server-side validation, ownership checks, idempotency and rate limits in Django** (port the mock rules) — Phases 3–6
3. **SQL injection / CSRF / file-upload checks** in Django — Phases 3–4
4. **Race-condition-safe stock and money updates** (DB transactions, row locks) — Phase 6
5. **Razorpay webhooks** with signature check and idempotency — Phase 6
6. **Database migrations, indexes, health check** — Phase 3
7. **HTTPS, security headers, CSP, reverse proxy** — templates ready, applied in Phase 9
8. **Backups + restore test, monitoring, alerting, error tracking, uptime** — Phase 9
9. **Staging environment** — Phase 9
10. **External penetration test** — before launch
