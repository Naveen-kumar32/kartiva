## What & why

<!-- What changed, and why. Link the issue / SRS requirement ID. Add screenshots for UI changes. -->

## Checklist

**Quality**
- [ ] Lint, build and tests pass locally (`npm run lint`, `npm run build`, `npm run e2e`)
- [ ] Tests added or updated for new behaviour
- [ ] Day-1 conventions: barrels, `en.js` A→Z, routes in `routes.js`, Formik + Yup factories, slices without API imports
- [ ] `docs/DEVELOPMENT_PROGRESS.md` updated if a checklist item is done

**Security**
- [ ] No secrets, keys or real customer data committed
- [ ] Seller endpoints/querysets are scoped to the caller's store
- [ ] Prices, totals, seller IDs and payment status are computed or verified on the server

**Portability (docs/AWS_MIGRATION.md §1)**
- [ ] New config comes from env vars, and `.env.example` is updated
- [ ] Nothing is written to local disk (files go through the storage adapter)
- [ ] Schema changes are in a committed migration, backward-compatible for one release
