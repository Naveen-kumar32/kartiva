# Project Overview

## 1. What we are building

**Kartiva** (working brand): a **multi-vendor marketplace**. The platform owner (the client) sells their own products at launch, and other GST-registered businesses can register as sellers, get approved, and list products with variants. Buyers can buy from several sellers in one checkout and pay online or by cash on delivery. Each seller ships with their own delivery methods. The platform earns **commission on every sale** and **advertising revenue** from ad spaces (a hero carousel, banners and sponsored products).

Three roles:

| Role | Summary |
|------|---------|
| **Buyer** | Browses, searches, buys, tracks orders, reviews products |
| **Seller** | Runs one store: products, stock, and their own share of customer orders |
| **Admin** | Runs the platform: approvals, moderation, orders, payments, commission, settlements, content |

The client's own catalogue is modelled as **one more seller store** owned by the platform. There is no special code path for "first-party" products.

## 2. Guiding principles

1. **The backend is the source of truth.** Prices, totals, stock, roles, seller IDs and payment status are always computed or checked on the server.
2. **Seller isolation by construction.** Every seller query is scoped to `request.user`'s store at the queryset level, so other sellers' rows are never fetched.
3. **Money is exact and immutable.** Decimal arithmetic. Order lines snapshot price, name and address at purchase time.
4. **External services sit behind one file each.** Payment gateway, media storage and email can each be swapped (mock → real, Cloudinary → S3) by changing one service module.
5. **No extra infrastructure until it is needed.** One Django monolith, one PostgreSQL database, one SPA. No microservices, no Celery or Redis in the MVP. Scheduled jobs run as management commands on systemd timers.
6. **Portable by default.** Config from env, stateless app servers, external services behind adapters, Postgres only. A future move from the VPS to AWS is config + data copy ([AWS_MIGRATION.md](AWS_MIGRATION.md)).

## 3. Repository layout

```
ecommerce/                      <- repository root (common files live here)
├── frontend/                   React + Vite SPA
├── backend/                    Django + DRF API
├── docs/                       This documentation
├── deployment/                 nginx/, systemd/, scripts/ (Phase 9)
├── .github/                    CI workflow, Dependabot, PR template
├── .editorconfig
├── .gitignore
└── README.md
```

The full folder trees are in [SYSTEM_ARCHITECTURE.md §6](SYSTEM_ARCHITECTURE.md#6-project-folder-structure).

## 4. Coding conventions (from the team's Day-1 notes)

These rules apply in every phase.

### Frontend

| Rule | Detail |
|------|--------|
| **Barrel exports** | Every folder under `src/` has an `index.js` that re-exports its public members. Imports look like `import { ProductCard, Button } from "@/components";` |
| **No hard-coded strings** | All UI text lives in `src/locales/en.js`, grouped by section (`AUTH`, `CART`, `CHECKOUT` …), with **keys sorted A→Z** |
| **No magic route strings** | All paths live in `src/locales/routes.js` |
| **One Axios instance** | `src/config/axiosInstance.js` (baseURL, timeout, headers, interceptors). Endpoint paths live in `src/config/apiConfig.js` |
| **API layer** | `src/api/*Api.js` holds plain functions that call the Axios instance. Components never call Axios directly |
| **Forms** | Formik (`useFormik`) + Yup. Schemas are factory functions in `src/validators/` that take the `en.js` validation messages: `createLoginSchema(VALIDATION)` |
| **Destructure Formik** | Keeps JSX clean (see Day-1 notes §4) |
| **State** | Redux Toolkit. **Slices never import the API layer**, which avoids the circular-import bug from Day-1 notes §21. Components call the API, then dispatch plain actions |
| **Toasts** | `react-toastify`, with one `<ToastContainer theme="light">` in `App.jsx` and `successToast` / `errorToast` helpers in `src/utils/` |
| **Error messages** | `err.response?.data?.detail ?? EN.ERRORS.FALLBACK`. The backend always returns a `detail` field (see API docs) |
| **Import order** | 1. React/core, 2. external libraries, 3. internal (`@/…`), 4. styles/images/data |
| **Env** | `VITE_API_URL`, `VITE_DATA_MODE=mock\|api` (mock data until the backend is ready), `VITE_RAZORPAY_KEY_ID` (public key only) |
| **Role routing** | `ProtectedRoute requiredRoles={[...]}`, `getDashboardRouteForRole()` in `src/utils/authRedirect.js` |
| **E2E** | Playwright scripts with screenshots and console-error capture |

### Backend

| Rule | Detail |
|------|--------|
| **Barrel packages** | Larger apps use `models/`, `serializers/`, `views/` and `services/` packages with **one class per file**, re-exported from `__init__.py`. Usage: `from apps.catalog.models import Product, Category` |
| **Thin views, fat services** | Business rules (checkout, payment capture, cancellation, settlement) live in `services/`. Views validate input and call one service function |
| **Shared permissions** | `apps/core/permissions.py` provides `IsBuyer`, `IsSeller`, `IsApprovedSeller`, `IsAdmin`. This is the DRF equivalent of the `require_roles()` dependency in Day-1 notes §17 |
| **Ownership scoping** | Seller viewsets override `get_queryset()` to filter by `store__owner=request.user` (Day-1 notes §20) |
| **Extend, don't rewrite** | New features are added as new modules or files and wired in. Working modules are not rewritten (Day-1 notes §16) |
| **Mockable integrations** | `PAYMENT_GATEWAY=mock\|razorpay`, `MEDIA_STORAGE=local\|cloudinary`, `EMAIL_BACKEND=console\|smtp` (Day-1 notes §19) |

## 5. Phase plan

| # | Phase | Status |
|---|-------|--------|
| 1 | Requirements and architecture | Done. Rev 2 includes the client's answers |
| 2 | UI/UX and frontend foundation (mock data) | Client demo ready |
| 3 | Backend foundation | Not started |
| 4 | Seller system | Not started |
| 5 | Buyer system | Not started |
| 6 | Orders and payments | Not started |
| 7 | Admin system | Not started |
| 8 | Testing hardening | Not started (tests are written in every phase) |
| 9 | VPS deployment | Not started |

Live status: [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md).
