# UI Design Guidelines

Status: **approved direction** (Phase 1, rev 2). Brand chosen by us at the client's request.

## 0. Brand: Kartiva

| Item | Value |
|------|-------|
| Name | **Kartiva** (from "kart" + "-iva", meaning lively. Easy to say in English and Indian languages) |
| Tagline | *Every seller. One cart.* |
| Logo (Phase 2) | Wordmark in Inter Bold with a shopping-bag "K" monogram. SVG in `src/assets/logo.svg`. Monogram used as favicon |
| Personality | Reliable, local-friendly, value-conscious, modern |
| Primary colour | **Kartiva Teal** `#0E7C7B` (trust, distinct from the yellow/blue used by the big marketplaces) |
| Accent | **Marigold** `#F59E0B` (purchase CTAs only) |
| Before launch | The client must check the trademark (IP India, classes 35 and 9) and domain availability. A rename changes only `EN.APP.NAME`, the logo and the tokens |

## 1. Design direction

**"Trustworthy, fast, dense but calm."** Shoppers compare a lot of products, so the storefront favours information density (Flipkart-style grids and filters). It also uses generous whitespace around key decisions: price, Add to cart, checkout.

- **Original identity.** No Amazon or Flipkart colours, logos, icons or layouts are copied. Only common e-commerce patterns are reused (top search bar, left filter rail, seller-grouped cart).
- **Two visual modes, one token set:**
  - *Storefront*: brand colour, product imagery, warm accent for primary purchase CTAs.
  - *Dashboards (seller/admin)*: neutral surfaces, brand colour only for focus and primary actions, data first.
- **Restrained motion.** 150–250 ms transitions. Framer Motion only for drawers, modals, toasts, the add-to-cart feedback and page fades. `prefers-reduced-motion` is honoured.

## 2. Design tokens (draft)

Defined in the Tailwind v4 `@theme` block in `frontend/src/index.css` (Tailwind v4 has no `tailwind.config.js`). A re-brand means editing these values only. Chart colours (`src/constants/charts.js`) were checked with a colour-blind-safety validator.

### Colour

| Token | Light | Use |
|-------|-------|-----|
| `--color-brand-600` | `#0E7C7B` Kartiva Teal | Primary buttons, links, focus |
| `--color-brand-50…900` | `#ECFDF9` … `#0B3F3F` scale | Hover, backgrounds, badges |
| `--color-accent-500` | `#F59E0B` Marigold | **Add to cart / Buy now only** |
| `--color-sponsored` | `#64748B` | "Sponsored" label (neutral, always readable) |
| `--color-success-600` | `#16A34A` | In stock, delivered, toasts |
| `--color-warning-600` | `#D97706` | Low stock, pending |
| `--color-danger-600` | `#DC2626` | Errors, cancel, out of stock |
| `--color-info-600` | `#0284C7` | Shipped, info |
| `--color-surface` / `--color-surface-muted` | `#FFFFFF` / `#F8FAFC` | Cards / page background |
| `--color-border` | `#E2E8F0` | |
| `--color-text` / `--color-text-muted` | `#0F172A` / `#475569` | Contrast ≥ 4.5:1 on surfaces |

### Typography

- Font: **Inter** (UI) with the system-ui fallback stack. Tabular numbers (`font-variant-numeric: tabular-nums`) for prices and tables.
- Scale (rem): `xs .75`, `sm .875`, `base 1`, `lg 1.125`, `xl 1.25`, `2xl 1.5`, `3xl 1.875`, `4xl 2.25`.
- Weights: 400 body, 500 labels, 600 headings and prices, 700 hero only.

### Spacing, radius, elevation

- 4 px base grid (Tailwind default spacing).
- Radius: `sm 6px` inputs, `md 10px` cards, `lg 16px` modals and hero, `full` pills.
- Shadows: `card` (subtle), `raised` (hover), `overlay` (modals and drawers).

### Breakpoints

`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1440`. Container max width 1440 px.

## 3. Core components (`src/components/*`, barrel-exported)

