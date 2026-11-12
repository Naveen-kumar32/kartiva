# API Documentation

Status: **design (Phase 1)**. Each endpoint gets request/response examples and is marked ✅ when it is implemented and tested. An OpenAPI schema will be generated from code (`drf-spectacular`) at `/api/v1/schema/` (dev only).

## 1. Conventions

| Topic | Rule |
|-------|------|
| Base URL | `/api/v1` (prod same origin, dev `http://127.0.0.1:8000/api/v1`) |
| Format | JSON, `snake_case` fields. Uploads use `multipart/form-data` |
| Auth | `Authorization: Bearer <access>`. Refresh token in httpOnly cookie `refresh_token` (Path `/api/v1/auth/`) |
| Pagination | `?page=1&page_size=24` (max 100) → `{ "count", "next", "previous", "results": [] }` |
| Filtering/sorting | Query params, e.g. `?category=mobiles&min_price=500&sort=price_asc` |
| Money | Strings with 2 decimals: `"1299.00"` (avoids JS float issues). Frontend formats with `Intl.NumberFormat("en-IN")` |
| Dates | ISO-8601 UTC: `2026-11-11T05:30:00Z` |
| Idempotency | `POST /checkout/` requires an `Idempotency-Key: <uuid>` header |
| Versioning | URL prefix `/v1`. Breaking changes go to `/v2` |

### Error format (every error)

```json
{
  "detail": "Human readable summary.",
  "code": "validation_error",
  "errors": { "email": ["A user with this email already exists."] }
}
```

`detail` is always present, so the frontend can rely on `err.response?.data?.detail ?? EN.ERRORS.FALLBACK`. `errors` holds per-field messages and Formik maps it with `setErrors`.

