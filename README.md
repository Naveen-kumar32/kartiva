# Kartiva: Multi-Vendor Marketplace

*Every seller. One cart.* A multi-vendor e-commerce marketplace for buyers, sellers and platform admins, with product variants, seller-managed delivery, online payments + COD, GST invoicing, returns, commission and ad revenue.

| Area | Stack |
|------|-------|
| Frontend | React + Vite (JavaScript), React Router, Tailwind CSS, Redux Toolkit, Formik + Yup, Axios, React Toastify, Framer Motion |
| Backend | Python, Django, Django REST Framework, SimpleJWT, PostgreSQL |
| Media | Cloudinary (behind a storage abstraction, so it can move to S3 later) |
| Payments | Razorpay (behind a payment-gateway abstraction with a mock mode for development) |
| Hosting | Ubuntu VPS, Nginx, Gunicorn, systemd, Let's Encrypt |

## Repository layout

```
ecommerce/
├── frontend/          React SPA (storefront + seller dashboard + admin dashboard)
├── backend/           Django REST API
├── docs/              Project documentation (start with docs/PROJECT_OVERVIEW.md)
├── deployment/        Nginx, systemd, backup scripts (Phase 9)
├── .github/           CI (lint, build, E2E, secret scan), Dependabot, PR template
├── .editorconfig      Shared formatting rules
├── .gitignore         Shared ignore rules
└── README.md
```

## Documentation

| Document | Purpose |
|----------|---------|
| [PROJECT_OVERVIEW](docs/PROJECT_OVERVIEW.md) | What we are building, conventions, doc index |
| [SOFTWARE_REQUIREMENTS](docs/SOFTWARE_REQUIREMENTS.md) | SRS, MVP scope, open business decisions |
| [SYSTEM_ARCHITECTURE](docs/SYSTEM_ARCHITECTURE.md) | Architecture, key flows, decisions, scaling path |
| [DATABASE_SCHEMA](docs/DATABASE_SCHEMA.md) | Tables, constraints, indexes, ER diagram |
| [API_DOCUMENTATION](docs/API_DOCUMENTATION.md) | REST endpoints |
| [UI_DESIGN_GUIDELINES](docs/UI_DESIGN_GUIDELINES.md) | Design system, page map |
| [SECURITY_GUIDELINES](docs/SECURITY_GUIDELINES.md) | Threats and controls |
| [TESTING_GUIDE](docs/TESTING_GUIDE.md) | Test strategy and matrix |
| [DEPLOYMENT_GUIDE](docs/DEPLOYMENT_GUIDE.md) | VPS deployment (completed in Phase 9) |
| [ENGINEERING_WORKFLOW](docs/ENGINEERING_WORKFLOW.md) | Git, branching, PRs, CI, environments, releases |
| [OPERATIONS_GUIDE](docs/OPERATIONS_GUIDE.md) | Monitoring, backups, performance, maintenance, incidents |
| [ENGINEERING_CHECKLIST](docs/ENGINEERING_CHECKLIST.md) | 107 production practices: status + priority |
| [AWS_MIGRATION](docs/AWS_MIGRATION.md) | Portability rules + VPS → AWS migration and data transfer |
| [HANDOVER](docs/HANDOVER.md) | Account ownership, handover package, training, business operations |
| [DEVELOPMENT_PROGRESS](docs/DEVELOPMENT_PROGRESS.md) | Phase checklist |

## Quick start (demo, no backend needed)

```bash
cd frontend && npm install && cp .env.example .env && npm run dev
# open http://localhost:5173 — password Demo@123 for every demo login (all @kartiva.demo):
#   customers: buyer@ rahul@ ananya@ vikram@   admin: admin@
#   sellers: seller@ (TechNest) wholesale@ chefpro@ sports@ motors@ gadgets@ urbanthread@ luxelane@ homecraft@ spiceroute@ glowup@ fitzone@
#   or create a new buyer / seller account at /register
```

See [frontend/README.md](frontend/README.md). Backend setup is added in Phase 3.