| Group | Components | Notes |
|-------|-----------|-------|
| ui | `Button` (primary/secondary/accent/ghost/danger, sizes, loading), `FormInput`, `FormSelect`, `FormTextarea`, `Checkbox`, `RadioGroup`, `Badge`, `Modal`, `Drawer`, `Dropdown`, `Tabs`, `Pagination`, `Rating`, `PriceTag` (price, MRP struck, % off), `QuantityStepper`, `Skeleton`, `Spinner`, `Tooltip` | Form components take Formik props: `name`, `value`, `onChange`, `onBlur`, `error`, `touched`, and render a label plus `aria-describedby` error text |
| feedback | `EmptyState` (illustration, title, action), `ErrorState` (retry), `PageLoader` | Every list page has a skeleton, empty and error state |
| layout | `Navbar`, `SearchBar`, `CategoryMenu` (mega-menu desktop / drawer mobile), `Footer`, `Breadcrumbs`, `Sidebar`, `DashboardHeader` | |
| product | `ProductCard`, `ProductGrid`, `ProductGallery`, `FilterPanel`, `SortSelect`, `ReviewList`, `ReviewForm`, `StoreCard` | |
| cart | `CartSellerGroup`, `CartLine`, `CartSummary` | |
| dashboard | `StatCard`, `DataTable` (sort, pagination, row actions), `StatusBadge`, `ChartCard` | |
| product (variants) | `VariantSelector`: colour swatches (image or colour chip), size chips, other attributes as chips. Unavailable combinations shown crossed out, out-of-stock greyed out | Selecting a variant updates price, stock, SKU and gallery images, and the URL (`?v=123`) |
| ads | `AdSlot slotKey`, `AdCarousel` (autoplay at the slot interval, pause on hover/focus, dots + arrows, swipe), `AdBanner`, `SponsoredProductRow`, `SponsoredBadge` | Fixed aspect ratio (no layout shift), lazy images, `rel="sponsored noopener"`. Renders nothing if the slot returns no items |

### Product card anatomy

```
┌───────────────────────┐
│  [image 1:1, lazy]  ♡ │  ← discount badge top-left ("-23%")
├───────────────────────┤
│ Brand (muted, xs)     │
│ Product name (2 lines)│
│ ★ 4.3 (1,204)         │
│ ₹1,299  ₹1,699  23%off│
│ by Store Name         │
│ [Only 3 left]         │  ← low stock / out of stock
└───────────────────────┘
```

## 4. Page structure (site map)

### Storefront (`StorefrontLayout`: Navbar + Footer)

