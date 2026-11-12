# Software Requirements Specification

Version 0.2 (2026-11-11). Client answers to Q1–Q13 are in §7. Brand: **Kartiva** (working name, see §7 Q1).

---

## 1. Purpose and scope

**Kartiva** is a web marketplace where approved, GST-registered sellers list products (with variants) and buyers purchase from one or more sellers in a single checkout. Buyers pay online (all Razorpay methods) or cash on delivery. Each seller ships with their own delivery methods. The platform earns **commission on every sale** and **advertising revenue** from ad spaces across the storefront. Online payments are collected by the platform and settled with sellers through a ledger (manual bank payouts in v1). Out of scope for the MVP: native mobile apps, automated split payouts, courier API integrations, and coupons.

## 2. Actors and roles

| Role | How the account is created | Notes |
|------|----------------------------|-------|
| Guest | n/a | Can browse, search and fill a local cart |
| Buyer | Self-registration | Default role |
| Seller | Self-registration through the seller flow, followed by admin approval | Can log in while `pending`, but only sees the onboarding status page |
| Admin | Created with a management command (`createsuperuser`-style), never through the public API | Any number of admins. Every action is audit-logged |

One account has exactly **one role** in the MVP. If a seller wants to buy, they use a separate buyer account. This keeps permissions simple. Allowing one account to be both can be added later without changing the schema.

## 3. Functional requirements

IDs are referenced in tests and the progress tracker. **MVP** = must ship in v1. **v1.1** = shortly after launch.

### 3.1 Authentication and accounts (AUTH)

| ID | Requirement | Scope |
|----|-------------|-------|
| AUTH-1 | Register with name, email, phone, password. Email is unique and case-insensitive | MVP |
| AUTH-2 | Login with email and password. The role comes **from the account, never from the request** | MVP |
| AUTH-3 | JWT access token (short-lived) plus a rotating refresh token in an httpOnly cookie. Logout blacklists the refresh token | MVP |
| AUTH-4 | Forgot / reset password through an emailed, time-limited, single-use token | MVP |
| AUTH-5 | Email verification. Unverified buyers can browse but must verify before checkout | MVP |
| AUTH-6 | Change password. Update profile (name, phone, avatar) | MVP |
| AUTH-7 | After login, redirect by role: buyer → previous page or `/`, seller → `/seller`, admin → `/admin` | MVP |
| AUTH-8 | Phone OTP login | Later (needs an SMS provider) |

### 3.2 Catalogue and discovery (CAT)

| ID | Requirement | Scope |
|----|-------------|-------|
| CAT-1 | Category tree (category → subcategory, max depth 3). Admin-managed | MVP |
| CAT-2 | Product listing with pagination (24 per page) | MVP |
| CAT-3 | Filters: category, price range, seller/store, minimum rating, in-stock only, brand | MVP |
| CAT-4 | Sort: relevance, newest, price ↑/↓, rating, popularity | MVP |
| CAT-5 | Keyword search across name, brand, description and category (PostgreSQL full-text plus trigram typo tolerance) | MVP |
| CAT-6 | Search suggestions while typing (debounced) | v1.1 |
| CAT-7 | Product detail: gallery, price/MRP/discount %, stock state, specifications, seller card, quantity, Add to cart, Buy now, reviews, related products | MVP |
| CAT-8 | Store page: banner, logo, description, rating, product grid | MVP |
| CAT-9 | Only `active` products from `approved`, non-suspended stores appear publicly | MVP |
| CAT-10 | Product variants (size/colour/…) with their own price, stock, SKU and images. Variant attributes can be used as filters (e.g. Colour, Size) | MVP |

### 3.3 Cart and checkout (CART / CHK)

