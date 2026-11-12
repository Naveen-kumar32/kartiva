// Content pages (About, buyer protection, sourcing, help, selling, policies) for the demo — editable by
// admins in Admin → Content & pages. Body format (rendered by <RichText>): "## Heading", "### Sub-heading",
// "- bullet", "1. step", "> note", "**bold**", "[link text](/path)", blank line = new paragraph.
// SAMPLE TEXT: legal/policy pages must be reviewed by the client's lawyer and CA before launch.

// group: about | protection | source | help | sell | policy
const page = (slug, group, title, summary, body) => ({ body: body.trim(), group, published: true, slug, summary, title });

export const CMS_GROUPS = ["about", "protection", "source", "help", "sell", "policy"];

export const CMS_CONTENT = [
  // ───────────────────────────── About ─────────────────────────────
  page("about", "about", "About Kartiva", "India's marketplace for retail and wholesale buying from verified sellers.", `
Kartiva is an Indian multi-vendor marketplace where shoppers and businesses buy from **verified manufacturers, wholesalers, brands and retailers** — retail with one cart and one checkout, or in bulk through enquiries and buy requests.

> Every seller. One cart.

## What we do
- **Retail marketplace** — buy from many sellers in one checkout, pay online or Cash on Delivery, and get a GST invoice from every seller.
- **B2B sourcing** — see wholesale slab prices, send "Get best price" enquiries, or post a buy request and compare quotes from several suppliers.
- **Seller platform** — any GST-registered Indian business can open a store, list products, receive orders and leads, and get paid on a fixed settlement cycle.

## Kartiva in numbers (sample figures)
- 42 industries and 130+ sub-categories, from groceries to industrial machinery
- Sellers in 13 states, shipping to 19,000+ PIN codes
- 2 lakh+ buyers and businesses, 8,000+ buy requests a month

## Our principles
1. **Trust first** — every seller is GST-checked; verified suppliers carry KYC and plan badges so buyers know who they are dealing with.
2. **Fair to sellers** — transparent commission, no hidden fees, and a clear ledger for every rupee.
3. **Built for India** — UPI, RuPay, EMI and COD; GST invoices; regional sellers from Kanchipuram to Jalandhar.
4. **Your data is yours** — we never store card details and you can download or delete your data at any time.

## Company information
Kartiva Marketplace Private Limited is registered in Tamil Nadu, India. Registered office, GSTIN and CIN are shown in the footer of every page. For press and partnership enquiries see [Partnerships](/pages/partnerships) or [Contact us](/pages/contact).
`),
  page("why-kartiva", "about", "Why choose Kartiva", "Retail convenience with wholesale prices and verified suppliers.", `
Kartiva combines the convenience of a shopping app with the sourcing power of a B2B portal.

## For shoppers
- **One cart, many sellers** — check out once even when items come from different sellers; each seller ships separately with its own tracking.
- **Pay your way** — UPI, cards, net banking, EMI or Cash on Delivery (up to ₹10,000 with most sellers).
- **Easy returns** — most products have a 7-day return window. See [Returns & refunds](/pages/returns).
- **GST invoice with every order** — download it from My orders.

## For businesses
- **Wholesale slab pricing** — the more you buy, the lower the unit price, shown upfront on the product page.
- **Buy requests (RFQ)** — describe what you need once; verified suppliers send you quotes. [Post a buy request](/post-requirement).
- **Verified suppliers** — filter by GST-verified, KYC-verified, Gold Supplier and Platinum Partner.
- **Business invoices** — add your GSTIN in your profile to claim input tax credit.

## For sellers
- Reach buyers across India without building your own website.
- Get orders **and** leads — enquiries, buy requests and messages in one Seller Hub.
- Weekly settlements with a full earnings ledger. [Start selling](/sell).
`),
  page("corporate-responsibility", "about", "Corporate responsibility", "How Kartiva supports artisans, small businesses and the environment.", `
## Supporting India's small businesses
More than half of the sellers on Kartiva are MSMEs. We keep onboarding free, offer a free Starter plan, and run seller-education sessions in English, Hindi and Tamil.

## Artisans and handloom
Our [Handicrafts & Handloom](/c/handicrafts-handloom) category highlights weavers and craftspeople. Eligible artisan co-operatives pay **zero commission for their first year** (sample programme).

## Packaging and the environment
- Sellers are encouraged to use recyclable corrugated packaging and paper tape.
- Shipments that combine items from the same seller reduce packaging and delivery trips.
- We publish a yearly sustainability note (sample).

## Responsible marketplace
- Prohibited and restricted items are blocked by our [Policies & rules](/pages/policies).
- Counterfeits are removed when reported. See [Intellectual property policy](/pages/ip-policy).
`),
  page("careers", "about", "Careers", "Join the team building India's B2B + retail marketplace.", `
We are a small team in Chennai building a marketplace that works for both a home cook and a hotel purchase manager.

## Open roles (sample)
- **Seller success manager** — Chennai · Full-time
- **Category manager, Industrial supplies** — Chennai / Remote · Full-time
- **Full-stack engineer (React + Django)** — Chennai / Remote · Full-time
- **Customer support associate (Tamil, Hindi, English)** — Chennai · Full-time

## How to apply
Email your CV to careers@kartiva.in with the role in the subject line. We reply to every application within 10 working days.

> Kartiva is an equal-opportunity employer. We never ask candidates for money at any stage of hiring.
`),
  page("contact", "about", "Contact us", "Reach our buyer, seller and partnership teams.", `
## Buyers
- **Help with an order** — open [Help & support](/account/support) from your account; we reply within 24 hours.
- **Email** — support@kartiva.in
- **Phone** — +91 44 4000 1234 (9 am – 8 pm IST, Monday – Saturday)

## Sellers
- Raise a ticket from **Seller Hub → Help & support** for payments, catalogue or KYC questions.
- New to Kartiva? Read [Sell on Kartiva](/sell) or email sellers@kartiva.in.

## Partnerships, press and advertising
- Partnerships — partners@kartiva.in ([Partnerships](/pages/partnerships))
- Advertising — [Advertise with us](/advertise)

## Registered office
Kartiva Marketplace Private Limited, 4th Floor, Sample Tech Park, OMR, Chennai, Tamil Nadu 600096.

For complaints under the Consumer Protection (E-Commerce) Rules, contact our [Grievance officer](/pages/grievance).
`),

  // ───────────────────────── Buyer protection ─────────────────────────
  page("secure-payments", "protection", "Secure payments", "How your payment is protected on Kartiva.", `
All online payments on Kartiva are processed by **Razorpay**, an RBI-authorised payment aggregator. Kartiva never sees or stores your card number, CVV or UPI PIN.

## Payment methods
- UPI (Google Pay, PhonePe, Paytm, BHIM and all UPI apps)
- Credit and debit cards — Visa, Mastercard, RuPay, Amex
- Net banking with 50+ banks
- EMI on eligible cards (no-cost EMI where the seller offers it)
- **Cash on Delivery** — up to ₹10,000 per order with most sellers

## How we protect you
1. Card payments use 3-D Secure / OTP authentication.
2. The price, taxes and delivery charges are recalculated by our servers at checkout — what you see is what you pay.
3. Your payment is confirmed only after Razorpay verifies it; failed payments are never charged twice.
4. If a payment is captured but your order fails, the money is refunded automatically within 5–7 working days.

> Kartiva will never call you to ask for an OTP, PIN or card number. Report suspicious calls to support@kartiva.in.
`),
  page("buyer-protection", "protection", "Money-back guarantee", "Get your money back if your order doesn't arrive or isn't as described.", `
Every order paid on Kartiva is covered by **Kartiva Buyer Protection**.

## You are covered if
- Your order **doesn't arrive** within the promised delivery window plus 7 days.
- The item is **damaged, defective, or different** from the description or photos.
- The item is **counterfeit**.
- The seller **cancels** after you paid.

## What you get
- A full refund of the item price and delivery charges, **or** a replacement where the seller offers one.
- For COD orders, refunds go to your UPI ID or bank account.

## How to claim
1. Go to **My orders** and choose **Request return** on the item (within the return window).
2. If the seller rejects your request, choose **Escalate to Kartiva** — our team reviews it within 2 working days.
3. Our decision is shared with both you and the seller, and refunds are issued immediately once approved.

Read the full [Returns & refunds policy](/pages/returns).
`),
  page("delivery-guarantee", "protection", "Guaranteed delivery", "Delivery estimates you can rely on — or your money back.", `
Every product page shows the **delivery estimate for your PIN code** before you buy. Each seller ships with their own courier, store pickup or local delivery.

## Our promise
- If a shipment isn't delivered within the estimate plus 7 days, you can cancel it for a full refund — even after it shipped.
- You get tracking details (courier and AWB number) as soon as the seller ships.
- Same-day local delivery and store pickup are available from selected sellers in their cities.

## Delivery charges
Charges are set by each seller and shown per seller at checkout. Many sellers offer free delivery above a minimum order value. See [Shipping policy](/pages/shipping).
`),
  page("after-sales", "protection", "After-sales protection", "Warranty, installation and service support after delivery.", `
## Warranty
Manufacturer warranty applies to electronics, appliances and machinery as stated on the product page. Keep your **GST invoice** (downloadable from My orders) — it is your proof of purchase.

## Installation and demo
Sellers of appliances, commercial kitchen equipment and machinery list whether installation is included. Book it from the order message thread with the seller.

## Spare parts and service
Use **Messages** to contact the seller directly about spares and service. If a seller does not respond within 48 hours, raise a ticket in [Help & support](/account/support) and we will follow up.

## Business buyers
Bulk and RFQ orders can include custom after-sales terms (AMC, spares kit, training). Agree them in the quote and keep them in the conversation for reference.
`),
  page("policies", "protection", "Policies & rules", "The rules every buyer and seller on Kartiva follows.", `
## Marketplace rules
- Sellers must be GST-registered Indian businesses and list only products they are authorised to sell.
- Prices shown must include GST. Sellers may not ask buyers to pay outside Kartiva.
- Reviews must be genuine; paid or fake reviews are removed and may lead to suspension.
- Contact details shared in enquiries may only be used to answer that enquiry.

## Prohibited items (examples)
- Weapons, explosives and fireworks
- Drugs, prescription medicines without a licence, tobacco and e-cigarettes
- Counterfeit or replica products
- Wildlife products, human remains, adult content
- Items requiring a licence the seller does not hold (e.g. FSSAI for food, CDSCO for cosmetics imports)

## Enforcement
Violations can lead to listing removal, settlement holds, suspension or permanent removal. Report a problem on the [Report a violation](/report?type=violation) page.

Related: [Terms of use](/pages/terms) · [Intellectual property policy](/pages/ip-policy) · [Seller policies](/pages/seller-policies)
`),

  // ───────────────────────── Source on Kartiva ─────────────────────────
  page("verified-suppliers", "source", "Verified suppliers", "What our trust badges mean and how suppliers earn them.", `
Look for these badges on product pages, store pages and search filters.

## The badges
- **GST verified** — the seller's GSTIN has been checked against the GST portal and matches their business name and state.
- **KYC verified** — GST certificate, PAN and a cancelled cheque have been reviewed by the Kartiva team.
- **Trusted seller** — KYC verified **and** on a paid membership plan, with good service history.
- **Top rated** — 4.5★ or higher average rating.
- **Gold Supplier / Platinum Partner** — paid membership plans with priority placement and dedicated support.

## Company profiles
Every store has a **Company profile** tab: business type, year established, employees, annual turnover band, main markets, certifications and verified documents.

> Tip: in any category, tick **Verified suppliers only** in the filters to see KYC-verified sellers.
`),
  page("buy-requests", "source", "How quote requests work", "Describe what you need once — get quotes from verified suppliers.", `
A **quote request** (also called RFQ — request for quotation) lets you source in bulk without contacting suppliers one by one.

## How it works
1. **Post your requirement** — product, quantity, target price, delivery city and deadline. [Post a buy request](/post-requirement)
2. **Matched suppliers are notified** — sellers in that category see your request in their Seller Hub.
3. **Compare quotes** — price per unit, total, lead time and validity, side by side in **My enquiries & quotes**.
4. **Chat and accept** — message suppliers to negotiate, then accept the best quote. Other suppliers are told politely.

## Tips for better quotes
- Be specific: grade, size, packaging, branding and certifications you need.
- Give a realistic target price and deadline.
- Mention if you need a GST invoice in your company name.

Your phone and email are shared only with suppliers who quote, and only to discuss your request.
`),
  page("bulk-buying", "source", "Wholesale & bulk buying", "Slab prices, minimum order quantities and business invoices.", `
## Slab (tier) pricing
Products marked **Bulk price** show a table such as **1–9 units ₹2,599 · 10–49 ₹2,469 · 50+ ₹2,339**. The lower price applies automatically in your cart when you reach the quantity.

## Minimum order quantity (MOQ)
Some manufacturers sell only in packs or minimum quantities. The quantity selector starts at the MOQ.

## Enquiry-only listings
Vehicles, machinery and custom products may be **enquiry only** — click **Get best price** to receive a personalised quote instead of adding to cart.

## GST invoices for businesses
Add your business name and GSTIN in **Profile** before checkout to receive B2B invoices and claim input tax credit.
`),

  // ───────────────────────────── Help ─────────────────────────────
  page("faq", "help", "Help centre & FAQ", "Answers to the most common questions from buyers.", `
## Orders
### How do I track my order?
Open **My orders**. Each seller's shipment shows its own status and courier tracking number.

### Why did my order arrive in several packages?
Items from different sellers ship separately from their own locations.

### Can I cancel my order?
Yes — any shipment that hasn't shipped yet can be cancelled from My orders. See [Cancellation policy](/pages/cancellation).

## Payments
### Is Cash on Delivery available?
Yes, for most sellers up to ₹10,000 per order. Some products (e.g. vehicles, bulk freight) are prepaid only.

### My payment failed but money was deducted.
It is refunded automatically within 5–7 working days. If not, contact [Help & support](/account/support) with the UPI reference.

## Returns & refunds
### How long do refunds take?
UPI 1–3 days, cards 5–7 working days after the seller receives the return. COD refunds go to your UPI or bank account.

### What can't be returned?
Perishables, opened personal-care items, innerwear and customised products. See [Returns & refunds](/pages/returns).

## Bulk & business buying
### How do I get bulk prices?
Check the **Bulk pricing** table on the product page, send **Get best price**, or [post a buy request](/post-requirement).

### Can I get a GST invoice in my company name?
Yes — add your GSTIN in Profile before ordering.

## Account
### How do I download or delete my data?
Profile → **Download my data** or **Request account deletion**.
`),
  page("returns", "help", "Returns & refunds policy", "Return window, refund timelines and non-returnable items.", `
## Return window
Most products can be returned within **7 days of delivery** if unused, with tags and original packaging. The exact window is shown on each product page.

## Non-returnable items
- Perishables (fresh produce, dairy, frozen food) and beverages
- Opened beauty, personal-care and hygiene products, innerwear
- Customised or personalised products (e.g. printed team kits)
- Vehicles after registration
- Items marked **Non-returnable** on the product page

Damaged, defective or wrong items are **always** covered — report them within 48 hours of delivery with photos.

## How to return
1. My orders → choose the item → **Request return**, select a reason and add photos.
2. The seller approves and arranges pickup, or shares a return address.
3. Once the seller receives the item, your refund is issued.
4. If the seller rejects your request, you can **escalate to Kartiva** for a final decision.

## Refund timelines
- **UPI / wallets** — 1–3 working days
- **Cards / net banking** — 5–7 working days
- **Cash on Delivery orders** — to your UPI ID or bank account within 5–7 working days

Shipping charges are refunded when the return is due to a seller error. See also [Money-back guarantee](/pages/buyer-protection).
`),
  page("cancellation", "help", "Cancellation policy", "When and how orders can be cancelled.", `
## Cancelling as a buyer
- Shipments that are **confirmed or processing** can be cancelled from My orders at no cost.
- Once a shipment has **shipped**, refuse delivery or request a return after delivery.
- Prepaid orders are refunded to the original payment method.

## Cancellation by the seller
If a seller cancels (e.g. out of stock), you are refunded in full automatically and notified by email. Repeated seller cancellations affect their rating and can lead to penalties.

## Unpaid orders
Orders awaiting online payment are cancelled automatically after 15 minutes and the stock is released.
`),
  page("shipping", "help", "Shipping policy", "How delivery works when every seller ships their own way.", `
## Every seller ships their own way
Each seller chooses their delivery partners and options:
- **Standard delivery** — 3–8 days, all India
- **Express delivery** — 1–3 days in selected cities
- **Same-day local delivery** — selected sellers within their city (e.g. Kochi)
- **Store pickup** — collect from the seller's shop or showroom
- **Bulk freight** — truck delivery for large wholesale orders

## Charges
Delivery charges are set per seller and shown at checkout. Many sellers deliver free above ₹499–₹999.

## Delivery checks
Enter your PIN code on any product page to see availability, estimated dates and COD eligibility.

## Tracking
You'll see the courier name and tracking number in My orders as soon as the seller ships.
`),
  page("disputes", "help", "Trade disputes", "How Kartiva resolves disagreements between buyers and sellers.", `
Most issues are solved directly with the seller through **Messages**. If that doesn't work, Kartiva steps in.

## When to file a dispute
- A return or refund was rejected and you disagree
- A bulk / RFQ order doesn't match the agreed quote (quality, quantity, specification)
- A seller is not responding for more than 48 hours

## How it works
1. [File a dispute](/report?type=dispute) with your order number, what went wrong and photos or documents.
2. We ask the seller for their side within 2 working days.
3. Our team reviews the evidence and decides — refund, partial refund, replacement or no action.
4. Approved refunds are paid immediately; the seller's settlement is adjusted.

Most disputes are resolved within **7 working days**.
`),

  // ───────────────────────────── Sell ─────────────────────────────
  page("seller-policies", "sell", "Seller policies", "Commission, settlements, shipping and quality rules for sellers.", `
## Who can sell
GST-registered Indian businesses — manufacturers, wholesalers, distributors, brands, dealers and retailers. Registration requires GSTIN, PAN and a bank account in the business name.

## Fees
- **Commission** on each sale, by category (e.g. 6% grocery, 10% default, 12% fashion — sample rates). GST at 18% applies on commission.
- **TCS 0.5%** (GST law, section 52) and **TDS 0.1%** (Income-tax, section 194-O) are deducted and reported for you.
- Optional **membership plans** (Gold, Platinum) and **ads** — never mandatory.

## Settlements
Sellers are paid weekly for orders whose return window has closed, with a full ledger in Seller Hub → Earnings.

## Shipping and service levels
- Ship within the handling time shown on your delivery methods.
- Add courier and tracking when you mark an order as shipped.
- Reply to enquiries and messages within 24 hours to keep your response-rate badge.

## Listing quality
Accurate titles, real photos, correct HSN and GST rate, and MRP not lower than the selling price. See [Policies & rules](/pages/policies).
`),
  page("verified-supplier", "sell", "Become a verified supplier", "Earn KYC and Trusted badges to win more buyers.", `
Verified suppliers get more enquiries, appear higher in results and can be filtered by buyers.

## Steps
1. **Register your business** — [Sell on Kartiva](/register?type=seller) with your GSTIN and PAN.
2. **Complete your company profile** — business type, year established, certifications and main markets.
3. **Upload KYC documents** in Seller Hub → Business profile & KYC: GST certificate, PAN card and a cancelled cheque (plus optional FSSAI / BIS / trade licence).
4. **Get reviewed** — our team verifies documents within 2 working days.
5. **Upgrade (optional)** — a Gold or Platinum plan adds the **Trusted seller** badge, more buy-request quotes and priority placement.

## Keeping your badge
Keep documents current (re-upload after an address or GST change), respond to buyers quickly and keep your rating above 4.0★.
`),
  page("partnerships", "sell", "Partnerships", "Logistics, payments, financing and industry partnerships.", `
We work with partners who help Indian businesses buy and sell more easily.

## Partnership areas
- **Logistics** — couriers, freight and warehousing partners for our sellers
- **Payments and financing** — payment gateways, working-capital and invoice financing for MSMEs
- **Industry associations** — chambers of commerce, export councils and artisan co-operatives
- **Technology** — ERP, accounting and inventory software integrations

## Get in touch
Email partners@kartiva.in with your company name, website and the partnership you have in mind. We respond within 5 working days.
`),

  // ───────────────────────────── Policy ─────────────────────────────
  page("terms", "policy", "Terms of use", "The agreement between you and Kartiva when you use the platform.", `
> SAMPLE TERMS for the demo — to be replaced by terms drafted by the client's lawyer before launch.

## 1. About these terms
These terms govern your use of the Kartiva website and apps operated by Kartiva Marketplace Private Limited ("Kartiva"). By using Kartiva you agree to them.

## 2. Kartiva is a marketplace
Products are sold by independent sellers. The contract of sale is between you and the seller; Kartiva facilitates the transaction, payments and dispute resolution as an e-commerce operator under the Consumer Protection (E-Commerce) Rules, 2020.

## 3. Your account
- You must be 18 or older and provide accurate information.
- Keep your password confidential; you are responsible for activity on your account.

## 4. Orders and payments
- Prices include GST. Kartiva may cancel orders affected by obvious pricing errors and refund you in full.
- Payments are processed by RBI-authorised partners. COD limits apply.

## 5. Returns, refunds and cancellations
As described in the [Returns & refunds](/pages/returns) and [Cancellation](/pages/cancellation) policies.

## 6. Prohibited conduct
Fraud, fake reviews, misuse of buyer or seller contact details, scraping, and listing prohibited items. See [Policies & rules](/pages/policies).

## 7. Limitation of liability
To the extent permitted by law, Kartiva's liability for any claim is limited to the amount paid for the order concerned.

## 8. Governing law
These terms are governed by the laws of India. Courts in Chennai have exclusive jurisdiction.

## 9. Grievances
See [Grievance officer](/pages/grievance).
`),
  page("privacy", "policy", "Privacy policy", "What data we collect, why, and your rights under the DPDP Act 2023.", `
> SAMPLE POLICY for the demo — to be reviewed against the Digital Personal Data Protection Act, 2023 before launch.

## What we collect
- **Account data** — name, email, mobile number, password (stored hashed)
- **Order data** — delivery addresses, order history, invoices
- **Business data** — business name and GSTIN (if you add them)
- **Communications** — enquiries, messages with sellers, support tickets
- **Technical data** — device and log information for security

We **never** store card numbers, CVV or UPI PINs — payments are handled by Razorpay.

## Why we use it
- To process and deliver orders, issue invoices and handle returns
- To connect you with sellers for enquiries and buy requests you send
- To prevent fraud and keep the platform safe
- To send service messages; marketing only with your consent

## Who we share it with
- **Sellers** — only what they need to fulfil your order or answer your enquiry
- **Couriers and payment partners** — to deliver and process payments
- **Authorities** — when required by law

## Your rights
- Access and download your data (Profile → **Download my data**)
- Correct your details at any time
- Request deletion (Profile → **Request account deletion**); tax records are kept as required by GST law
- Withdraw marketing consent
- Raise a grievance with our [Grievance officer](/pages/grievance)

## Where your data is stored
On servers located in India, with encrypted backups. Seller bank details are encrypted.
`),
  page("cookie-policy", "policy", "Cookie policy", "How Kartiva uses cookies and similar technologies.", `
## Essential cookies
Keep you signed in, remember your cart and protect against fraud. These cannot be switched off.

## Preference storage
Remember choices such as dismissed banners for your current session.

## Analytics (with consent)
Help us understand which pages are useful. Enabled only after you agree.

## Advertising
Kartiva does not use third-party advertising cookies. Sponsored products are served by Kartiva itself.
`),
  page("ip-policy", "policy", "Intellectual property policy", "How to report counterfeits and IP infringement.", `
Kartiva respects intellectual property rights and removes infringing listings when notified.

## What you can report
- Counterfeit products using your brand
- Unauthorised use of your trademark, logo or copyrighted images
- Design or patent infringement

## How to report
1. Use the [Report IP infringement](/report?type=ip) form.
2. Include the product link, your registration details (trademark / copyright number) and proof of ownership.
3. We review notices within 2 working days and may remove listings, ask the seller for a response, or suspend repeat infringers.

Sellers who believe a listing was removed in error can respond through Seller Hub → Help & support.
`),
  page("grievance", "policy", "Grievance officer", "Contact for complaints under the Consumer Protection (E-Commerce) Rules, 2020.", `
In line with the Consumer Protection (E-Commerce) Rules, 2020 and the IT Rules, Kartiva has appointed a Grievance Officer.

## Grievance officer (sample details)
- **Name** — Ms. Anjali Rao
- **Designation** — Head, Customer Experience
- **Email** — grievance@kartiva.in
- **Phone** — +91 44 4000 1299 (10 am – 6 pm IST, Monday – Friday)
- **Address** — Kartiva Marketplace Private Limited, 4th Floor, Sample Tech Park, OMR, Chennai, Tamil Nadu 600096

## Timelines
- We **acknowledge** every complaint within **48 hours**.
- We **resolve** complaints within **one month** of receipt.

You can also raise a complaint through [Help & support](/account/support), which lets you track its status.
`),
];
