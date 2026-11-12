# Testing Guide

Status: **strategy (Phase 1)**. Commands and fixtures are added as each phase lands.

## 1. Test layers

| Layer | Tool | What | Where |
|-------|------|------|-------|
| Backend unit/service | `pytest`, `pytest-django`, `factory_boy` | Services (checkout, capture, cancel, settlement maths), validators, permissions | `backend/apps/*/tests/` |
| Backend API | DRF `APIClient` | Every endpoint: auth, status codes, isolation, payload shape | same |
| Concurrency | `pytest` + `TransactionTestCase` + threads | Two buyers buying the last unit, verify vs webhook race | `apps/orders/tests/test_concurrency.py` |
| Payment | Mock gateway + recorded Razorpay fixtures + signature helpers | Success, failure, duplicate callback, late capture, refunds | `apps/payments/tests/` |
| Frontend unit | Vitest + React Testing Library | Validators (Yup factories), utils (currency, authRedirect), key components (CartSummary, ProtectedRoute) | `frontend/src/**/*.test.jsx` |
| End-to-end | Playwright (Chromium headless, `--no-sandbox`) | Critical journeys with screenshots, failing on console errors | `frontend/e2e/` |
| Responsive | Playwright viewports 375 / 768 / 1280 | Screenshots of key pages | `frontend/e2e/responsive.spec.js` |
| Manual UAT | Checklist | Razorpay test mode with real test cards/UPI, emails | §5 |

Targets: ≥ 80% line coverage for `services/`, `permissions.py` and `payments/`. 100% of the critical scenarios in §2 automated.

## 2. Critical scenario matrix

| Area | Scenario | Layer |
|------|----------|-------|
| Registration | Buyer registers. Duplicate email (case-insensitive) rejected. `role` in payload ignored | API |
| Registration | Seller registers → `draft` → submit → `pending` | API |
| Approval | Admin approves → seller can create products. Reject with reason → seller edits and resubmits | API |
| Approval | Suspend → seller's products disappear from public listings immediately | API |
| Products | Create, edit, soft delete. Price > MRP rejected. Moderation on/off paths | API |
| Products | Visibility: draft, pending, rejected, inactive, deleted and suspended-store products are never public | API |
| Images | Valid upload, >5 MB rejected, fake extension rejected, max 8 | API |
| Cart | Add/update/remove. Quantity > stock rejected. Guest cart merge. Price change warning | API + E2E |
| Multi-seller | Cart with 3 stores → checkout creates 1 order + 3 sub-orders. Totals per seller correct | Service |
| Inventory | Stock decremented at checkout, restored on expiry, failure and cancel. Ledger rows written | Service |
| Inventory | Two concurrent checkouts for the last unit → exactly one succeeds | Concurrency |
| Idempotency | Same `Idempotency-Key` twice → same order, stock decremented once | API |
| Payment ✓ | Valid signature + captured → order `confirmed`, sub-orders `confirmed`, cart cleared, notifications | Service |
| Payment ✗ | Invalid signature → 400, order unchanged. `payment.failed` webhook → order `payment_failed`, stock released | Service |
| Duplicates | Verify then webhook, webhook then verify, webhook twice → single capture, single email | Service |
| Late capture | Captured after expiry → re-reserve or auto-refund | Service |
| Cancellation | Buyer cancels one of two sub-orders → partial refund equals that sub-order total. Other sub-order unaffected | Service |
| Refund limits | Refunds cannot exceed the captured amount | Service |
| Commission | Store override > category > global. Rounding at line level. 18% GST on commission | Unit |
| Variants | Option grid generation, duplicate attribute combination rejected, per-variant stock reservation, `min_price`/`total_stock` denormalisation | Service |
| Shipping | Pincode serviceability (full + prefix), free-above threshold, store pickup, a different method per seller in one order | Service |
| GST | Intra-state CGST+SGST vs inter-state IGST. Each slab (0/5/18/40). `taxable + tax = line_total` to the paisa. Shipping GST | Unit |
| Invoices | Issued on ship. Gap-free numbering under concurrency. Credit note on return refund. Numbers ≤ 16 chars, reset per FY | Service + Concurrency |
| COD | Eligibility rules. Order confirmed without payment. Collected on delivery. Undelivered → restock. COD refund → bank-transfer queue | Service |
| Returns | Window, returnable flag, partial quantities, reject → escalate → admin override, receive → restock + refund + credit note | Service + API |
| Ledger | Online and COD sub-orders post the correct signed entries. Refund after payout → negative entry. TCS/TDS amounts | Service |
| Settlement | Sum of unsettled entries + opening balance. Positive → paid with UTR. Negative → carried forward | Service |
| Ads | Live-ad selection (schedule, status, budget, targeting, priority, house fallback), impression/click counting + de-dupe, CPM/CPC cost roll-up, auto-pause, seller `ad_charge` entries, no ads served on checkout | Service + E2E |
| Isolation | Seller A vs Seller B on every `/seller/*` endpoint → 404 | API (parametrised) |
| Permissions | Buyer → seller/admin APIs 403. Anonymous → 401. Admin can view any order | API (parametrised) |
| Reviews | Only after delivery, once per product | API |
| E2E buyer | Browse → search → filter (Colour) → PDP pick variant → cart (2 sellers) → pick a delivery method per seller → pay online (mock) → success → orders → invoice. Repeat with COD. Request a return | Playwright |
| E2E seller | Register → onboarding → (admin approves) → add product with images → receives sub-order → ships | Playwright |
| E2E admin | Approve seller, moderate product, view full order, create settlement, mark paid | Playwright |
| Responsive | Home, category, PDP, cart, seller dashboard at 375/768/1280 without horizontal scroll | Playwright |

## 3. Conventions

- Factories for every model (`UserFactory`, `ApprovedSellerFactory`, `ProductFactory(store=…)`, `PaidOrderFactory`).
- Gateway calls are never made to the real network in automated tests. `PAYMENT_GATEWAY=mock` or `responses`/`respx` stubs with signatures computed from a test secret.
- Each bug fix comes with a regression test.
- E2E scripts listen to `page.on("console")` and `page.on("pageerror")` and fail on errors (Day-1 notes §23).

## 4. Commands (filled in as phases land)

```bash
# backend/ (venv active)
pytest                       # all tests
pytest --cov=apps --cov-report=term-missing

# frontend/
npm run lint
npm run test                 # vitest
npx playwright install chromium
npm run e2e                  # playwright
```

## 5. Manual UAT checklist (pre-launch, Razorpay test mode)

- [ ] Card success, card failure, UPI success (test VPA), net-banking success, dismiss the checkout modal
- [ ] Close the tab right after paying → order still confirmed through the webhook within 1 minute
- [ ] Refund appears in the Razorpay dashboard and the refund webhook updates status
- [ ] All transactional emails received and links work
- [ ] Keyboard-only checkout possible. Screen-reader labels on forms
