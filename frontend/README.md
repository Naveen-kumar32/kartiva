# Kartiva — Frontend

React 19 + Vite + Tailwind CSS v4 SPA (storefront, seller hub, admin). JavaScript only.

## Run the demo

```bash
cd frontend
npm install
cp .env.example .env      # VITE_DATA_MODE=mock uses sample data, no backend needed
npm run dev               # http://localhost:5173
```

Demo accounts (also clickable on the login page), password `Demo@123`:

| Role | Email | Lands on |
|------|-------|----------|
| Buyer | buyer@kartiva.demo | storefront / checkout |
| Seller | seller@kartiva.demo | /seller (TechNest India) |
| Admin | admin@kartiva.demo | /admin |

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | oxlint + `en.js` A→Z key-order check |
| `npm run e2e` | Playwright smoke test (start `npm run dev` first; `npx playwright install chromium` once). Screenshots go to `e2e/screenshots/` |
| `npm run generate:mock -- <products.json> src/data` | Rebuild sample catalogue (`scripts/generate-mock-data.py`) |

## Conventions

See `docs/PROJECT_OVERVIEW.md §4`: barrel `index.js` in every `src/` folder, all text in `src/locales/en.js` (sorted A→Z),
paths in `src/locales/routes.js`, one Axios instance (`src/config`), Formik + Yup factory schemas, Redux slices never import the API layer.

## Demo data is live

All actions (new categories, products, orders, returns, settlements, ads, letters) are saved in the browser
(`localStorage` key `kartiva.mockDb.v3`) and shared between the buyer, seller and admin logins.
**Admin → Settings → Reset demo data** restores the original sample data.

Emails are recorded in **Admin → Letters & mail → Outbox**; real sending arrives with the backend (SMTP).

## Sample data

`src/data/*` is **fictional demo data**: stores, GSTINs, the platform company details, ads and dashboard figures are placeholders.
Product names/photos come from the public DummyJSON sample catalogue (images hot-linked from its CDN — internet required).
# kartiva
