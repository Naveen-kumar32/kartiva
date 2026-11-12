#!/usr/bin/env bash
# Nightly encrypted PostgreSQL backup → off-site bucket (template, Phase 9; see docs/OPERATIONS_GUIDE.md §3).
# Needs: pg_dump, age (encryption), aws CLI (S3 ap-south-1 or any S3-compatible store).
# Env (from /etc/kartiva/backup.env): DATABASE_URL, BACKUP_BUCKET, AGE_RECIPIENT, HEALTHCHECK_URL
set -euo pipefail
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
FILE="/var/backups/kartiva/kartiva-${STAMP}.dump.age"
mkdir -p /var/backups/kartiva
pg_dump --format=custom --no-owner "${DATABASE_URL}" | age -r "${AGE_RECIPIENT}" > "${FILE}"
aws s3 cp "${FILE}" "s3://${BACKUP_BUCKET}/db/daily/$(basename "${FILE}")" --only-show-errors
find /var/backups/kartiva -name '*.age' -mtime +3 -delete      # keep 3 days locally, retention handled by bucket lifecycle
curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL}" > /dev/null     # alert if this stops arriving (healthchecks.io)
echo "backup ok: ${FILE}"