| ID | Requirement | Scope |
|----|-------------|-------|
| CART-1 | Guests keep a cart in localStorage. It is merged into the server cart at login | MVP |
| CART-2 | Logged-in cart is stored server-side. Add, update quantity, remove. Quantity is capped at available stock and a per-line max (10) | MVP |
| CART-3 | Cart is grouped **by seller**, with per-seller subtotal, the seller's cheapest eligible shipping estimate, and a grand total | MVP |
| CART-4 | Cart shows warnings when a price changed or an item went out of stock since it was added | MVP |
| CHK-1 | Checkout steps: address → delivery (choose a shipping method **per seller**) → payment method (online / COD) → review → pay or place order | MVP |
| CHK-2 | Address book: add, edit, delete, set default. Indian PIN-code validation | MVP |
| CHK-3 | The server recomputes every price, shipping fee, GST split and total. The client sends only variant IDs, quantities, address ID, chosen shipping method per seller, and the payment method | MVP |
| CHK-4 | Placing an order creates one **parent order** and one **seller sub-order per store**, and reserves stock | MVP |
| CHK-5 | Idempotent order placement (an `Idempotency-Key` header) so double-clicks and retries never create duplicate orders | MVP |
| CHK-6 | "Buy now" checks out a single item without touching the cart | MVP |
| CHK-7 | Optional buyer GSTIN at checkout for a B2B tax invoice | MVP |

### 3.4 Payments (PAY)

| ID | Requirement | Scope |
|----|-------------|-------|
| PAY-1 | The backend creates the Razorpay order for the server-computed amount | MVP |
| PAY-2 | The frontend opens Razorpay Checkout using the **public key id only** | MVP |
| PAY-3 | The backend verifies the checkout signature (HMAC-SHA256), then confirms amount and status with the Razorpay API | MVP |
| PAY-4 | The webhook endpoint verifies the webhook signature over the raw body and de-duplicates by event id | MVP |
| PAY-5 | Verify callback and webhook both call the same idempotent capture service. Whichever arrives first wins and the other is a no-op | MVP |
| PAY-6 | Failed or abandoned payments: unpaid orders expire after 15 minutes and their stock is released | MVP |
| PAY-7 | A payment captured after expiry re-reserves stock if available. Otherwise it is auto-refunded and the buyer is notified | MVP |
| PAY-8 | Refunds (full or per sub-order) go through the Razorpay Refund API, are tracked by refund webhooks, and are triggered only by the authorised flows in §3.6 | MVP |
| PAY-9 | No card, UPI PIN or CVV data ever touches our servers | MVP |
| PAY-10 | All online methods Razorpay offers: UPI, cards, net banking, wallets, EMI, Pay Later (enabled in the Razorpay dashboard, no extra code per method) | MVP |
| PAY-11 | Cash on delivery: available when COD is enabled platform-wide, the order is ≤ the COD limit, every seller's chosen shipping method allows COD, the buyer's email is verified, and the buyer is not COD-blocked. Each seller collects cash for their own sub-order | MVP |
| PAY-12 | COD refunds (cancel after collection, returns) are paid to the buyer's UPI/bank by the platform, recorded with a UTR and debited from the seller ledger | MVP |

### 3.5 Orders (ORD)

| ID | Requirement | Scope |
|----|-------------|-------|
| ORD-1 | Buyer order history: parent orders with nested sub-orders and their individual statuses | MVP |
| ORD-2 | Sub-order status flow: `confirmed → processing → shipped → delivered`. Side exits: `cancelled`, `returned` | MVP |
| ORD-3 | Seller updates their own sub-order status, carrier and tracking number. Allowed transitions are enforced by the server | MVP |
| ORD-4 | Buyer can cancel a sub-order while it is `confirmed` or `processing`. Stock is restored and a refund starts automatically | MVP |
| ORD-5 | Seller can cancel a sub-order (e.g. cannot fulfil) with a reason. Stock is restored and a refund starts automatically | MVP |
| ORD-6 | Buyer and seller get in-app and email notifications on status changes | MVP |
| ORD-7 | Returns: see §3.10 | MVP |
| ORD-8 | Downloadable GST tax invoice (PDF) per sub-order, issued in the seller's name. Credit note on refunded returns | MVP |
| ORD-9 | COD sub-orders can end as `undelivered` (buyer refused). Stock is restored and repeat refusals let an admin block COD for that buyer | MVP |

### 3.6 Seller system (SEL)

