# System Architecture

## 1. High-level view

A **modular monolith**: one Django API and one React SPA behind one Nginx, all on the same domain.

```mermaid
flowchart LR
    subgraph Client
        B[Browser<br/>React SPA]
    end
    subgraph VPS["Ubuntu VPS"]
        N[Nginx<br/>TLS, static files, gzip,<br/>rate limits, security headers]
        G[Gunicorn<br/>Django + DRF]
        P[(PostgreSQL)]
        T[systemd timers<br/>expire orders / reconcile /<br/>backups]
    end
    C[(Cloudinary<br/>images)]
    R[Razorpay]
    E[SMTP provider]

    B -- "https://shop.example.com/*" --> N
    N -- "/ → frontend/dist" --> B
    N -- "/api/* → 127.0.0.1:8000" --> G
    G --> P
    T --> G
    G -- "signed uploads, delete" --> C
    B -- "images via CDN URLs" --> C
    B -- "Checkout widget" --> R
    G -- "create order, fetch payment, refund" --> R
    R -- "webhooks /api/v1/webhooks/razorpay/" --> N
    G --> E
```

**Why a single domain:** the SPA and API share one origin (`/` and `/api/`), so production needs no CORS, and the refresh-token cookie can be `SameSite=Strict`.

## 2. Backend layering

```
HTTP request
  → urls.py
  → View / ViewSet          parses input with a Serializer, checks permission classes
  → services/*.py           business rules, transactions, state transitions (ALL writes that matter)
  → models/*.py             data + constraints (no business workflows here)
  → integrations/*          payment gateway, storage, email adapters (swappable)
```

- **Selectors** (read-heavy query builders, e.g. product search) live in `selectors.py` next to services.
- Services take plain arguments and return model instances, so they can be called from views, webhooks, management commands and tests in the same way.

## 3. Key flows

### 3.1 Authentication

```mermaid
sequenceDiagram
    participant UI as React
    participant API as Django
    UI->>API: POST /auth/login {email, password}
    API-->>UI: 200 {access, user{id,name,role,...}} + Set-Cookie refresh (httpOnly, Secure, SameSite=Strict, Path=/api/v1/auth/)
    Note over UI: access + user kept in Redux (memory).<br/>Only non-secret user profile persisted for UI hydration.
    UI->>API: GET /orders/ (Authorization: Bearer access)
    API-->>UI: 401 (access expired)
    UI->>API: POST /auth/refresh (cookie sent automatically)
    API-->>UI: 200 {access} + rotated refresh cookie (old one blacklisted)
    UI->>API: retry original request
```

- Access token lifetime is 15 min. Refresh token lifetime is 7 days, rotating and blacklisted on use and on logout.
- The Axios response interceptor makes **one** refresh call even when several requests fail together (a shared promise), then retries them. If the refresh fails, it dispatches `clearCredentials()` and redirects to login.
- **Avoiding the circular import** (Day-1 notes §21): `axiosInstance.js` does not import the store. `main.jsx` calls `setupInterceptors(store)` once after both modules have loaded.

### 3.2 Checkout and payment

```mermaid
sequenceDiagram
    autonumber
    participant UI as React
    participant API as Django
    participant DB as PostgreSQL
    participant RZ as Razorpay

    UI->>API: POST /checkout/ {address_id, source, shipping_choices{store_id: method_id}, payment_method:"online"}<br/>Idempotency-Key: uuid
    API->>DB: BEGIN
    API->>DB: re-price items from DB, group by store, compute shipping/commission
    API->>DB: conditional stock decrement per product (ordered by id)
    API->>DB: INSERT order (pending_payment), seller_orders, order_items, inventory_movements
    API->>RZ: create order {amount_paise, receipt=order_number}
    API->>DB: INSERT payment (created, gateway_order_id)
    API->>DB: COMMIT
    API-->>UI: {order_number, razorpay_order_id, amount, key_id}
    UI->>RZ: open Checkout
    RZ-->>UI: handler {payment_id, order_id, signature}
    UI->>API: POST /payments/verify/
    API->>API: HMAC verify signature
    API->>RZ: GET payment → confirm status=captured & amount
    API->>DB: capture_payment() [SELECT … FOR UPDATE, idempotent]
    API-->>UI: 200 order confirmed
    RZ-->>API: webhook payment.captured (may arrive before or after verify)
    API->>DB: dedupe on event id → capture_payment() (no-op if already done)
```

