# Kartiva backend (Django + DRF + PostgreSQL)

## Run locally
1. **Start PostgreSQL** — open **Postgres.app** (or `pg_ctl` it). Local DB: `kartiva` / user `kartiva` (see `.env`).
2. ```bash
   cd backend
   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
   cp .env.example .env                                                  # first time, then edit
   .venv/bin/python manage.py migrate
   .venv/bin/python manage.py seed_demo --reset                          # load the demo dataset (re-run any time to reset)
   .venv/bin/python manage.py runserver 127.0.0.1:8000
   ```
3. In another terminal: `cd frontend && npm run dev:api` → http://localhost:5173 (Vite forwards `/api` to Django).

Demo logins: `buyer@ / rahul@ / ananya@ / vikram@`, sellers `seller@ wholesale@ chefpro@ sports@ motors@ gadgets@ urbanthread@ luxelane@ homecraft@ spiceroute@ glowup@ fitzone@`, `admin@` — all `@kartiva.demo`, password `Demo@123`.

## Layout
| App | What |
|---|---|
| `apps/core` | DocModel base, platform settings, audit log, notifications, email/SMS outbox, errors, request-id logging, health + bootstrap endpoints, `seed_demo` |
| `apps/accounts` | Users (email login, roles), JWT login/refresh (httpOnly cookie)/logout, sign-up (buyer + seller), lockout, password reset |
| `apps/catalog` | Categories, stores, products/variants, reviews, stock movements — public catalogue API |
| `apps/marketing` | Ad slots, ads, sponsored placements |
| `apps/orders` | Orders + seller sub-orders, checkout, returns, refunds, ledger, settlements, commission (`services.py` = order engine) |
| `apps/market` | Enquiries, quote requests (RFQ), messages, support tickets, plans, KYC, CMS, wishlist, notifications, outbox |
| `apps/sellerhub` | `/api/v1/seller/…` Seller Hub endpoints (scoped to the seller's store) |
| `apps/adminpanel` | `/api/v1/admin-api/…` admin endpoints |

**Data model:** every table keeps the full record as JSON (`data`, the same shape the frontend uses) plus indexed columns for lookups and filters (see `apps/core/docmodel.py`, decision AD-27).

## Tests
`.venv/bin/pytest` (uses a throwaway `test_kartiva` database).

## Deploy (Render + Neon)
See `render.yaml` (backend service block) and `docs/DEPLOYMENT_GUIDE.md`. Set `DATABASE_URL` to the Neon **pooled** connection string with `sslmode=require`.