| Route | Page | Key sections |
|-------|------|--------------|
| `/` | Home | See the homepage wireframe below |
| `/c/:slug` | Category | Ad: `listing_top_banner`. Breadcrumbs, subcategory chips, FilterPanel (incl. Colour/Size facets) + ad `listing_sidebar` below it, SortSelect, grid with `listing_sponsored` cards in the first rows, pagination |
| `/search?q=` | Search results | Same as category + "results for …" |
| `/p/:slug` | Product detail | Gallery (follows the selected variant), title/brand/rating, PriceTag, **VariantSelector**, stock, quantity, Add to cart / Buy now, **pincode delivery check** (seller's methods, ETA, COD available), return policy, ad `product_below_buybox`, seller card, specifications, description, reviews, related products, `product_sponsored_row` |
| `/store/:slug` | Store | Banner, logo, rating, about, return policy, product grid with filters |
| `/cart` | Cart | Groups per seller (subtotal + shipping estimate each), summary sidebar (sticky), warnings, empty state, ad `cart_bottom_banner` |
| `/checkout` | Checkout (no ads) | Stepper: Address → Delivery (method radio cards per seller) → Payment (Online: UPI/cards/net banking/wallets/EMI via Razorpay · Cash on Delivery, with the reason shown when unavailable) → Review (GST breakdown, optional GSTIN) → Pay / Place order |

#### Homepage wireframe (desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [ad: home_strip_top – thin promo strip, dismissible]                 │
├──────────────────────────────────────────────────────────────────────┤
│ KARTIVA  [All categories ▾] [ Search products, brands, stores 🔍 ] ♥ 👤 🛒│
│ Mobiles · Fashion · Home · Electronics · Beauty · Grocery · More ▾   │
├──────────────────────────────────────────────────────────────────────┤
│ ◀ [ad: home_hero_carousel – full-width rotating slides, 3–6 items] ▶ │
│                         • ○ ○ ○                                       │
├──────────────────────────────────────────────────────────────────────┤
│ Shop by category  [tile][tile][tile][tile][tile][tile]               │
│ Featured products [card][card][card][card][card] →                   │
│ [ad: home_mid_banner – wide banner]                                  │
│ Trending now      [card][card][card][card][card] →                   │
│ Sponsored picks   [card·Sponsored][card·Sponsored]… (home_sponsored) │
│ New arrivals      [card][card][card][card][card] →                   │
│ Featured stores   [store][store][store][store]                       │
│ Sell on Kartiva — CTA band                                           │
├──────────────────────────────────────────────────────────────────────┤
│ Footer: About · Help · Returns policy · Sell · Advertise with us ·   │
│ Terms · Privacy · Grievance officer · © Kartiva                      │
└──────────────────────────────────────────────────────────────────────┘
```

Mobile: strip → compact header + full-width search → carousel (swipe, 16:9 mobile creative) → category scroller → rows as horizontal scrollers.
"Advertise with us" leads to a simple contact page (`/advertise`) that lists the slots and creates a lead for the admin.
| `/order/success/:orderNumber` | Confirmation | |
| `/sell` | Become a seller | Marketing page → seller registration |

### Auth (`AuthLayout`: centred card, brand side panel on desktop)

`/login`, `/register`, `/seller/register`, `/forgot-password`, `/reset-password/:uid/:token`, `/verify-email/:uid/:token`

### Buyer account (`AccountLayout`: side nav)

`/account/profile`, `/account/addresses`, `/account/orders`, `/account/orders/:orderNumber` (timeline per sub-order, tracking, invoice download, cancel, return, review), `/account/returns`, `/account/returns/:returnNumber`, `/account/notifications`, `/account/security`

### Seller (`SellerLayout`: collapsible sidebar + header, lazy chunk)

`/seller/onboarding` (multi-step: Business & GST → Store → Bank → Documents → Review & Submit, then a status screen), `/seller` (dashboard), `/seller/products`, `/seller/products/new` and `/seller/products/:id/edit` (sections: Basics, Tax (HSN/GST), Variants (option builder → editable grid of SKU/MRP/price/stock), Images, Specs), `/seller/inventory` (per variant), `/seller/shipping` (delivery methods), `/seller/orders`, `/seller/orders/:subOrderNumber`, `/seller/returns`, `/seller/earnings` (balance, ledger, settlements, invoices), `/seller/ads`, `/seller/store`

### Admin (`AdminLayout`: sidebar + header, lazy chunk)

`/admin` (dashboard), `/admin/sellers` (tabs: Pending / Approved / Rejected / Suspended), `/admin/sellers/:id`, `/admin/buyers`, `/admin/products` (moderation tab), `/admin/categories`, `/admin/orders`, `/admin/orders/:orderNumber`, `/admin/payments`, `/admin/refunds` (incl. COD refund queue), `/admin/returns` (escalations), `/admin/commissions`, `/admin/settlements`, `/admin/ledger`, `/admin/tax` (documents + GST/TCS/TDS reports), `/admin/ads` (slots, ads, schedule, stats, revenue), `/admin/reviews`, `/admin/featured`, `/admin/reports`, `/admin/settings`, `/admin/audit-log`

### Errors

`/403`, `*` (404)

All paths are defined once in `src/locales/routes.js`. Example:

```js
export const ROUTES = {
  ADMIN: { DASHBOARD: "/admin", SELLERS: "/admin/sellers", ... },
  HOME: "/",
  PRODUCT: (slug) => `/p/${slug}`,
  ...
};
```

## 5. Responsive behaviour

| Element | Mobile (< 768) | Tablet | Desktop (≥ 1024) |
|---------|---------------|--------|------------------|
| Navbar | Logo + icons. Search on its own row. Hamburger → category drawer | Same, wider search | Single row: logo, category menu, search, account, cart |
| Product grid | 2 columns | 3 | 4–5 |
| Filters | Bottom sheet "Filter / Sort" buttons | Bottom sheet | Left rail |
| Product detail | Swipe gallery, sticky bottom bar (price + Add to cart) | Two columns | Two columns + sticky buy box |
| Cart summary | Sticky bottom total + checkout button | Below | Sticky sidebar |
| Dashboards | Sidebar becomes a drawer. Tables become stacked cards | Collapsed icon sidebar | Full sidebar |

## 6. States and feedback

- **Loading:** skeletons that match the final layout (cards, table rows, detail page). Spinners only inside buttons.
- **Empty:** illustration + one sentence + primary action (e.g. empty cart → "Continue shopping").
- **Error:** inline `ErrorState` with **Retry**. Never a blank page.
- **Success:** `successToast()` for completed actions. Add to cart shows a toast with "View cart".
- **Form validation:** Yup messages from `en.js`, shown under each field after blur or submit. The submit button shows a loading state. Server `errors` map onto fields.
- **Optimistic UI:** only for cart quantity and notification read. Rolled back on error.

## 7. Accessibility checklist

- Every input has a `<label>`. Errors are linked with `aria-describedby` and announced (`role="alert"`).
- Visible focus ring (`ring-2 ring-brand-500 ring-offset-2`). Logical tab order. Modals trap focus and close on Esc.
- Images have `alt`. Decorative images use `alt=""`.
- Colour is never the only signal (status badges include text).
- Touch targets ≥ 44 × 44 px.
- Carousels can be paused and use buttons, not swipe only.

## 8. Text and localisation rules

- All visible strings come from `src/locales/en.js`. Top-level sections and keys are sorted **A→Z**:

```js
export const EN = {
  AUTH: { EMAIL_LABEL: "Email address", LOGIN_TITLE: "Sign in", ... },
  CART: { EMPTY_TITLE: "Your cart is empty", SOLD_BY: "Sold by", ... },
  ...
  VALIDATION: { EMAIL_INVALID: "Enter a valid email address", REQUIRED: "This field is required", ... },
};
```

- Currency: `formatCurrency(value)` → `₹1,299.00` (`en-IN`). Dates: `formatDate()` in IST.
