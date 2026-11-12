# AWS Migration Readiness

Status: **design rules active from Phase 3.** Kartiva launches on one Ubuntu VPS. These rules make sure the app and its data can move to AWS later **by changing settings and copying data, without rewriting code.**

## 1. Portability rules (apply in every phase)

Every pull request must keep these true. They are also listed in the PR template.

| # | Rule | Why it matters for AWS |
|---|------|------------------------|
| P1 | **All config comes from environment variables** (`DATABASE_URL`, `MEDIA_STORAGE`, `EMAIL_*`, `CACHE_URL`, …). There are no hard-coded hosts, paths, IPs or domains. | The same build runs on the VPS, on ECS and on staging. Only the env changes |
| P2 | **The app servers are stateless.** Nothing is written to local disk except temp files. Uploads go through `core/storage`, generated PDFs/CSVs are streamed or saved through `core/storage`, and sessions use JWT. | You can run 2+ servers behind a load balancer, and replacing a server loses nothing |
| P3 | **Each external service sits behind one adapter:** storage (Cloudinary → S3), email (SMTP → SES), payments (Razorpay), cache (DB → Redis/ElastiCache). | Switching provider means a new adapter class plus one env var |
| P4 | **Media rows store the provider-neutral `storage_key`.** The `url` column is a derived cache that can be rebuilt from the key. Order snapshots keep `image_key` next to `image_url`. | Media moves to S3 with a copy script plus a URL rebuild, with no broken images in old orders |
| P5 | **PostgreSQL only, standard features only** (Postgres 16 plus `pg_trgm`, which RDS supports). No server-local extensions, no file-based SQLite anywhere. | `pg_dump` / AWS DMS restore straight into RDS |
| P6 | **Schema changes go only through Django migrations**, which are committed and reviewed. No manual SQL on production. | The same migrations rebuild the schema on RDS |
| P7 | **Scheduled jobs are Django management commands** (`expire_orders`, `reconcile_payments`, …). systemd timers only *call* them. | On AWS, EventBridge Scheduler / ECS scheduled tasks call the same commands |
| P8 | **Logs go to stdout/journald as JSON**, one line per event with a request id. The app never writes its own log files. | CloudWatch Logs collects them unchanged |
| P9 | **There is a health endpoint**, `GET /api/v1/health/` (DB check, version, no secrets). | ALB / ECS health checks and uptime monitors use it |
| P10 | **Times are stored in UTC** (`USE_TZ=True`) and shown in IST in the UI. | No timezone bugs when servers move regions |
| P11 | **IDs:** use internal integer PKs plus public, non-guessable references (order number, UUID idempotency keys). Never depend on DB sequence values in URLs shared outside. | Data can be merged or replicated safely |
| P12 | **Container-ready:** keep a `backend/Dockerfile` and a `docker-compose.yml` (dev only) from Phase 3, even though the VPS runs native systemd (AD-13). | The same image runs on ECS Fargate / App Runner. CI also tests the image |
| P13 | **The frontend is a static build** (`npm run build` → `dist/`) and talks to the API through `VITE_API_URL`. | It moves to S3 + CloudFront unchanged |
| P14 | **Secrets are only in the env file on the server**, never in git. | They move into AWS Secrets Manager / SSM Parameter Store one key at a time |

## 2. Service mapping

| Today (VPS) | AWS equivalent | What changes |
|-------------|----------------|--------------|
| Nginx + Let's Encrypt | ALB + ACM certificate (+ CloudFront) | Infra only |
| Gunicorn on systemd | ECS Fargate (Docker image from P12) or EC2 with the same systemd units | Infra only |
| PostgreSQL 16 on the VPS | RDS for PostgreSQL 16 (Multi-AZ when needed) | `DATABASE_URL` |
| Cloudinary | S3 + CloudFront (or **keep Cloudinary**: it works from anywhere) | `MEDIA_STORAGE=s3` + `S3Storage` adapter + media copy (§4) |
| SMTP (Zoho/Google) | Amazon SES | `EMAIL_*` settings |
| systemd timers | EventBridge Scheduler → ECS run-task | Infra only (same commands, P7) |
| DB cache backend | ElastiCache (Redis) | `CACHE_URL` |
| journald + logrotate | CloudWatch Logs | Infra only (P8) |
| `/etc/marketplace/backend.env` | Secrets Manager / SSM Parameter Store | Infra only |
| Nightly `pg_dump` to off-site storage | RDS automated backups + snapshots (keep the `pg_dump` export too) | Infra only |
| UptimeRobot / Sentry | Keep, or add CloudWatch alarms | None |

Region: **ap-south-1 (Mumbai)**, which gives low latency for Indian buyers and keeps data in India.

## 3. Migration plan (when the business decides)

**Rehearse everything on a staging copy first.**

1. **Prepare (1–2 weeks before):** create the AWS account in the *client's* name with MFA on root and IAM users. Write the infra as code (Terraform or CDK) for VPC, RDS, ECS, ALB, S3, CloudFront and SES. Verify the SES domain and leave the SES sandbox. Issue the ACM certificate.
2. **Lower the DNS TTL** to 60–300 s at least 48 hours before cutover.
3. **Rehearsal:** restore last night's dump into RDS, deploy the image, point a test subdomain at it, and run the Playwright smoke test and the reconciliation report against it.
4. **Data transfer (pick one):**
   - **Short maintenance window (simplest, recommended up to tens of GB):** turn on maintenance mode → `pg_dump -Fc` → copy to S3 → `pg_restore` into RDS → run the row-count and checksum checks in §5.
   - **Near-zero downtime:** AWS DMS full load + ongoing replication (CDC) from the VPS Postgres into RDS, then cut over once replication lag is ~0.
5. **Media:** keep Cloudinary (no work needed), or run `manage.py migrate_media --to s3`. It copies every `storage_key` to S3, verifies the size/hash, and then rebuilds the `url` columns (P4).
6. **Cutover:** switch on maintenance mode → final sync → update the DNS → register the new Razorpay webhook URL → smoke test → switch off maintenance mode.
7. **Keep the VPS read-only for 7–14 days** as a rollback target, then take a final backup and decommission it.

## 4. Data transfer checklist

- [ ] Same Postgres major version on both sides (16), and `pg_trgm` is enabled on RDS
- [ ] Row counts match for every table, and money totals match (sum of `orders.total`, ledger balances per seller)
- [ ] The latest order id/number matches, and sequences are reset (`pg_restore` handles this, but verify)
- [ ] A sample of 50 media keys opens from the new storage
- [ ] Razorpay webhooks reach the new URL (send a test event from the dashboard)
- [ ] Emails send from SES (SPF, DKIM, DMARC pass)
- [ ] Scheduled jobs ran at least once on AWS
- [ ] The backup on AWS has been restored once (an untested backup is not a backup)

## 5. Rollback

Until the VPS is decommissioned, rollback is: maintenance mode → point the DNS back → replay any orders taken on AWS (exported by `created_at > cutover`) → switch maintenance mode off. Because of this, payments must not be captured during the cutover window.

## 6. Rough cost guide (to be re-estimated at migration time)

Today, one VPS costs about ₹2–5k per month. A minimal AWS setup (Fargate 2 tasks, RDS db.t4g.small, ALB, S3/CloudFront, SES) is roughly ₹10–20k per month. AWS is worth it when the business needs high availability, autoscaling or a managed database, not before.