**Duplicate prevention, in layers:**

1. `Idempotency-Key` header with a unique `(user, idempotency_key)` constraint on orders. A retry returns the same order.
2. The checkout button is disabled while the request is in flight.
3. `payments.gateway_order_id` and `payments.gateway_payment_id` are unique.
4. `payment_events.gateway_event_id` is unique, so a replayed webhook is ignored.
5. `capture_payment()` locks the payment row and returns early if it is already `captured`.

Gateway call failure: if creating the Razorpay order fails, the whole transaction rolls back (stock is untouched) and the user sees a retry message. The external call is placed last inside the transaction to keep the lock window small. The transaction stays short because there is a 10 s HTTP timeout.

### 3.3 Inventory consistency

| Moment | Action |
|--------|--------|
| Add to cart | **No** reservation. Only a stock availability check |
| Checkout (order created) | **Reserve**: `UPDATE product_variants SET stock_quantity = stock_quantity - :q WHERE id = :id AND stock_quantity >= :q`. Zero rows updated means out of stock and the whole checkout rolls back. Rows are locked in variant-id order to avoid deadlocks. A DB `CHECK (stock_quantity >= 0)` is the last line of defence. `products.total_stock` / `min_price` are refreshed in the same transaction |
| Payment captured | Nothing to change in stock. Order becomes `confirmed` and sub-orders become `confirmed` (now visible to sellers). Purchased items are removed from the cart |
| Payment failed / 15-min expiry | **Release**: stock is restored, order becomes `expired` or `payment_failed` |
| Sub-order cancelled (before shipping) | **Release** that sub-order's stock and start a refund |
| Late capture after expiry | Try to re-reserve. If that fails, auto-refund and notify |

Every change writes an `inventory_movements` row (delta, reason, reference), so stock can always be explained and audited.

### 3.4 Order state machines

```mermaid
stateDiagram-v2
    direction LR
    state "Parent order" as P {
        [*] --> pending_payment
        pending_payment --> confirmed: payment captured
        pending_payment --> payment_failed: payment.failed
        pending_payment --> expired: 15 min timeout
        confirmed --> completed: all sub-orders terminal
        confirmed --> cancelled: all sub-orders cancelled
    }
```

```mermaid
stateDiagram-v2
    direction LR
    state "Seller sub-order" as S {
        [*] --> pending: created at checkout (hidden from seller)
        pending --> confirmed: payment captured
        confirmed --> processing: seller
        processing --> shipped: seller (carrier + tracking required)
        shipped --> delivered: seller / admin (COD → cash collected)
        shipped --> undelivered: seller (COD refused / failed) → restock
        confirmed --> cancelled: buyer / seller / admin
        processing --> cancelled: buyer / seller / admin
    }
```

A COD order skips `pending_payment`: the order is created `confirmed` / `cod_pending` and sub-orders start at `confirmed`.
Returns run as their own state machine on `return_requests` (§3.9), so a sub-order stays `delivered` while partial returns happen.
Allowed transitions live in one table in `apps/orders/services/transitions.py`. Every transition is validated against it and logged in `order_status_history`.

### 3.5 Commission, ledger and settlement (manual payouts, MVP)

Because sellers collect COD cash themselves while the platform collects online payments, a simple "pay the seller X" model breaks. Each seller therefore has a **signed ledger** (`seller_ledger_entries`):

1. At checkout, each order line snapshots its `commission_rate`, resolved as **store override → category rule → global default**.
2. When a delivered sub-order's return window closes with no open return, `post_sub_order_to_ledger()` writes: `+sale`, `+shipping`, `−commission`, `−commission_gst`, `−tcs`, `−tds`, and for COD also `−cod_collected_by_seller`. Refunds (`−refund`) and daily ad costs (`−ad_charge`) post as they happen.
3. Admin clicks **Generate settlement** for a store. All unsettled entries plus the opening balance are summed and frozen.
4. **Approve** → the platform's commission tax invoice is issued. Then:
   - net > 0 → admin pays by bank transfer and records the UTR → a `payout` entry is written, status `paid`
   - net ≤ 0 → `carried_forward` (it offsets future online sales). If a mainly-COD seller owes money over a threshold, the admin requests payment (v1: manual)
