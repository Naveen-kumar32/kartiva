# Engineering Workflow: Version Control & Team Collaboration

## 1. Repository

- **One Git repository** (monorepo) holds `frontend/`, `backend/`, `docs/`, `deployment/` and the shared root files.
- Hosted on **GitHub, as a private repo in an organisation owned by the client.** Developers are invited as members, which makes handover a permissions change rather than a transfer.
- `.gitignore` already excludes secrets (`.env*`), builds, dependencies, dumps and screenshots. **Never commit secrets.** If one is committed by mistake, rotate it immediately (rewriting history is not enough).

## 2. Branching (trunk-based)

| Branch | Purpose | Rules |
|--------|---------|-------|
| `main` | Always releasable. Production deploys from **tags** on `main` | Protected: PR only, 1 approving review, CI green, no force-push |
| `feat/<short-name>` | New feature | Short-lived (≤ 3 days), rebased on `main` |
| `fix/<short-name>` | Bug fix | |
| `hotfix/<short-name>` | Urgent production fix | Branched from the latest tag, merged to `main`, tagged as a patch |
| `docs/…`, `chore/…` | Docs, tooling | |

## 3. Commits

Conventional Commits: `feat(seller): bulk stock update`, `fix(checkout): COD limit check`, `docs: AWS migration plan`, `chore(deps): bump vite`. Keep each commit to one logical change, and make sure each commit builds.

## 4. Pull requests

Every PR uses `.github/pull_request_template.md`:

- what changed and why, plus screenshots for UI changes
- tests added or updated
- **security checklist:** no secrets, seller scoping intact, prices/payment status computed on the server
- **portability checklist** ([AWS_MIGRATION.md §1](AWS_MIGRATION.md#1-portability-rules-apply-in-every-phase)): env-based config, no local disk writes, migrations included
- `DEVELOPMENT_PROGRESS.md` updated when a checklist item is finished

Reviewers check correctness, the security rules and the Day-1 conventions (barrels, `en.js` A→Z, Formik + Yup factories, no API imports in slices).

## 5. Continuous integration (GitHub Actions)

`.github/workflows/ci.yml` runs on every PR and every push to `main`:

| Job | Steps | Phase |
|-----|-------|-------|
| frontend | `npm ci` → `npm run lint` (oxlint + `en.js` order) → `npm run build` | active now |
| e2e | start `vite preview` → Playwright smoke test | active now |
| backend | `pip install` → `ruff` → `manage.py makemigrations --check` → `pytest` with Postgres service → `pip-audit` | added in Phase 3 |
| docker | build `backend/Dockerfile` (portability rule P12) | added in Phase 3 |

Dependabot opens weekly dependency PRs (npm, pip, GitHub Actions).

## 6. Environments

| Environment | Where | Data | Deploys |
|-------------|-------|------|---------|
| Local | Developer laptop | Mock data (`VITE_DATA_MODE=mock`) or local Postgres | — |
| Staging | `staging.<domain>`: small separate VPS, or the same VPS with a separate DB, user and env | Anonymised copy of production or seed data. Razorpay **test** keys | Automatically on merge to `main` (from Phase 9) |
| Production | Main VPS | Real data. Razorpay **live** keys | Manually, from a version tag (`v1.4.0`) using `deployment/scripts/deploy.sh` |

## 7. Releases

- Semantic versioning: `vMAJOR.MINOR.PATCH`. `CHANGELOG.md` is updated in the release PR.
- Release steps: tag → deploy to production → smoke test → note it in the CHANGELOG. `/api/v1/health/` reports the deployed version.
- Database migrations must be backward-compatible for one release (expand → migrate data → contract), so a deploy can be rolled back by redeploying the previous tag.

## 8. Team collaboration

- **Tasks:** GitHub Issues + Projects board (Backlog → In progress → Review → Done), labelled by phase and area (`seller`, `admin`, `payments` …).
- **Definition of done:** code + tests + lint/CI green + docs/progress updated + reviewed + demoed on staging.
- **Client feedback:** collected per phase demo as issues. Decisions are recorded in the decisions log of `DEVELOPMENT_PROGRESS.md`.
- **Secrets sharing:** use a password manager (Bitwarden/1Password organisation vault). Never share secrets over chat or email.
