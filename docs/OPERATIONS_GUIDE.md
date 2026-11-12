# Operations Guide: Monitoring, Backups, Performance & Maintenance

Status: **plan (Phase 1/2).** Scripts and configs are built and tested in Phase 9 under `deployment/`.

## 1. Monitoring & alerting

| What | Tool (free tier is enough at launch) | Alert when |
|------|--------------------------------------|------------|
| Site and API up | UptimeRobot or Better Stack → `https://<domain>/` and `/api/v1/health/` every 1 min | 2 failed checks in a row |
| App errors | Sentry (frontend + backend, PII scrubbed; needs client approval) | New error type, or error spike |
| Server resources | Netdata or a cron script + email | Disk > 80%, RAM > 90%, CPU > 85% for 10 min |
| TLS certificate | Certbot timer + uptime monitor's SSL check | < 14 days to expiry |
| Payments | `reconcile_payments` job (every 15 min) | A payment captured at Razorpay without a paid order, or the reverse |
| Webhooks | Logged invalid-signature / failed events | Any invalid signature. More than 5 failures per hour |
| Backups | Backup script writes a success marker. A healthcheck ping (healthchecks.io) | Last backup is older than 26 h |
| Scheduled jobs | Each timer pings healthchecks.io | A job has not run on time |
| Business health | Admin dashboard alerts (already in the UI) | Pending seller approvals, return escalations, COD refund queue, low stock |

Alerts go to the on-call email plus a WhatsApp/Telegram group (via the monitoring tool's integration).

## 2. Logging

- Django logs JSON lines with a request id to stdout → journald (portability rule P8). Nginx logs access/error in its own format.
- Logs are kept for 30 days on the server (journald `MaxRetentionSec`, logrotate for Nginx).
- What must never be logged is listed in [SECURITY_GUIDELINES §8](SECURITY_GUIDELINES.md#8-logging--monitoring).
- The business audit trail is the `audit_logs` table, kept permanently and not in log files.

## 3. Backups & recovery

| Data | Method | Frequency | Retention | Where |
|------|--------|-----------|-----------|-------|
| PostgreSQL | `pg_dump -Fc`, encrypted (age/GPG) | Daily 02:30 IST | 7 daily, 4 weekly, 12 monthly | Off-site object storage (an AWS S3 bucket in ap-south-1 is recommended; it also prepares for migration) |
| PostgreSQL (once real orders are flowing) | Continuous WAL archiving (wal-g / pgBackRest) | Continuous | 14 days point-in-time | Same bucket |
| Media | Cloudinary (provider-redundant) + weekly sync of originals to the bucket | Weekly | Latest + 30 days | Same bucket |
| Server | VPS provider snapshot | Weekly | 2 snapshots | Provider |
| Config | `deployment/` in git. Env values in the password manager | On change | — | Git + vault |

**Targets:** RPO (maximum data loss) is 24 h with daily dumps, or about 5 min after WAL archiving is on. RTO (time to restore) is 2–4 h onto a fresh VPS using the runbook.

**Restore test:** every month, restore the latest dump into a scratch database, run the row-count/ledger checks, and record the result in the ops log. `deployment/scripts/restore_db.sh` is the documented procedure.

## 4. Performance targets & practices

| Area | Target / practice |
|------|-------------------|
| Storefront | LCP < 2.5 s on 4G; JS for the first page < 200 kB gzip (seller/admin are already split into lazy chunks); images through Cloudinary transforms (WebP/AVIF, sized) |
| API | p95 < 300 ms for listing/detail and < 800 ms for checkout; paginated lists (max 50) |
| Database | Indexes as in DATABASE_SCHEMA; `select_related`/`prefetch_related` (no N+1, checked in tests with `django_assert_max_num_queries`); `pg_stat_statements` reviewed monthly |
| Nginx | gzip/brotli, `Cache-Control: immutable` for hashed assets, `no-cache` for `index.html`, HTTP/2 |
| Caching | Home page ads, category tree and settings cached (DB cache now, Redis later) |
| Load test | k6 script before launch: 50 concurrent shoppers browse + check out on staging |
| When to scale | Follow the triggers in [SYSTEM_ARCHITECTURE §8](SYSTEM_ARCHITECTURE.md#8-scaling-path-small--large-marketplace) |

## 5. Maintenance schedule

| When | Task | Owner |
|------|------|-------|
| Daily (automatic) | Backups, reconciliation, order expiry, settlement eligibility, health checks | System |
| Daily (5 min) | Read alerts. Clear the admin dashboard queues (approvals, escalations, COD refunds) | Client ops |
| Weekly | Process seller settlements/payouts. Review Sentry. Merge Dependabot updates on staging → production | Client ops / developer |
| Monthly | `apt upgrade` + reboot window (unattended-upgrades handles security patches daily). Restore test. Review disk/DB growth and slow queries. GST/TCS/TDS reports for the CA | Developer / client finance |
| Quarterly | Rotate secrets (DB password, Django `SECRET_KEY` with fallback, Razorpay webhook secret). Review user/admin access. Dependency major upgrades. Review costs | Developer + client |
| Yearly | Domain/SSL renewals check, Postgres minor/major upgrade plan, security review/pentest | Developer + client |

## 6. Incident response (short runbook)

1. **Acknowledge** the alert in the group and note the time.
2. **Assess:** is the site down? Are payments affected? Is data at risk?
3. **Contain:** turn maintenance mode on if payments or data are at risk, and roll back to the previous tag if a deploy caused it.
4. **Fix and verify** with the smoke test and a reconciliation run.
5. **Communicate:** tell the client. If personal data was involved, follow the DPDP breach steps in [SECURITY_GUIDELINES](SECURITY_GUIDELINES.md).
6. **Post-mortem** within 48 h: cause, fix, and how to prevent it. Add an issue for each follow-up.