5. The seller sees the same ledger and settlements in their Earnings page.

**Future automation:** Razorpay Route (linked accounts) or RazorpayX Payouts can replace the manual payout. It is a new `integrations/payouts/` adapter, and the ledger stays the same.

### 3.8 COD flow

1. Checkout checks COD eligibility (DATABASE_SCHEMA §3). The order is created `confirmed`/`cod_pending` and stock is reserved. There is no gateway call.
2. Each seller ships their sub-order. On `delivered`, `cod_collected_at` is set. When every sub-order is collected, the order becomes `cod_collected`.
3. Refused → `undelivered` → stock is restored. The admin sees a refusal count per buyer and can set `cod_blocked`.
4. A refund after collection (return) goes to the **COD refunds queue**. The admin transfers to the buyer's UPI/bank and records the UTR. The seller ledger is debited.

### 3.9 Returns flow

```mermaid
stateDiagram-v2
    direction LR
    [*] --> requested: buyer (within window, returnable items)
    requested --> approved: seller
    requested --> rejected: seller (reason)
    rejected --> approved: admin (escalation)
    approved --> in_transit: seller enters return tracking
    in_transit --> received: seller (restock yes/no)
    received --> refunded: system → gateway refund or COD queue
    refunded --> closed
    requested --> cancelled: buyer
```

When refunded: `order_items.returned_quantity` is updated, a credit note is issued, a ledger `refund` entry is posted (if already posted to the ledger), and stock is restocked if chosen.

### 3.10 GST & invoicing

- `apps/invoicing/services/tax.py` holds `split_gst(line_total, rate, interstate)`, the single source of tax maths, with tests at slab boundaries.
- `issue_document(doc_type, …)` locks `document_sequences` for (issuer, type, FY) and produces numbers like `KTV/26-27/000123` for the platform or `<store prefix>/26-27/000045` for sellers (≤ 16 chars). It freezes the lines into `tax_documents` and renders the PDF (WeasyPrint, from an HTML template) into **private** storage. Downloads use short-lived signed URLs.
- Monthly reports produce GST summaries per seller and platform, plus the TCS/TDS amounts to deposit. All rates are admin-configurable because rules change. **The client's CA signs off before launch.**

### 3.11 Ads serving

- `GET /ads/?slots=home_hero_carousel,home_mid_banner&category=12` returns, per slot, up to `max_items` live ads (status active, inside the schedule, budget left, targeting matches), ordered by priority, ties rotated randomly. **House ads fill the rest.** The result is cached per slot and category for 60 s.
- The frontend `<AdSlot slotKey="…"/>` component renders a carousel, banner or sponsored product cards, reserving the slot's aspect ratio (no layout shift). Sponsored products carry a visible **Sponsored** label.
- Impressions: an `IntersectionObserver` fires when ≥ 50% of the ad is visible for ≥ 1 s. Ids are batched and sent with `navigator.sendBeacon` to `/ads/impressions/`. Counts are upserted into `ad_daily_stats`, de-duplicated per session per ad per page view.
- Clicks: links go through `/ads/{id}/click/` → the click is counted → 302 to the validated `target_url`. Per-IP click throttling limits click fraud on CPC ads.
- `manage.py roll_up_ad_costs` (hourly) computes cost from stats per pricing model, updates `spend`, auto-pauses on budget or end date, and posts daily `ad_charge` ledger entries for seller ads.

### 3.6 Media uploads

- The browser sends the file as `multipart/form-data` to `/api/v1/seller/products/{id}/images/`.
- Django validates the file: max 5 MB, real format via Pillow decode (not just the extension), JPEG/PNG/WebP only, max 8 per product, and max pixel dimensions.
- `apps/core/storage/` exposes `upload_image(file, folder) -> StoredImage(key, url, width, height)` and `delete_image(key)`. `CloudinaryStorage` is the MVP implementation. `S3Storage` can be added later, selected by `MEDIA_STORAGE`.
- The DB stores the **storage key** plus the URL. Responsive variants come from URL transforms in one helper (`buildImageUrl(key, {w})` on the frontend).