| Status | When |
|--------|------|
| 400 | Validation error |
| 401 | Missing or expired token |
| 403 | Authenticated but wrong role (e.g. buyer calling `/seller/*`) |
| 404 | Not found **or not yours** (other sellers' objects return 404) |
| 409 | Conflict: out of stock, invalid status transition, duplicate |
| 429 | Throttled |

Legend for the **Auth** column: `—` public, `U` any logged-in user, `B` buyer, `S` seller (any status), `S✓` approved seller, `A` admin.

### Health
`GET /api/v1/health/` → `200 {"status":"ok","db":"ok","version":"v1.4.0"}` (public, no secrets, used by uptime monitors and load balancers)

## 2. Auth & account (`accounts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register/` | — | Buyer registration `{first_name, last_name, email, phone, password}` → sends a verification email |
| POST | `/auth/seller/register/` | — | Seller account registration (role=`seller`, profile status `draft`) |
| POST | `/auth/login/` | — | `{email, password}` → `{access, user}` + refresh cookie. Throttled 5/min/IP |
| POST | `/auth/refresh/` | cookie | Rotates refresh, returns `{access}` |
| POST | `/auth/logout/` | U | Blacklists refresh, clears the cookie |
| POST | `/auth/verify-email/` | — | `{uid, token}` |
| POST | `/auth/resend-verification/` | U | Throttled |
| POST | `/auth/password/forgot/` | — | `{email}`. Always returns 200 (no account enumeration) |
| POST | `/auth/password/reset/` | — | `{uid, token, new_password}` |
| POST | `/auth/password/change/` | U | `{current_password, new_password}` |
| GET / PATCH | `/me/` | U | Profile. `role` and `email` are read-only |
| GET / POST | `/me/addresses/` | B | List / create |
| GET / PATCH / DELETE | `/me/addresses/{id}/` | B | Own only |
| POST | `/me/addresses/{id}/set-default/` | B | |

`user` object: `{ id, email, first_name, last_name, phone, role, avatar_url, email_verified, seller_status? }`

## 3. Public catalogue (`catalog`, `sellers`, `marketing`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/categories/` | — | Full active tree (cached) |
| GET | `/categories/{slug}/` | — | Category with breadcrumbs and children |
| GET | `/products/` | — | Listing and search. Params: `q`, `category`, `store`, `brand`, `min_price`, `max_price`, `min_rating`, `in_stock`, `attr.<Name>=<value>` (e.g. `attr.Colour=Black`), `sort` (`relevance`,`newest`,`price_asc`,`price_desc`,`rating`,`popular`), `page` |
| GET | `/products/facets/` | — | Same filters → counts per brand, store, price bucket and variant attribute value |
| GET | `/products/{slug}/` | — | Detail: images, specs, `variant_options`, `variants:[{id, attributes, price, mrp, in_stock, stock_hint, image_ids}]`, store card (with return policy), rating summary, `is_returnable`, `return_window_days` |
| GET | `/products/{slug}/delivery/?pincode=600001` | — | That store's shipping methods serviceable to the pincode: fee, ETA, COD allowed |
| GET | `/products/{slug}/related/` | — | Same leaf category, then the same store |
| GET | `/products/{slug}/reviews/` | — | Paginated, `?rating=5` |
| GET | `/stores/{slug}/` | — | Public store profile |
| GET | `/stores/{slug}/products/` | — | Same params as `/products/` |
| GET | `/home/` | — | One call for the homepage: `{featured_products, trending_products, new_arrivals, featured_stores, top_categories}` (cached 5 min). Ads load separately |

### Ads (public)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/ads/?slots=home_hero_carousel,home_mid_banner&category=12` | — | Per slot: `{slot:{key, format, sizes, rotation_seconds}, items:[{id, image_url, mobile_image_url, headline, cta_label, click_url, product?, is_sponsored}]}`. House ads fill empty slots. Cached 60 s |
| POST | `/ads/impressions/` | — | `{ids:[…], page}` (sendBeacon, throttled, de-duplicated) |
| GET | `/ads/{id}/click/` | — | Counts the click → 302 to the validated target |

## 4. Cart (`cart`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/cart/` | B | Grouped by store: `{groups:[{store, items:[{variant, product, attributes, …}], subtotal, shipping_estimate}], items_subtotal, shipping_total, grand_total, warnings:[…]}`. All values computed by the server |
| POST | `/cart/items/` | B | `{variant_id, quantity}`. Merges if the variant is already in the cart |
| PATCH | `/cart/items/{id}/` | B | `{quantity}`. Validated against stock and `max_per_order` |
| DELETE | `/cart/items/{id}/` | B | |
| POST | `/cart/merge/` | B | `{items:[{variant_id, quantity}]}`. Merges the guest cart after login |
| DELETE | `/cart/` | B | Clear |

## 5. Checkout, orders, payments (`orders`, `payments`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/checkout/options/` | B | `{address_id, source:"cart"\|"buy_now", items?}` → per seller: the shipping methods serviceable to the address (fee, ETA, cod_allowed), plus whether COD is available for the whole order and why not |
| POST | `/checkout/preview/` | B | `{address_id, source, items?, shipping_choices:{store_id: method_id}, payment_method:"online"\|"cod", billing_gstin?}` → priced breakdown per seller incl. GST split, no side effects |
| POST | `/checkout/` | B (verified email) | Same body + `Idempotency-Key` header. **Online:** creates the order and sub-orders, reserves stock, creates the gateway order → `{order_number, payment:{gateway, gateway_order_id, amount_paise, currency, key_id}, expires_at}`. **COD:** creates a confirmed order → `{order_number, status:"confirmed"}` |
| POST | `/payments/verify/` | B | `{gateway_order_id, gateway_payment_id, signature}` → `{order_number, status}` |
| POST | `/payments/{order_number}/retry/` | B | Re-opens payment for a `pending_payment` order before expiry |
| POST | `/payments/{order_number}/failed/` | B | Client reports dismissal or failure. Informational only (the server still checks with the gateway) |
| GET | `/orders/` | B | Own orders, newest first, `?status=` |
| GET | `/orders/{order_number}/` | B | Parent order + sub-orders + items + timeline |
| POST | `/orders/{order_number}/sub-orders/{sub_order_number}/cancel/` | B | `{reason}`. Only while `confirmed`/`processing`. Starts a refund for online orders (none needed for COD) |
| GET | `/orders/{order_number}/sub-orders/{sub_order_number}/invoice/` | B | Short-lived signed URL to the GST invoice PDF |
| POST | `/returns/` | B | Multipart: `{sub_order_number, items:[{order_item_id, quantity}], reason_code, description, photos[], refund_payout?:{upi_id \| bank}}` (payout details only for COD) |
| GET | `/returns/` · `/returns/{return_number}/` | B | Own returns with timeline |
| POST | `/returns/{return_number}/cancel/` · `/escalate/` | B | |
| POST | `/webhooks/razorpay/` | signature | Raw-body HMAC check with the webhook secret. Handles `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`. Always 2xx after the event is stored |

## 6. Reviews & notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me/reviewable-items/` | B | Delivered items not yet reviewed |
| POST | `/reviews/` | B | `{order_item_id, rating, title?, body?}` |
| PATCH / DELETE | `/reviews/{id}/` | B | Own only |
| GET | `/notifications/` | U | `?unread=true` |
| GET | `/notifications/unread-count/` | U | |
| POST | `/notifications/{id}/read/` · `/notifications/read-all/` | U | |

## 7. Seller (`/seller/*`): every queryset is scoped to the caller's store

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET / PUT | `/seller/onboarding/` | S | Business profile + store draft (editable in `draft`/`rejected`) |
| POST | `/seller/onboarding/documents/` | S | Cancelled cheque upload (private storage) |
| POST | `/seller/onboarding/submit/` | S | `draft/rejected → pending` |
| GET | `/seller/onboarding/status/` | S | `{status, rejection_reason}` |
| GET / PATCH | `/seller/store/` | S✓ | Store profile |
| POST | `/seller/store/logo/` · `/seller/store/banner/` | S✓ | Image upload |
| GET | `/seller/dashboard/` | S✓ | KPIs, low stock, recent sub-orders |
| GET / POST | `/seller/products/` | S✓ | List (`?status=&q=&low_stock=`) / create (draft) with `variant_options`, `hsn_code`, `gst_rate`, `variants:[{attributes, sku, mrp, price, stock_quantity}]` |
| GET / PATCH / DELETE | `/seller/products/{id}/` | S✓ | Own only. DELETE = soft delete |
| POST / PATCH / DELETE | `/seller/products/{id}/variants/` · `/variants/{variant_id}/` | S✓ | Add, edit or deactivate variants |
| GET / POST / PATCH / DELETE | `/seller/shipping-methods/…` | S✓ | Own delivery methods |
| POST | `/seller/products/{id}/submit/` | S✓ | `draft → pending_review` (or `active` if moderation is off) |
| POST | `/seller/products/{id}/deactivate/` · `/activate/` | S✓ | |
| POST | `/seller/products/{id}/images/` | S✓ | Multipart, one or more files |
| PATCH / DELETE | `/seller/products/{id}/images/{image_id}/` | S✓ | Set primary / reorder / delete |
| POST | `/seller/variants/{variant_id}/stock/` | S✓ | `{delta, note}` or `{set_to, note}` → writes an inventory movement |
| GET | `/seller/variants/{variant_id}/stock-history/` | S✓ | |
| GET | `/seller/categories/` | S✓ | Leaf categories for the product form |
| POST | `/seller/category-suggestions/` | S✓ | `{name, parent_id, note}` → admin notification |
| GET | `/seller/orders/` | S✓ | **Sub-orders** of own store only (never `pending`), `?status=&q=&from=&to=` |
| GET | `/seller/orders/{sub_order_number}/` | S✓ | Items, buyer name + shipping address (needed to ship). No payment internals |
| POST | `/seller/orders/{sub_order_number}/status/` | S✓ | `{to_status, carrier?, tracking_number?, note?}`. Transition table enforced |
| POST | `/seller/orders/{sub_order_number}/cancel/` | S✓ | `{reason}` → refund |
| GET | `/seller/orders/{sub_order_number}/invoice/` | S✓ | Own invoice PDF (signed URL) |
| GET | `/seller/returns/` · `/seller/returns/{return_number}/` | S✓ | Own store's returns |
| POST | `/seller/returns/{return_number}/approve/` · `/reject/` `{reason}` · `/in-transit/` `{tracking}` · `/received/` `{restock:[order_item_ids]}` | S✓ | |
| GET | `/seller/earnings/` | S✓ | Balance, pending (in return window), ledger summary by type |
| GET | `/seller/ledger/` | S✓ | Ledger entries `?type=&from=&to=` |
| GET | `/seller/settlements/` · `/seller/settlements/{id}/` | S✓ | Own settlements + commission invoice |
| GET | `/seller/ads/` · `/seller/ads/{id}/stats/` | S✓ | Own ads, daily impressions, clicks, spend |

## 8. Admin (`/admin-api/*`) [`A` only, every write audit-logged]

The prefix is `/admin-api/` so it never clashes with the Django admin site, which is mounted at a non-default path.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin-api/dashboard/` | KPIs (`?range=7d\|30d\|90d`) |
| GET | `/admin-api/sellers/` | `?status=pending&q=` |
| GET | `/admin-api/sellers/{id}/` | Full profile (bank number masked), document links (short-lived signed URLs) |
| POST | `/admin-api/sellers/{id}/approve/` · `/reject/` `{reason}` | |
| POST | `/admin-api/sellers/{id}/suspend/` `{reason}` · `/reactivate/` | |
| PATCH | `/admin-api/stores/{id}/` | `is_featured`, edits |
| GET | `/admin-api/buyers/` · `/admin-api/buyers/{id}/` | |
| POST | `/admin-api/users/{id}/deactivate/` · `/activate/` | |
| GET / PATCH | `/admin-api/products/` · `/admin-api/products/{id}/` | All products, `?status=pending_review` |
| POST | `/admin-api/products/{id}/approve/` · `/reject/` `{reason}` · `/feature/` | |
| GET / POST / PATCH / DELETE | `/admin-api/categories/…` | CRUD + `POST /reorder/` |
| GET | `/admin-api/orders/` · `/admin-api/orders/{order_number}/` | Full parent order with every sub-order and payment |
| POST | `/admin-api/orders/{order_number}/sub-orders/{n}/status/` · `/cancel/` | Admin override |
| GET | `/admin-api/payments/` · `/admin-api/payments/{id}/` | Including events |
| POST | `/admin-api/refunds/` | `{order_id, seller_order_id?, amount, reason, note}` (gateway for online orders, queued as a bank transfer for COD) |
| GET | `/admin-api/refunds/` | `?method=bank_transfer&status=pending` = the COD refund queue |
| POST | `/admin-api/refunds/{id}/mark-paid/` | `{manual_reference}` for bank/UPI refunds |
| GET | `/admin-api/returns/` · `/admin-api/returns/{return_number}/` | `?escalated=true` |
| POST | `/admin-api/returns/{return_number}/override/` | Approve an escalated return |
| POST | `/admin-api/users/{id}/cod-block/` · `/cod-unblock/` | |
| GET / POST / PATCH | `/admin-api/commission-rules/…` | |
| GET | `/admin-api/ledger/?store=` | Any store's ledger |
| POST | `/admin-api/ledger/adjustments/` | `{store_id, amount, description}` (audit-logged) |
| GET | `/admin-api/settlements/` · `/admin-api/settlements/{id}/` | |
| POST | `/admin-api/settlements/` | `{store_id}` → draft from unsettled entries |
| POST | `/admin-api/settlements/{id}/approve/` · `/mark-paid/` `{payment_reference, paid_at}` · `/carry-forward/` · `/cancel/` | |
| GET | `/admin-api/tax-documents/` | `?type=&store=&fy=` with PDF links |
| GET / PATCH | `/admin-api/reviews/…` | Hide / restore |
| GET / PATCH | `/admin-api/ad-slots/…` | Activate/deactivate slots, sizes, rotation |
| GET / POST / PATCH | `/admin-api/ads/…` | Create house, seller or external ads (images multipart), schedule, budget |
| POST | `/admin-api/ads/{id}/pause/` · `/resume/` | |
| GET | `/admin-api/ads/{id}/stats/` | Daily impressions, clicks, CTR, spend |
| GET / PATCH | `/admin-api/settings/` | Platform settings (COD, GST slabs, TCS/TDS, platform GSTIN…) |
| GET | `/admin-api/reports/sales/` | `?group_by=day\|category\|store&from=&to=&format=csv` |
| GET | `/admin-api/reports/revenue/` | Commission revenue + ad revenue by period |
| GET | `/admin-api/reports/gst/` · `/reports/tcs-tds/` | Monthly per seller, CSV for filing |
| GET | `/admin-api/audit-logs/` | `?actor=&action=&target_type=` |

## 9. Throttling (initial values)

| Scope | Limit |
|-------|-------|
| anon (general) | 120/min |
| user (general) | 300/min |
| login | 5/min per IP + 10/hour per email |
| register, password forgot, resend verification | 5/hour per IP |
| checkout | 10/min per user |
| reviews | 10/hour per user |
| returns | 10/day per user |
| ad impressions | 120/min per IP |
| ad clicks | 30/min per IP. Repeat clicks on the same ad within 30 s are not counted |
| uploads | 60/hour per user |