| ID | Requirement | Scope |
|----|-------------|-------|
| SEL-1 | Seller sign-up: account details plus business details (legal name, business type, **GSTIN (mandatory)**, PAN, registered + pickup address, bank details, GST certificate and cancelled cheque uploads) | MVP |
| SEL-2 | Store profile: store name (unique), slug, description, logo, banner, support email/phone | MVP |
| SEL-3 | Application states: `draft → pending → approved / rejected` (rejection includes a reason, and the seller can resubmit). Admin can move a store between `approved` and `suspended` | MVP |
| SEL-4 | Seller dashboard: today's and 30-day sales, orders by status, low-stock alerts, recent orders | MVP |
| SEL-5 | Product CRUD: name, category (leaf), brand, description, specifications, **HSN code + GST rate**, returnable flag, variant options (e.g. Colour × Size → generated variant grid with SKU, MRP, price and stock per row), up to 8 product images + 4 per variant (JPEG/PNG/WebP, ≤ 5 MB each), draft/publish | MVP |
| SEL-6 | Deleting a product is a soft delete (it stays referenced by past orders) | MVP |
| SEL-7 | Stock management: quick inline stock edit, low-stock threshold, movement history | MVP |
| SEL-8 | Sub-order list and detail (only their own), status updates, packing slip view | MVP |
| SEL-9 | Earnings: ledger view (sales, shipping, commission + GST, TCS/TDS, COD collected, refunds, ad charges, payouts), current balance, settlement history, commission invoices | MVP |
| SEL-12 | Shipping methods: create any number (standard / express / local delivery / store pickup), each with fee, free-above threshold, delivery estimate, serviceable pincodes and COD on/off | MVP |
| SEL-13 | Returns inbox: approve or reject (with reason), mark received, choose whether to restock | MVP |
| SEL-14 | Ads: see their own sponsored-product ads and stats (bought through the admin in v1, self-serve in v1.1) | MVP |
| SEL-10 | Sellers can **suggest** categories. Only admins create them | MVP |
| SEL-11 | **Isolation:** a seller can never read or modify another seller's store, products, sub-orders or settlements. Attempts return 404 (not 403, so it is not revealed that the object exists) | MVP |

### 3.7 Admin system (ADM)