Why not store bytes in Postgres (as in Day-1 notes §18)? That works for a tiny catalogue, but with multi-seller galleries it bloats backups and DB memory and loses CDN caching and resizing.

### 3.7 Scheduled jobs (no Celery in the MVP)

| Job | Schedule | Command |
|-----|----------|---------|
| Expire unpaid orders and release stock | every 2 min | `manage.py expire_pending_orders` |
| Reconcile payments stuck in `created` with Razorpay | every 15 min | `manage.py reconcile_payments` |
| Post closed-window sub-orders to the seller ledger | hourly | `manage.py post_eligible_to_ledger` |
| Roll up ad stats → spend, auto-pause, seller ad charges | hourly | `manage.py roll_up_ad_costs` |
| Alert on returns with no seller response for 48 h | hourly | `manage.py flag_stale_returns` |
| Database backup | daily 02:30 IST | `deployment/scripts/backup_db.sh` |

Emails are sent synchronously through `integrations/email` with a short timeout, and failures are logged without breaking the request. When volume grows, this is the first thing to move to a queue (see §8).

## 4. Frontend architecture

- **One SPA, three areas**, each with its own layout: storefront (`StorefrontLayout`), seller (`SellerLayout`), admin (`AdminLayout`), plus `AuthLayout`.
- **Code-splitting per area:** the seller and admin areas are lazy-loaded so buyers never download dashboard code. Barrel exports and lazy loading work together like this:
  ```js
  // routes/AppRoutes.jsx
  const SellerDashboard = lazy(() =>
    import("@/pages/seller").then((m) => ({ default: m.SellerDashboard }))
  );
  ```
  The `@/pages/seller` barrel becomes one chunk for the seller area. Storefront pages are imported eagerly from `@/pages/storefront`.
- **State:**
  | Kind | Where |
  |------|-------|
  | Auth session (access token in memory, user profile) | `authSlice` |
  | Cart count and guest cart | `cartSlice` (guest cart persisted to localStorage) |
  | UI (mobile menu, modals) | `uiSlice` |
  | Server data (products, orders) | Fetched in pages through the `api/` layer plus small custom hooks (`useFetch`, `usePagination`). No server data is mirrored in Redux |
- **Data mode:** `VITE_DATA_MODE=mock` makes the `api/` functions resolve from `src/data/*` with an artificial delay, so Phase 2 UI is built against realistic data. Switching to `api` needs no component changes.

## 5. Architecture decisions log

