# Development Progress

Last updated: 2026-11-11

Legend: ✅ done · 🟡 in progress / awaiting input · ⬜ not started

## Phase 1: Requirements & Architecture ✅

- ✅ Rev 2: client answers applied (brand Kartiva, variants, seller shipping methods, GST invoicing, all online methods + COD, returns, commission, ad slots, no coupons)

- ✅ Requirements analysis and SRS ([SOFTWARE_REQUIREMENTS.md](SOFTWARE_REQUIREMENTS.md))
- ✅ MVP scope recommendation
- ✅ System architecture, key flows, decision log ([SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md))
- ✅ Database schema + ER diagram ([DATABASE_SCHEMA.md](DATABASE_SCHEMA.md))
- ✅ API endpoint design ([API_DOCUMENTATION.md](API_DOCUMENTATION.md))
- ✅ Folder structure (frontend / backend / root common files)
- ✅ UI direction + page map ([UI_DESIGN_GUIDELINES.md](UI_DESIGN_GUIDELINES.md))
- ✅ Security risks and controls ([SECURITY_GUIDELINES.md](SECURITY_GUIDELINES.md))
- ✅ Test strategy ([TESTING_GUIDE.md](TESTING_GUIDE.md))
- ✅ Effort estimate and scaling path
- ✅ Engineering workflow: Git, branching, PRs, CI, environments ([ENGINEERING_WORKFLOW.md](ENGINEERING_WORKFLOW.md))
- ✅ Operations plan: monitoring, backups (RPO/RTO), performance targets, maintenance, incidents ([OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md))
- ✅ AWS migration readiness: 14 portability rules + migration/data-transfer plan ([AWS_MIGRATION.md](AWS_MIGRATION.md))
- ✅ Handover & business operations plan, DPDP responsibilities ([HANDOVER.md](HANDOVER.md))
- ✅ CI: `.github/workflows/ci.yml` (lint, build, npm audit, E2E against production build, gitleaks), Dependabot, PR template
- ⬜ Put the repo under Git on a client-owned GitHub organisation (needs client's GitHub account)
- ✅ Root common files: `README.md`, `.gitignore`, `.editorconfig`
- ✅ Client answers to Q1–Q9 (SRS §7). Q10–Q13 use the defaults
- 🟡 Before launch (non-blocking): platform legal entity + GSTIN, CA sign-off on GST/TCS/TDS, trademark/domain check for "Kartiva", ad pricing — **sample placeholder values are used in the demo** (`frontend/src/data/platform.js`, `ads.js`)

## Phase 2: UI/UX & Frontend Foundation 🟡 (client demo ready — 2026-11-11)

Demo scope built on mock data (`VITE_DATA_MODE=mock`). Verified: `npm run build` ✓, `npm run lint` ✓ (0 warnings, en.js order ✓), Playwright smoke test 12/12 ✓ with no console errors.

- ✅ Vite + React 19 scaffold, `@` alias, oxlint, Tailwind v4 (tokens in `src/index.css` `@theme`)
- ✅ `locales/en.js` (A→Z, checked by script) + `locales/routes.js`
- ✅ `config/` axiosInstance, apiConfig, setupInterceptors (refresh-on-401, no store import)
- ✅ Redux store: auth / cart / ui slices (no API imports), cart + user profile persisted
- ✅ Mock data: 29 categories, 183 products / 346 variants, 9 fictional sellers with own delivery methods, 23 ads in 10 slots
- ✅ API layer with mock + api branches (`src/api/*`)
- ✅ Components with barrels: ui, feedback, layout, product, cart, ads, dashboard
- ✅ Layouts: Storefront, Auth, Dashboard (seller/admin, lazy-loaded chunks)
- ✅ Home (top strip, hero ad carousel, mid banner, sponsored row), category/search listing with facets incl. Colour/Size + sponsored results, product detail (variant selector, pincode delivery check, reviews, sponsored row), store page
- ✅ Cart grouped by seller, multi-step checkout (address → per-seller delivery → online/COD → GST review → simulated Razorpay), order success, My orders (split shipments)
- ✅ Login/Register (Formik + Yup, demo accounts), role redirects, ProtectedRoute/GuestRoute
- ✅ Seller hub preview: dashboard (sales chart, low stock, recent orders, ledger), products, orders
- ✅ Admin preview: dashboard (GMV, commission + ad revenue chart, payment mix), seller approvals, ad manager, platform settings
- ✅ Sell on Kartiva + Advertise with us pages
- ✅ **Feature expansion (2026-11-11, round 2)** — persistent in-browser mock database (`src/api/mockDb.js`, key `kartiva.mockDb.v3`) so every action is real and shared across buyer/seller/admin; order state machine, returns, refunds, ledger and settlements in `src/api/orderOps.js`
- ✅ Seller Hub (12 pages): dashboard, products (tabs, duplicate, hide, delete), product form (variants grid, images, specs, HSN/GST), inventory (+/−, history), orders (drawer, ship/deliver/cancel), returns, delivery methods, earnings ledger + settlements, ads (promote product), reviews, store settings
- ✅ Admin (17 pages): dashboard with action alerts, orders, products moderation, **categories (create/edit/hide/reorder — live in storefront menu)**, sellers (applications create stores, suspend), buyers (COD block), returns & COD refund queue, commission rules + payout calculator, settlements, ad manager (create with preview, seller requests, slots), reports (6 reports, CSV + PDF), document centre, **letters & mail**, reviews moderation, audit log, settings (+ reset demo data)
- ✅ Buyer: cancel shipment, request return (COD refund to UPI/bank), escalate, tracking timeline, GST invoice / credit note / order summary / payment receipt downloads, email documents
- ✅ Documents (jsPDF, `src/utils/documents`): GST tax invoice, credit note, packing slip, shipping label, settlement statement, commission invoice, report PDFs, CSV exports, **company letterhead, letters, order summary, payment receipt**; email any document (mock Outbox until SMTP in backend)
- ✅ ErrorBoundary at app/layout level (no blank screens); Playwright smoke test 18/18
- ✅ **Feature expansion round 3 (2026-11-11): B2B marketplace (IndiaMART / Alibaba / JustDial style)**, mock DB key `kartiva.mockDb.v4`
  - 4 new sellers with their own products: Annapoorna Wholesale (bulk slab pricing), ChefPro Kitchen Equipment (manufacturer, MOQ), Jalandhar Sports Works (manufacturer/exporter), Velocity Motors (enquiry-only two-wheeler dealer). 3 more customer logins. Business profiles + trust badges on every store
  - Seller self-registration (GSTIN/PAN, business type) → pending store with a review banner → admin approval makes it live
  - Buyer: Get best price / enquiries, test-ride booking, bulk pricing + MOQ (recomputed at checkout), post a buy request (RFQ) and compare/accept quotes, messages, wishlist, profile & saved addresses, data download / deletion request, support tickets, notifications, CMS pages, announcement bar, supplier filters
  - Seller Hub (+10 pages, grouped sidebar): leads CRM, buy requests + quoting with plan credits, messages, customers CRM, analytics, business profile & KYC uploads, membership plans with invoice PDF, team roles, bulk CSV upload, support; wholesale/MOQ/enquiry-only in product form; onboarding checklist
  - Admin (+11 pages): analytics, leads & RFQs, KYC verification, membership plans (3rd revenue stream), support helpdesk with SLA, content & pages, broadcasts, staff & roles, risk & fraud, transactions ledger + reconciliation, tax centre (GST on fees, TCS/GSTR-8 working PDF, TDS 194-O)
  - Notification bell for all roles. Playwright smoke test 24/24
  - Alibaba-style category tree: 42 industries / 134 sub-categories (mock DB v5). Top bar shows admin-pinned categories ("Show in top menu" + short name) and an "All categories" mega menu. New `/categories` directory page and "Categories for you" on Home. Empty categories invite a buy request
  - Help centre & policies: 28 content pages in 6 groups (About, Buyer protection, Source, Help, Sell, Policies) incl. grievance officer (E-Commerce Rules 2020), cookie & IP policy; simple formatting (headings, lists, links) editable in Admin → Content; Alibaba-style footer (5 columns, newsletter, social, legal bar, payment methods); Report IP / violation / trade dispute form → support ticket. 
  - Product requests: customer buy requests are sent to matching sellers with full details (notification + email), tracked per seller (sent → viewed → quoted) in the new Admin → Product requests page, where admins can forward any request to any seller with a note; unmatched requests flagged "Needs sourcing". Mock DB v9
  - Order notifications for every step (placed, packing, shipped, delivered, cancelled, undelivered, returns, refunds, COD refund queue, settlements, payouts, low stock) to the right buyer / seller / admin; sample shipment tracking (stepper + courier scans) for buyer, seller and admin; NEW badges + highlighted rows + relative times + sidebar count bubbles for new orders and pending work; buyers no longer see the email-document option
- ✅ Hardening (2026-11-12, see [ENGINEERING_CHECKLIST.md](ENGINEERING_CHECKLIST.md)): session-checked ownership in every mock API (IDOR / tenant isolation fixed for buyer orders, returns, refunds and seller stores), mass-assignment whitelists, idempotent checkout, login lockout (5 tries → 15 min), forgot/reset password (single-use hashed token), 30-min idle sign-out for dashboards, open-redirect fix, axios retry with exponential backoff + X-Request-ID, Vitest 86 unit tests + performance budget in CI, Nginx/systemd/backup templates in `deployment/`
- ✅ Usability pass (2026-11-12): Seller Hub 22 → 12 sidebar sections and Admin 32 → 14, related pages as tabs, "Find a page" search, combined count bubbles; customer area is customers-only (sellers/admins redirected) with a "My account" home + side menu; plain wording for customers ("quote requests", "Request a quote"); no staff-only options (ticket priority) on the customer side; seller dashboard action chips for enquiries and messages
- ✅ Downloads & customer messaging (2026-11-12): every table/report downloads as PDF (letterhead) / Excel (.xlsx) / CSV via one Download menu; GST invoices on the seller's letterhead as PDF or Excel, invoice registers for admin and sellers; customers get email (order copy, receipt, invoice attached) + SMS/WhatsApp for every order step per their preferences (Profile → Order updates); Admin → Letters & mail shows the email outbox (attachments downloadable) and an SMS & WhatsApp tab; buttons never wrap text
- ⬜ Remaining Phase 2 items: empty-state illustrations

## Phase 3: Backend Foundation 🟡 (started 2026-11-12)

- ✅ Django 6 + DRF + SimpleJWT project in `backend/` (split settings, env config, request-id JSON logging, uniform `{detail}` errors), local PostgreSQL 18
- ✅ All tables (DocModel pattern, AD-27) + migrations; `seed_demo` loads the exact demo dataset
- ✅ Auth: login with lockout, httpOnly refresh cookie, logout (blacklist), buyer + seller sign-up, password reset; `/health/`, `/bootstrap/`
- ✅ Frontend api mode: Vite proxy, bootstrap hydration, `npm run dev:api`
- 🟡 Porting every API module to the backend (catalogue, orders, marketplace, Seller Hub, Admin)


- ⬜ Django project in `backend/`, split settings, env
- ⬜ PostgreSQL connection, `pg_trgm`
- ⬜ Apps scaffold with barrel packages
- ⬜ Custom User, JWT (cookie refresh), registration, login, email verify, password reset
- ⬜ Permission classes, uniform error handler, pagination, throttles
- ⬜ Storage, email and payment-gateway abstractions (mock implementations)
- ⬜ Audit log helper
- ⬜ Initial tests
- ⬜ Portability: `GET /api/v1/health/`, JSON logs to stdout, `CACHE_URL`, `backend/Dockerfile` + dev `docker-compose.yml`, storage keys on media/order items (AWS_MIGRATION P1–P14)
- ⬜ CI backend + docker jobs, Dependabot pip

## Phase 4: Seller System ⬜
## Phase 5: Buyer System ⬜
## Phase 6: Orders & Payments ⬜
## Phase 7: Admin System ⬜
## Phase 8: Testing ⬜
## Phase 9: VPS Deployment ⬜

(Detailed checklists for Phases 4–9 are added when each phase starts. The requirement IDs in the SRS are the source.)

## Decisions log

| Date | Decision |
|------|----------|
| 2026-11-11 | Adopted Day-1 notes conventions: barrel exports, `en.js` A→Z, `routes.js`, Formik + Yup factories, Redux Toolkit (slices without API imports), axios instance + interceptors, react-toastify, Playwright E2E |
| 2026-11-11 | Repo layout: `frontend/` + `backend/` + shared root files (`docs/`, `deployment/`, `.gitignore`, `.editorconfig`, `README.md`) |
| 2026-11-11 | Round 3: B2B features added on our initiative (enquiries, RFQ/quotes, membership plans as a 3rd revenue stream, KYC badges). Schema rev 3 (§2.31). Client to confirm membership pricing and contact-masking for free sellers |
| 2026-11-11 | AWS-portable by rule (AD-23), Dockerfile kept from Phase 3 (AD-24), trunk-based Git + GitHub Actions (AD-25), off-site backups to S3 ap-south-1 (AD-26) |
| 2026-11-11 | Client answers: variants yes, sellers ship their own way, GST mandatory, all payment types incl. COD, returns yes, coupons no, commission yes, ad spaces for revenue. Brand "Kartiva" chosen by us. Schema rev 2. Estimate now ≈ 23–25 weeks |