| ID | Requirement | Scope |
|----|-------------|-------|
| ADM-1 | Dashboard: GMV, orders, AOV, new buyers, pending seller applications, pending products, refunds | MVP |
| ADM-2 | Seller applications: review documents, approve or reject with a reason | MVP |
| ADM-3 | Seller management: suspend or reactivate (suspension hides the store's products immediately) | MVP |
| ADM-4 | Buyer management: list, search, deactivate | MVP |
| ADM-5 | Product management: list all products, edit, deactivate. Moderation queue when `product_moderation_enabled` is on | MVP |
| ADM-6 | Category CRUD and re-ordering | MVP |
| ADM-7 | Full order view (parent plus every sub-order). Admin can cancel and refund | MVP |
| ADM-8 | Payments and refunds ledger, with a reconciliation view against Razorpay | MVP |
| ADM-9 | Commission rules: global default, plus per-category and per-store overrides. GST on commission | MVP |
| ADM-10 | Settlements: generate from a store's unsettled ledger entries, review, approve (issues the commission invoice), mark paid with a UTR, or carry a negative balance forward | MVP |
| ADM-11 | Review moderation (hide or restore) | MVP |
| ADM-12 | Featured products and featured stores | MVP |
| ADM-13 | Platform settings: moderation, order expiry, default return window, COD rules (on/off, max value, fee), GST slab list, commission GST, TCS/TDS rates, platform legal and GST details | MVP |
| ADM-14 | Reports: sales, commission revenue, ad revenue, GST summary (for filing), TCS/TDS per seller by month. CSV export | MVP |
| ADM-16 | Ad management: see §3.11 | MVP |
| ADM-17 | Return escalations: overrule a seller's rejection and force a refund | MVP |
| ADM-18 | COD refunds queue: pay the buyer by bank/UPI, record the UTR | MVP |
| ADM-15 | Audit log viewer for every admin action | MVP |

### 3.8 Reviews and notifications (REV / NTF)

| ID | Requirement | Scope |
|----|-------------|-------|
| REV-1 | Only buyers with a **delivered** order line for the product can review it, once per product. Rating 1–5 with optional title and text | MVP |
| REV-2 | Product average rating and count are kept denormalised for fast listing | MVP |
| NTF-1 | In-app notification bell (unread count, mark read) | MVP |
| NTF-2 | Transactional emails: verification, password reset, order placed, status changes, return updates, invoice ready, seller approved/rejected, settlement paid | MVP |

### 3.9 GST and invoicing (TAX)

| ID | Requirement | Scope |
|----|-------------|-------|
| TAX-1 | Every seller has a valid GSTIN (format + checksum validated). PAN must match the GSTIN | MVP |
| TAX-2 | Every product has an HSN code and a GST rate from the admin-managed slab list. Prices shown to buyers are GST-inclusive | MVP |
| TAX-3 | At checkout, each line is split into taxable value + CGST/SGST (seller and buyer in the same state) or IGST (different states) | MVP |
| TAX-4 | A seller tax invoice (PDF, gap-free number series per seller per financial year) is issued when a sub-order ships. Credit note when a return is refunded | MVP |
| TAX-5 | The platform issues a commission tax invoice to the seller (18% GST on commission) with each settlement | MVP |
| TAX-6 | TCS (GST s.52) and TDS (Income Tax s.194-O) are deducted in the seller ledger at configurable rates, with monthly per-seller reports for filing | MVP |
| TAX-7 | GST e-invoicing (IRN) for sellers above the turnover threshold | Later, via a GSP API |

### 3.10 Returns (RET)

| ID | Requirement | Scope |
|----|-------------|-------|
| RET-1 | The buyer can request a return for delivered, returnable items within the return window (category override → platform default of 7 days). Partial quantities are allowed | MVP |
| RET-2 | The request includes a reason code, description and up to 5 photos | MVP |
| RET-3 | The seller approves (and arranges the pickup or return shipment their own way, entering tracking) or rejects with a reason. A seller with no response in 48 h triggers an admin alert | MVP |
| RET-4 | The buyer can escalate a rejection to an admin, who can overrule it | MVP |
| RET-5 | When the seller marks it received, the refund starts: original gateway for online orders, bank/UPI transfer for COD. Stock is optionally restocked | MVP |
| RET-6 | The refund covers item value. Shipping is also refunded when the reason is damaged, defective or wrong item | MVP |
| RET-7 | Seller payout for a sub-order is posted to the ledger only after its return window closes with no open return | MVP |

### 3.11 Advertising (ADS): second revenue stream

| ID | Requirement | Scope |
|----|-------------|-------|
| ADS-1 | Ad slots on the storefront: a homepage hero **carousel** at the top, a top strip, a mid-page banner, listing top banner and sidebar, product-page banner, cart banner, and sponsored-product rows (full list in DATABASE_SCHEMA §2.26) | MVP |
| ADS-2 | Each slot has a fixed creative size, a max number of items and a carousel rotation interval. When no paid ad is live, a **house ad** (the platform's own promo) fills the slot, so there is never an empty gap | MVP |
| ADS-3 | Admin creates ads for three advertiser types: **house**, **seller** (charged to their ledger) and **external brand** (paid offline). Each ad has creative images (desktop and mobile), a link, schedule, priority, optional category targeting, and a pricing model (fixed / CPM / CPC) with an optional budget | MVP |
| ADS-4 | Sponsored products appear inside listings and on product pages, clearly labelled **"Sponsored"** (ASCI guidelines), and only for in-stock active products | MVP |
| ADS-5 | Impressions (counted when ≥ 50% visible) and clicks are tracked per ad per day. Admin and seller see CTR and spend. The ad auto-pauses when its budget is reached or it reaches its end date | MVP |
| ADS-6 | No ads on checkout, payment, login, account or seller/admin pages. No third-party ad scripts in v1 (security, see SECURITY T18) | MVP |
| ADS-7 | Self-serve seller ad buying (seller picks slot and budget, pays from balance or Razorpay) | v1.1 |
| ADS-8 | Google AdSense / third-party network in selected storefront slots | Later (needs a CSP review) |

## 4. Non-functional requirements

| Area | Target |
|------|--------|
| Performance | Listing/search API p95 < 400 ms at 50k products on one VPS. Home page LCP < 2.5 s on 4G |
| Availability | 99.5% (single VPS, MVP). Daily backups, RPO ≤ 24 h, RTO ≤ 4 h |
| Security | OWASP ASVS L2-style controls. See SECURITY_GUIDELINES.md |
| Accessibility | WCAG 2.1 AA for buyer flows: keyboard navigation, labels, contrast ≥ 4.5:1 |
| Responsiveness | 360 px → 1440 px+. Dashboards usable on tablets |
| Browser support | Last 2 versions of Chrome, Edge, Firefox, Safari (desktop and mobile) |
| Locale | INR, `en-IN` number formatting, IST display. All strings in `en.js` so other languages can be added later |
| Auditability | All money movements and admin actions are traceable |
| Maintainability | Backend test coverage ≥ 80% on `services/` and permissions. Lint passes in CI |

## 5. MVP scope (confirmed 2026-11-11)

**In:** everything marked MVP above. That covers the full buyer journey with variants, online payments + COD, multi-seller split orders with seller-defined delivery, GST invoicing, returns, the seller portal, the admin portal, the commission + ledger-based settlements, and the ad slot system.

**Not in v1:** coupons (client decision), self-serve ad buying, third-party ad networks, courier API integrations, e-invoicing (IRN), search suggestions, wishlist, OTP login, automated payouts, buyer–seller messaging.

## 6. Working assumptions (still adjustable)

1. India-only, INR-only, prices **inclusive of GST**.
2. Each seller defines their own shipping methods and enters tracking by hand. No courier API in v1.
3. Commission: default 10% of item value (incl. GST, excl. shipping) plus 18% GST on the commission. Admin-configurable per category and per store.
4. Return window: 7 days after delivery (category override possible, e.g. 0 for innerwear). The seller arranges the return shipment.
5. Settlements: weekly. Entries are posted once the return window closes.
6. COD: enabled, max order value ₹10,000, no COD fee. All admin-configurable.
7. Product moderation is **on** at launch.
8. One seller account owns exactly one store. One account has one role.
9. Login is required for checkout (the guest cart is kept and merged).
10. Year-1 scale: < 50k products, < 1k orders/day.

## 7. Business decisions (answered)

| # | Question | Client answer → design |
|---|----------|------------------------|
| Q1 | Brand | "Choose one" → working brand **Kartiva** ("Every seller. One cart."). **The client must run a trademark (IP India) and domain availability check before launch.** Renaming needs only a change to `en.js` + logo + tokens |
| Q2 | Variants | **Yes** → `product_variants`, variant-level stock/price/SKU/images |
| Q3 | Shipping | **Each vendor ships their own way** → per-seller `shipping_methods` (standard / express / local delivery / store pickup), buyer picks per seller |
| Q4 | GST | **Must** → mandatory seller GSTIN, HSN + rate per product, CGST/SGST/IGST split, seller invoices + credit notes, platform commission invoices, TCS/TDS in the ledger. *Rates and the shipping-GST treatment must be confirmed by the client's CA* |
| Q5 | Payment / delivery types | **All are a must** → every Razorpay online method + COD |
| Q6 | Commission | **Admin earns commission from all vendors** → global + category + store rules |
| Q7 | Coupons | **No** → removed |
| Q8 | Settlement cycle | Not answered → weekly, after the return window |
| Q9 | Returns | **Yes** → full return workflow |
| Q10–Q13 | Docs, guest checkout, dual role, scale | Not answered → defaults in §6 |
| New | **Ads for income** | Ad slot system with a top carousel and multiple banner/sponsored spaces (§3.11) |

### Remaining questions (non-blocking, needed before launch)

For the client demo these use **sample values**: "Kartiva Marketplace Private Limited", a sample Chennai address and GSTIN, ads sold to both sellers and outside brands, and a sample rate card (see `frontend/src/data/platform.js` and `ads.js`).


1. The platform's legal entity name, GSTIN and registered address (they go on commission invoices).
2. Who sells ad space at first: sellers only, outside brands too, or both? (The system supports both.)
3. Ad pricing: fixed weekly/monthly price per slot, or CPM/CPC? (All are supported. The client sets rates.)