| # | Decision | Alternatives considered | Reason |
|---|----------|-------------------------|--------|
| AD-1 | Modular monolith (Django) | Microservices | Small team and one VPS. Clean app boundaries keep later extraction possible |
| AD-2 | Parent order + seller sub-orders + items | One order per seller | One payment and one buyer experience, while each seller still sees only their part |
| AD-3 | Reserve stock at checkout, release on expiry | Decrement on payment | Prevents overselling while the user is on the payment screen |
| AD-4 | Category self-referencing tree | Separate subcategory table | Unlimited depth without extra tables. Depth is capped at 3 in validation |
| AD-5 | Buyer profile fields on `users` | `buyer_profiles` table | A buyer has no extra data, so a separate table would be empty weight |
| AD-6 | Seller approval state on `seller_profiles` + `audit_logs` history | `seller_approval_requests` table | Avoids a parallel table. The audit log keeps every decision |
| AD-7 | Payments + `payment_events` (raw event log) | Single payments table | Idempotent webhooks and a full gateway trail |
| AD-8 | **Redux Toolkit** for client state | Context API (original brief) | Team convention (Day-1 notes §11). DevTools. Persisting the guest cart is easy |
| AD-9 | **Formik + Yup** | React Hook Form (original brief) | Team convention (Day-1 notes §4–5). Factory schemas use `en.js` messages |
| AD-10 | Refresh token in an **httpOnly cookie**, access token in memory | Both tokens in localStorage (Day-1 notes §11/§15) | Any XSS can read localStorage. Too risky for a payments site. The UI still restores instantly from the persisted non-secret profile plus a silent refresh |
| AD-11 | Admin uses separate `/admin/*` endpoints | Ownership check for admin too (Day-1 notes §20) | The brief requires admins to manage every seller's data. Sellers still get strict ownership scoping. Admin access is a separate, audit-logged surface |
| AD-12 | Cloudinary behind `core/storage` | Bytes in Postgres (Day-1 notes §18) | CDN delivery, resizing, small backups, S3-ready |
| AD-13 | Native systemd deployment. Docker Compose optional for local Postgres only | Full Docker Compose in production | Matches the step-by-step VPS runbook requested. Fewer moving parts to debug. Docker can be added later without code changes |
| AD-14 | PostgreSQL full-text + `pg_trgm` search | Elasticsearch/Meilisearch | Good enough up to roughly 100k products with no extra service. `selectors/search.py` is the single point to swap |
| AD-15 | DRF throttling + Nginx `limit_req` | Redis-backed rate limiting | No Redis in the MVP. The DB cache backend handles throttling counters |
| AD-16 | Every product has ≥ 1 variant (simple products get one default variant) | Optional variants with stock on the product | One code path for cart, stock and orders. No "if has variants" branches |
| AD-17 | Variant attributes as JSONB validated against `products.variant_options` | Normalised option/value/variant-value tables (3 extra tables) | Far simpler CRUD. A GIN index covers filtering. Good up to ~100k variants |
| AD-18 | Seller-defined `shipping_methods`, chosen per seller at checkout | One platform shipping rule | Client: each vendor ships their own way |
| AD-19 | Signed seller ledger + settlements | Settlement = sum of sub-orders | COD cash held by sellers, refunds after payout, TCS/TDS and ad charges all need debits and carried-forward balances |
| AD-20 | One ad system for house banners and paid ads | Separate banners table + ads | One admin UI. Empty paid slots fall back to house ads automatically |
| AD-21 | First-party ad serving, no third-party ad scripts in v1 | Google AdSense | External scripts on a payments site are a skimming/XSS risk, hurt page speed, and pay less than direct-sold marketplace ads. AdSense can be added later to selected slots only |
| AD-22 | Coupons removed | — | Client decision |
| AD-23 | **AWS-portable by rule** (14 portability rules, [AWS_MIGRATION.md](AWS_MIGRATION.md)) checked in every PR | Re-architect at migration time | Migration becomes config + data copy, not a rewrite |
| AD-24 | `backend/Dockerfile` kept from Phase 3 and built in CI, while the VPS runs native systemd (AD-13) | Docker in production now | Same runbook simplicity today. The image is ready for ECS/App Runner later |
| AD-25 | Trunk-based Git on a client-owned GitHub org, CI with GitHub Actions, tagged releases ([ENGINEERING_WORKFLOW.md](ENGINEERING_WORKFLOW.md)) | GitFlow | Small team, frequent small releases, easy handover |
| AD-26 | Off-site backups to an S3 bucket in ap-south-1 from launch | Provider snapshots only | Survives VPS loss and is already in place for AWS migration |

## 6. Project folder structure

### 6.1 Root

```
ecommerce/
├── frontend/
├── backend/
├── docs/
├── deployment/
│   ├── nginx/marketplace.conf
│   ├── systemd/  (gunicorn.service, gunicorn.socket, *.timer, *.service)
│   └── scripts/  (backup_db.sh, deploy.sh, restore_db.sh)
├── .editorconfig
├── .gitignore
└── README.md
```

### 6.2 Frontend (`frontend/src/`). Every folder has an `index.js` barrel.

