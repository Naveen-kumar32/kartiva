# Deployment Guide

Status: **target topology only (Phase 1)**. The full step-by-step runbook with every command in order is written and tested in **Phase 9**.

## 1. Target topology (MVP)

```
Internet ──443──▶ Nginx (Let's Encrypt TLS)
                    ├── /            → /var/www/marketplace/frontend/dist (SPA, index.html fallback)
                    ├── /api/        → unix:/run/gunicorn.sock (Django)
                    ├── /static/     → /var/www/marketplace/backend/staticfiles (Django admin assets)
                    └── /<secret-admin-path>/ → Django admin (staff only)
Gunicorn (systemd: gunicorn.socket + gunicorn.service), user "marketplace"
PostgreSQL 16 (localhost only)
systemd timers: expire-orders (2 min), reconcile-payments (15 min), settlement-eligibility (hourly), db-backup (daily)
```

## 2. Server baseline

- Ubuntu 24.04 LTS, 4 vCPU / 8 GB RAM / 80 GB SSD (adjust after SRS Q13).
- Python 3.12, Node.js 22 LTS (build only), PostgreSQL 16, Nginx, Certbot.
- Deploy user `marketplace` with no sudo. Code in `/var/www/marketplace`. Env file `/etc/marketplace/backend.env` (owner root:marketplace, mode 640).

## 3. Phase 9 runbook outline (to be completed)

1. Create the VPS, point the DNS A/AAAA records, first SSH login
2. Create a sudo admin user, add SSH keys, disable password and root login
3. UFW (22, 80, 443), fail2ban, unattended-upgrades, timezone, swap
4. Install Python, Node.js, PostgreSQL, Nginx, Certbot
5. Create the Postgres database and user
6. Clone the repo, create the venv, install requirements, write the env file
7. `migrate`, `collectstatic`, create the admin user, seed categories and settings
8. Build the frontend (`npm ci && npm run build`)
9. Install the Gunicorn socket/service and the timers from `deployment/systemd/`
10. Install the Nginx site from `deployment/nginx/`, test, reload
11. Certbot TLS + auto-renew check
12. Register the Razorpay live webhook URL + secret
13. Backups: script, cron/timer, off-site copy, test restore
14. Logs (journald, Nginx), log rotation, uptime monitoring
15. `deployment/scripts/deploy.sh` for zero-surprise updates (pull → install → migrate → build → restart)

## 4. AWS migration path

Full plan, portability rules, data transfer and rollback: **[AWS_MIGRATION.md](AWS_MIGRATION.md)**. Monitoring and backups: [OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md). Summary: the app is stateless apart from Postgres and external media, so the move is: RDS ← `pg_dump`, EC2/ECS ← same Gunicorn setup, S3 ← `MEDIA_STORAGE=s3`, SES ← SMTP settings.
