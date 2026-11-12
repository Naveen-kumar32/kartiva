# Business Operations & Customer Handover

The goal: on handover day, the client **owns every account, credential, line of code and piece of data**, and their team can run the marketplace day to day without the developers.

## 1. Account ownership (set up in the client's name from day one)

| Account | Owner | Notes |
|---------|-------|-------|
| Domain registrar + DNS | Client | Auto-renew on, registrar lock on |
| VPS provider (and AWS later) | Client | Developers get their own sub-users, not the root login |
| GitHub organisation + repo | Client | Developers are members and are removed or downgraded at handover |
| Razorpay | Client (KYC is in the company's name) | Developers get a team role. Live keys only on the server |
| Cloudinary | Client | |
| Email provider (Zoho / Google Workspace / SES) | Client | |
| Sentry, UptimeRobot, healthchecks.io | Client | Alerts go to the client's ops email too |
| Off-site backup bucket | Client | Encryption key kept in the client's vault |
| Password manager vault | Client | Every credential lives here and nowhere else |

## 2. Handover package

- [ ] Source code at a release tag on the client's GitHub, with a green CI run
- [ ] All docs in `docs/`, including this one, the [Deployment Guide](DEPLOYMENT_GUIDE.md), [Operations Guide](OPERATIONS_GUIDE.md) and [AWS Migration](AWS_MIGRATION.md)
- [ ] **Admin user manual** (with screenshots): approvals, categories, commission, settlements, COD refunds, ads, reports, letters, settings
- [ ] **Seller onboarding guide**: register, add products and variants, manage stock, ship, returns, earnings, ads
- [ ] **Buyer help/FAQ pages** for the site: orders, returns, refunds, COD
- [ ] Runbooks: deploy, roll back, restore a backup, rotate secrets, renew/move the domain, add an admin user
- [ ] Credentials list (names and locations only, values stay in the vault) and a list of every external service with plan and cost
- [ ] Latest backup + a successful restore-test record
- [ ] Known issues and the roadmap (open GitHub issues)

## 3. Training (recorded)

| Session | Audience | Length |
|---------|----------|--------|
| Admin operations | Client ops team | 2 h |
| Finance: commission, ledger, settlements, GST/TCS/TDS reports | Client finance + CA | 1.5 h |
| Seller onboarding walkthrough | Client's seller-support person | 1 h |
| Technical handover: code, deploy, monitoring, backups | Client's developer / IT vendor | 2–3 h |

## 4. Acceptance & go-live

1. **UAT on staging:** the client tests with their real catalogue against a checklist built from the SRS requirement IDs, and signs off.
2. **Go-live checklist:** live Razorpay keys + webhook, real company details on invoices, policies published (Terms, Privacy, Returns, Seller Agreement), CA sign-off on tax settings, backups and monitoring running, demo data removed.
3. **Hypercare:** 2–4 weeks of priority support after launch (agree the length in the contract).
4. **Warranty & AMC:** a bug-fix warranty period, then an optional Annual Maintenance Contract covering updates, security patches, monitoring and an agreed number of support hours each month.

## 5. Day-to-day business operations (client)

| Frequency | Task | Where in the app |
|-----------|------|------------------|
| Daily | Approve sellers and products, handle return escalations | Admin → Sellers / Products / Returns |
| Daily | Pay COD refunds and enter the UTR | Admin → Returns → COD refund queue |
| Daily | Approve seller ad requests, check ad slots | Admin → Ads |
| Weekly | Generate and pay seller settlements | Admin → Settlements |
| Weekly | Check payment reconciliation and failed payments | Admin → Reports / Orders |
| Monthly | Send TCS (GSTR-8) and TDS (194-O) data to the CA | Admin → Reports (CSV/PDF) |
| Monthly | Issue commission and ad invoices to sellers | Admin → Documents |
| As needed | Categories, commission rules, platform settings, letters/notices | Admin → Categories / Commissions / Settings / Letters |

## 6. Data protection responsibilities (DPDP Act 2023)

After handover, the client is the **Data Fiduciary**. They must keep the privacy notice and consent text current, answer access/correction/deletion requests (the admin tools support export and anonymise; tax records are kept as GST law requires), report personal-data breaches to the Data Protection Board and the affected users, and name a grievance contact on the site.