```
frontend/
├── index.html
├── vite.config.js            # alias "@" -> src
├── tailwind.config.js        # design tokens
├── eslint.config.js
├── .env.example              # VITE_API_URL, VITE_DATA_MODE, VITE_RAZORPAY_KEY_ID
├── e2e/                      # Playwright scripts
└── src/
    ├── main.jsx              # Provider, Router, setupInterceptors(store)
    ├── App.jsx               # <AppRoutes/> + <ToastContainer theme="light"/>
    ├── index.css             # Tailwind layers + CSS variables
    ├── api/                  # authApi.js, catalogApi.js, cartApi.js, orderApi.js,
    │                         # paymentApi.js, sellerApi.js, adminApi.js, index.js
    ├── assets/               # logo.svg, illustrations (empty states)
    ├── components/
    │   ├── ui/               # Button, FormInput, FormSelect, FormTextarea, Checkbox, Badge,
    │   │                     # Modal, Drawer, Dropdown, Tabs, Pagination, Rating, PriceTag,
    │   │                     # QuantityStepper, Skeleton, Spinner, index.js
    │   ├── feedback/         # EmptyState, ErrorState, PageLoader, index.js
    │   ├── layout/           # Navbar, SearchBar, CategoryMenu, Footer, Sidebar,
    │   │                     # DashboardHeader, Breadcrumbs, index.js
    │   ├── product/          # ProductCard, ProductGrid, ProductGallery, FilterPanel,
    │   │                     # SortSelect, ReviewList, ReviewForm, index.js
    │   ├── cart/             # CartSellerGroup, CartLine, CartSummary, index.js
    │   ├── dashboard/        # StatCard, DataTable, StatusBadge, ChartCard, index.js
    │   ├── ads/              # AdSlot, AdCarousel, AdBanner, SponsoredProductRow,
    │   │                     # SponsoredBadge, index.js
    │   ├── product/…         # + VariantSelector (swatches / size chips), index.js
    │   └── index.js          # re-exports every sub-barrel
    ├── config/               # axiosInstance.js, apiConfig.js, setupInterceptors.js,
    │                         # env.js, index.js
    ├── constants/            # userRoles.js, orderStatus.js, productStatus.js, index.js
    ├── data/                 # mock products, categories, stores, orders (Phase 2)
    ├── hooks/                # useAuth, useDebounce, useFetch, usePagination,
    │                         # useQueryParams, useRazorpay, index.js
    ├── layouts/              # StorefrontLayout, AuthLayout, AccountLayout,
    │                         # SellerLayout, AdminLayout, index.js
    ├── locales/              # en.js (A→Z keys), routes.js, index.js
    ├── pages/
    │   ├── storefront/       # Home, Category, Search, ProductDetail, Store, Cart,
    │   │                     # Checkout, OrderSuccess, index.js
    │   ├── auth/             # Login, Register, SellerRegister, ForgotPassword,
    │   │                     # ResetPassword, VerifyEmail, index.js
    │   ├── account/          # Profile, Addresses, Orders, OrderDetail, Notifications, index.js
    │   ├── seller/           # SellerOnboarding, SellerDashboard, SellerProducts,
    │   │                     # SellerProductForm, SellerInventory, SellerOrders,
    │   │                     # SellerOrderDetail, SellerEarnings, SellerStore, index.js
    │   ├── admin/            # AdminDashboard, AdminSellers, AdminSellerDetail, AdminBuyers,
    │   │                     # AdminProducts, AdminCategories, AdminOrders, AdminOrderDetail,
    │   │                     # AdminPayments, AdminCommissions, AdminSettlements,
    │   │                     # AdminReviews, AdminContent, AdminReports, AdminSettings,
    │   │                     # AdminAuditLog, index.js
    │   ├── errors/           # NotFound, Forbidden, index.js
    │   └── index.js
    ├── routes/               # AppRoutes.jsx, ProtectedRoute.jsx, GuestRoute.jsx, index.js
    ├── store/                # index.js, slices/authSlice.js, cartSlice.js, uiSlice.js
    ├── utils/                # toast.js, authRedirect.js, formatCurrency.js, formatDate.js,
    │                         # getErrorMessage.js, imageUrl.js, storage.js, index.js
    └── validators/           # createLoginSchema.js, createRegisterSchema.js,
                              # createAddressSchema.js, createProductSchema.js, ..., index.js
```

### 6.3 Backend (`backend/`)

```
backend/
├── manage.py
├── requirements/             # base.txt, dev.txt, prod.txt
├── .env.example
├── pytest.ini
├── config/
│   ├── settings/             # base.py, dev.py, prod.py, test.py
│   ├── urls.py               # /api/v1/ router + /webhooks/
│   ├── wsgi.py
│   └── asgi.py
└── apps/
    ├── core/                 # shared, no domain models of its own (except below)
    │   ├── models/           # TimeStampedModel (abstract), PlatformSettings, AuditLog, __init__.py
    │   ├── permissions.py    # IsBuyer, IsSeller, IsApprovedSeller, IsAdmin
    │   ├── pagination.py, exceptions.py (uniform {detail, code, errors}), throttles.py
    │   ├── storage/          # base.py, cloudinary.py, local.py, __init__.py (get_storage())
    │   ├── email/            # send_templated_email(), templates/
    │   └── audit.py          # log_admin_action()
    ├── accounts/             # User, Address, auth views, JWT cookie handling
    ├── sellers/              # SellerProfile, Store, ShippingMethod, onboarding, approval services
    ├── catalog/              # Category, Product, ProductVariant, ProductImage, InventoryMovement,
    │                         # search selectors
    ├── cart/                 # Cart, CartItem, merge-guest-cart service
    ├── orders/               # Order, SellerOrder, OrderItem, OrderStatusHistory, ReturnRequest,
    │                         # ReturnItem, services/checkout.py, cod.py, transitions.py,
    │                         # cancellation.py, returns.py
    ├── payments/             # Payment, PaymentEvent, Refund,
    │                         # gateways/ (base.py, razorpay.py, mock.py), webhooks.py
    ├── settlements/          # CommissionRule, SellerLedgerEntry, SellerSettlement,
    │                         # services/commission.py, ledger.py, settlement.py
    ├── invoicing/            # TaxDocument, DocumentSequence, services/tax.py, issue.py, pdf templates
    ├── reviews/              # Review
    ├── ads/                  # AdSlot, Advertisement, AdDailyStat, services/serving.py, billing.py
    ├── notifications/        # Notification, notify() service
    └── dashboard/            # admin + seller statistics/report selectors (no models)
```

Each domain app follows this shape:

```
apps/orders/
├── models/        order.py, seller_order.py, order_item.py, order_status_history.py, __init__.py
├── serializers/   buyer.py, seller.py, admin.py, __init__.py
├── views/         buyer.py, seller.py, admin.py, __init__.py
├── services/      checkout.py, transitions.py, cancellation.py, __init__.py
├── selectors.py
├── urls.py        buyer_urls, seller_urls, admin_urls
├── admin.py
├── management/commands/expire_pending_orders.py
└── tests/         test_checkout.py, test_isolation.py, ...
```

**Changes from the brief's suggested app list:** `buyers` is merged into `accounts` (AD-5). `stores` is merged into `sellers` (1:1 with the seller). `categories` and `products` are merged into `catalog` (they are tightly coupled). `marketplace` is split into `settlements` (money), `invoicing` (GST documents) and `ads` (ad revenue). `dashboard` is added for reporting queries. Fewer apps means fewer cross-app imports and migrations.

## 6.4 Environment variables

| Variable | Where | Example / note |
|----------|-------|----------------|
| `DJANGO_SETTINGS_MODULE` | backend | `config.settings.prod` |
| `SECRET_KEY` | backend | 50+ random chars |
| `DATABASE_URL` | backend | `postgresql://app:***@127.0.0.1:5432/marketplace` |
| `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` | backend | CORS only in dev |
| `PAYMENT_GATEWAY` | backend | `mock` / `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | backend | Secret values only on the server |
| `MEDIA_STORAGE`, `CLOUDINARY_URL` | backend | `cloudinary` |
| `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | backend | |
| `FRONTEND_URL` | backend | For email links |
| `CACHE_URL` | backend | `db://` now, `redis://…` (ElastiCache) later |
| `FIELD_ENCRYPTION_KEY` | backend | Fernet key list for encrypted bank fields |
| `APP_VERSION` | backend | Set by deploy script, shown by `/api/v1/health/` |
| `SENTRY_DSN` | backend + frontend (`VITE_SENTRY_DSN`) | Optional, empty disables |
| `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME` | backend | Only when `MEDIA_STORAGE=s3` (future) |
| `VITE_API_URL` | frontend | `/api/v1` in prod, `http://127.0.0.1:8000/api/v1` in dev |
| `VITE_DATA_MODE` | frontend | `mock` / `api` |
| `VITE_RAZORPAY_KEY_ID` | frontend | Public key id. **Never the secret** |

## 7. Technical risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Overselling under concurrent checkouts | Orders that cannot be fulfilled | Conditional atomic decrement + CHECK constraint + concurrency test |
| Verify callback and webhook race / duplicates | Double confirmation, double emails | Row lock + idempotent `capture_payment()` + unique event ids |
| User pays but closes the browser before verify | "Paid but no order" complaints | Webhook + reconciliation job converge the state |
| Late capture after stock released | Paid order without stock | Re-reserve or auto-refund (PAY-7) |
| Partial refunds across sub-orders | Wrong refund amount | Refund per sub-order total. Sum of refunds ≤ captured amount (checked in service + DB) |
| Commission/GST rounding drift | Settlement mismatches by paise | `Decimal` with `ROUND_HALF_UP` at line level. Totals are sums of rounded lines. Unit tests |
| Seller data leaks (IDOR) | Trust and legal damage | Queryset scoping in a base `SellerScopedViewSet` + isolation tests for every seller endpoint |
| GST/TCS/TDS non-compliance | Legal exposure for the client | Q4 to the client's CA. Fields reserved in settlements |
| Single VPS failure | Downtime, data loss | Off-site daily backups, tested restore, documented rebuild runbook |
| GST rules change or are misapplied | Wrong invoices, compliance issues | All rates and slabs are configurable. One tax function with tests. CA sign-off before launch |
| COD refusals / fraud | Lost shipping costs for sellers | COD limit, verified email, refusal tracking + COD block, sellers can disable COD per method |
| Sellers with COD-heavy negative balances | Platform can't collect commission | Ledger shows the debt. Threshold alerts. Suspend COD for that store until cleared |
| Ad click fraud on CPC | Advertiser disputes | Click throttling per IP/session, bot user-agent filtering, admin can adjust stats |
| Ads hurting UX or speed | Lower conversion | Reserved aspect ratios, lazy-loaded images, max items per slot, no ads in checkout |
| Synchronous email slows requests | Slow checkout | Short SMTP timeout, emails sent after commit (`transaction.on_commit`). Queue in the scale stage |

## 8. Scaling path: small → large marketplace

The code boundaries (services, integrations, selectors) are what make each step a local change.

| Stage | Trigger | Change | Code impact |
|-------|---------|--------|-------------|
| **S0 – MVP** | Launch | 1 VPS (4 vCPU / 8 GB): Nginx + Gunicorn + Postgres | — |
| **S1** | CPU > 60% sustained or > 2k orders/day | Move Postgres to its own VPS or managed DB. Tune Gunicorn workers. Add **Redis** for cache and throttling | Settings only |
| **S2** | Emails/reports slow requests | **Celery + Redis** for email, reports, reconciliation, image post-processing | `notify()` / `send_email()` become `.delay()`. Callers unchanged |
| **S3** | Search quality or latency issues (> 100k SKUs) | **Meilisearch / OpenSearch** fed by product save signals | Replace `catalog/selectors/search.py` |
| **S4** | Traffic spikes | 2+ app servers behind a load balancer, read replica for listings/reports, Cloudflare CDN for SPA assets | Stateless app already (JWT, external media) |
| **S5 – AWS** | Business decision | RDS (Postgres), EC2/ECS for Gunicorn, S3 + CloudFront (switch `MEDIA_STORAGE=s3`), SES for email, ALB | Storage adapter + settings. No domain code changes. Full plan: [AWS_MIGRATION.md](AWS_MIGRATION.md) |
| **S6** | Large seller base | Automated payouts (Razorpay Route/RazorpayX), courier aggregator API, seller analytics warehouse | New `integrations/` adapters |

## 9. Complexity estimate

For **one experienced full-stack developer**, with the confirmed scope (variants, seller shipping methods, GST invoicing, COD, returns, ads, and no coupons):

| Phase | Effort |
|-------|--------|
| 1 Requirements & architecture | 1 week |
| 2 Frontend foundation (design system, storefront incl. variants and ad slots, on mock data) | 3–3.5 weeks |
| 3 Backend foundation (auth, roles, permissions, core) | 1.5 weeks |
| 4 Seller system (incl. variants, shipping methods, GST profile) | 3.5 weeks |
| 5 Buyer system | 2 weeks |
| 6 Orders, payments, COD, returns, GST invoices, ledger | 5 weeks |
| 7 Admin system (incl. ads, settlements, tax reports) | 3.5 weeks |
| 8 Testing hardening + UAT fixes | 2 weeks |
| 9 Deployment + go-live | 1 week |
| **Total** | **≈ 23–25 weeks** |

The riskiest work is Phase 6 (payments, COD, stock, refunds, tax, ledger). It gets the most automated tests.
