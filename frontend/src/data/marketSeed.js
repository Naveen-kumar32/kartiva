// Sample B2B / marketplace-growth data (IndiaMART / Alibaba / JustDial style) for the demo:
// enquiries (leads), buy requests (RFQs) with quotes, message threads, support tickets, membership
// plans, KYC documents, seller team, admin staff, notifications and CMS pages. All people are fictional.
// Shapes are the contract shared by src/api/* — see docs/DATABASE_SCHEMA.md §2.31 (marketplace growth).
import { CMS_CONTENT } from "./cmsContent";

const SEED_NOW = new Date("2026-11-11T12:00:00+05:30").getTime();
const HOUR = 3_600_000;
const ago = (hours) => new Date(SEED_NOW - hours * HOUR).toISOString();
const ahead = (hours) => new Date(SEED_NOW + hours * HOUR).toISOString();

const PRIYA = { city: "Chennai", email: "buyer@kartiva.demo", name: "Priya Raman", phone: "+919876543210" };
const RAHUL = { city: "Bengaluru", email: "rahul@kartiva.demo", name: "Rahul Sharma", phone: "+919840012345" };
const ANANYA = { businessName: "Gupta Caterers", city: "Mumbai", email: "ananya@kartiva.demo", name: "Ananya Gupta", phone: "+919841246912" };
const VIKRAM = { businessName: "Nair Sports Academy", city: "Hyderabad", email: "vikram@kartiva.demo", name: "Vikram Nair", phone: "+919842481479" };
const GUESTS = [
  { city: "Pune", email: "omkar.patil@example.in", name: "Omkar Patil", phone: "+919890011223" },
  { businessName: "Hotel Saravana Bhavan Annexe", city: "Madurai", email: "purchase@hsb-annexe.example.in", name: "R. Murugan", phone: "+919443322110" },
  { city: "Coimbatore", email: "deepa.k@example.in", name: "Deepa Krishnan", phone: "+919600055441" },
  { businessName: "Sunrise Public School", city: "Ludhiana", email: "sports@sunrise-school.example.in", name: "Manpreet Kaur", phone: "+919815566778" },
];

// ---------- Enquiries (leads) ----------
// status: new → contacted → quoted → won | lost   (spam is a terminal admin/seller flag)
const lead = (id, storeSlug, productId, buyer, quantity, unit, message, status, hours, extra = {}) => ({
  assignedTo: null, buyer, createdAt: ago(hours), id, message, notes: [], productId, quantity, requirementType: quantity >= 10 ? "bulk" : "retail",
  source: productId ? "product" : "store", status, storeSlug, threadId: null, unit, updatedAt: ago(Math.max(0, hours - 2)), ...extra,
});

export const SEED_ENQUIRIES = [
  lead(1, "velocity-motors", 113, PRIYA, 1, "unit", "Please share the on-road price in Chennai and the EMI options. Is a test ride possible this weekend?", "new", 3, { threadId: 1, wantsTestRide: true }),
  lead(2, "velocity-motors", 117, GUESTS[0], 1, "unit", "Looking for the Sportbike in Matte Black. Exchange of my 2019 Pulsar possible?", "contacted", 20, { notes: [{ at: ago(18), author: "Aditya Kulkarni", text: "Called — wants exchange valuation. Visit Saturday 11 am." }], wantsTestRide: true }),
  lead(3, "velocity-motors", 116, RAHUL, 2, "unit", "Need 2 scooters for our delivery staff. Please quote a fleet price.", "quoted", 52, { threadId: 2 }),
  lead(4, "velocity-motors", 114, GUESTS[2], 1, "unit", "Is the Z800 available in stock? Want delivery before Diwali.", "won", 240),
  lead(5, "velocity-motors", null, GUESTS[3], 1, "unit", "Do you have service centre near Hadapsar?", "lost", 300, { source: "store" }),
  lead(6, "annapoorna-wholesale", 20, ANANYA, 120, "litre", "We run a catering unit. Need 120 L cooking oil every month — please share slab pricing and credit terms.", "new", 5, { threadId: 3 }),
  lead(7, "annapoorna-wholesale", 16, GUESTS[1], 50, "kg", "Need 50 kg apples per week for our hotel. Delivery to Madurai.", "contacted", 30),
  lead(8, "annapoorna-wholesale", 27, PRIYA, 12, "jar", "Gift hampers for office — 12 honey jars. Can you do custom labels?", "quoted", 70),
  lead(9, "chefpro", 61, ANANYA, 6, "unit", "Need 6 hand blenders for our commercial kitchen. GST invoice required.", "new", 8),
  lead(10, "chefpro", 52, GUESTS[1], 15, "unit", "15 carbon steel woks for a new restaurant. Can you deliver to Madurai with installation of the range?", "quoted", 44, { threadId: 4 }),
  lead(11, "chefpro", null, GUESTS[2], 1, "unit", "Do you make custom-size SS work tables?", "won", 400, { source: "store" }),
  lead(12, "jalandhar-sports", 143, VIKRAM, 40, "unit", "40 English-willow cricket bats for our academy, with our logo printed. Need by 15 Dec.", "new", 2, { threadId: 5 }),
  lead(13, "jalandhar-sports", 147, GUESTS[3], 100, "unit", "School sports day — 100 footballs size 5. Please quote with delivery to Ludhiana.", "contacted", 26),
  lead(14, "jalandhar-sports", 145, VIKRAM, 10, "set", "10 sets of wickets with bails.", "won", 500),
  lead(15, "technest", 78, RAHUL, 5, "unit", "Corporate order: 5 MacBook Pro 14 for my startup. Best price with GST invoice?", "new", 6),
  lead(16, "technest", 122, GUESTS[0], 1, "unit", "Is this refurbished or new? Warranty?", "lost", 120),
  lead(17, "spice-route", 20, GUESTS[1], 200, "litre", "Monthly 200 L oil supply contract.", "contacted", 90),
  lead(18, "homecraft", 12, PRIYA, 1, "unit", "Can the sofa be made in a 3-seater size with grey fabric?", "new", 14),
  lead(19, "urbanthread", 83, GUESTS[2], 300, "piece", "Uniform order — 300 check shirts in assorted sizes for a hotel chain.", "quoted", 75),
  lead(20, "velocity-motors", 115, GUESTS[0], 1, "unit", "WIN A FREE BIKE click here!!! bit.ly/xx", "spam", 33),
  // Matches support ticket TKT-1044: Vikram asked FitZone about logo printing and hasn't had a reply yet.
  lead(21, "fitzone", null, VIKRAM, 60, "unit", "Can you print our academy logo on 60 footballs? Need a sample first and delivery to Hyderabad.", "new", 50, { threadId: 7 }),
];

// ---------- Buy requests (RFQs) + quotes ----------
// rfq.status: open → awarded | closed (expired/cancelled). quote.status: submitted → accepted | rejected
const quote = (id, storeSlug, pricePerUnit, leadTimeDays, note, status, hours) => ({ createdAt: ago(hours), id, leadTimeDays, note, pricePerUnit, status, storeSlug, validTill: ahead(24 * 10) });

export const SEED_RFQS = [
  {
    buyer: ANANYA, categorySlug: "fresh-pantry", createdAt: ago(28), deadline: ahead(24 * 6), deliveryCity: "Mumbai", details: "Basmati rice (1121 sella), 25 kg bags. Monthly requirement, 6-month contract. FSSAI documents required.",
    id: 1, quantity: 400, status: "open", targetPrice: 95, title: "Basmati rice — 400 kg / month", unit: "kg",
    quotes: [quote(1, "annapoorna-wholesale", 92, 4, "1121 sella, 25 kg HDPE bags. Free freight above 1,000 kg. 15-day credit after 2 orders.", "submitted", 20), quote(2, "spice-route", 98, 3, "Premium aged basmati. Price includes delivery.", "submitted", 12)],
  },
  {
    buyer: VIKRAM, categorySlug: "sports-equipment", createdAt: ago(50), deadline: ahead(24 * 3), deliveryCity: "Hyderabad", details: "Synthetic leather footballs, size 5, FIFA basic quality. Academy logo print on 2 panels.",
    id: 2, quantity: 60, status: "open", targetPrice: 900, title: "60 branded footballs (size 5)", unit: "unit",
    quotes: [quote(3, "jalandhar-sports", 845, 10, "Machine-stitched, logo print 2 colours included. Sample can be couriered in 3 days.", "submitted", 30), quote(4, "fitzone", 990, 6, "Branded Nivia footballs, logo sticker.", "submitted", 26)],
  },
  {
    buyer: RAHUL, categorySlug: "laptops", createdAt: ago(120), deadline: ahead(24 * 1), deliveryCity: "Bengaluru", details: "16 GB RAM, 512 GB SSD, i7 or M-series. 3-year warranty preferred. GST invoice in company name.",
    id: 3, quantity: 10, status: "awarded", targetPrice: 120000, title: "10 developer laptops for startup", unit: "unit",
    quotes: [quote(5, "technest", 118500, 5, "MacBook Air M3 16/512, AppleCare+ optional at ₹14,900. GST invoice in company name.", "accepted", 100), quote(6, "gadget-galaxy", 124000, 7, "Dell XPS 13, 3-year onsite warranty.", "rejected", 96)],
  },
  {
    buyer: { ...GUESTS[1] }, categorySlug: "commercial-kitchen", createdAt: ago(9), deadline: ahead(24 * 9), deliveryCity: "Madurai", details: "Commercial kitchen setup for a 60-cover restaurant: 3-burner range, SS work tables, exhaust hood, utensils. Installation required.",
    id: 4, quantity: 1, status: "open", targetPrice: 450000, title: "Complete commercial kitchen setup", unit: "project",
    quotes: [quote(7, "chefpro", 438000, 21, "Turnkey: design, fabrication (SS 304), installation and 1-year AMC. Site visit free.", "submitted", 4)],
  },
  {
    buyer: PRIYA, categorySlug: "home-decor", createdAt: ago(300), deadline: ago(60), deliveryCity: "Chennai", details: "Diwali corporate gifting — 50 brass diyas with gift boxes.",
    id: 5, quantity: 50, status: "closed", targetPrice: 450, title: "50 brass diya gift boxes", unit: "unit", quotes: [],
  },
];

// Who each seed buy request was sent to (auto = category match; a name = forwarded by that admin).
const SEED_DISPATCHES = {
  1: [["annapoorna-wholesale", "auto", 27, 25], ["spice-route", "auto", 27, 14]],
  2: [["jalandhar-sports", "auto", 49, 40], ["fitzone", "auto", 49, 30]],
  3: [["technest", "auto", 119, 110], ["gadget-galaxy", "auto", 119, 100], ["kartiva-essentials", "auto", 119, null]],
  4: [["chefpro", "auto", 8, 6], ["homecraft", "Rohan Das", 7, null]],
  5: [["homecraft", "auto", 299, 290]],
};
SEED_RFQS.forEach((r) => {
  r.dispatches = (SEED_DISPATCHES[r.id] ?? []).map(([storeSlug, by, sentH, viewedH]) => ({ at: ago(sentH), by, note: by === "auto" ? "" : "Buyer wants a turnkey quote — you also make SS work tables.", storeSlug, viewedAt: viewedH == null ? null : ago(viewedH) }));
});

// ---------- Message threads ----------
// participants: buyer (email) ↔ store (slug). context links a thread to an enquiry / rfq / order / support.
const msg = (id, from, body, hours) => ({ at: ago(hours), body, from, id });
export const SEED_THREADS = [
  { buyer: PRIYA, context: { id: 1, type: "enquiry" }, id: 1, messages: [msg(1, "buyer", "Please share the on-road price in Chennai and the EMI options. Is a test ride possible this weekend?", 3)], storeSlug: "velocity-motors", subject: "Generic Motorcycle — on-road price", unread: { buyer: 0, seller: 1 }, updatedAt: ago(3) },
  { buyer: RAHUL, context: { id: 3, type: "enquiry" }, id: 2, messages: [msg(2, "buyer", "Need 2 scooters for our delivery staff. Please quote a fleet price.", 52), msg(3, "seller", "Hi Rahul, fleet price is ₹2,46,500 each on-road Pune (₹8,500 off), insurance included. Delivery in 5 days.", 48), msg(4, "buyer", "Thanks. Can you include 2 helmets and the first service free?", 47)], storeSlug: "velocity-motors", subject: "Fleet scooters — quotation", unread: { buyer: 0, seller: 1 }, updatedAt: ago(47) },
  { buyer: ANANYA, context: { id: 6, type: "enquiry" }, id: 3, messages: [msg(5, "buyer", "We run a catering unit. Need 120 L cooking oil every month — please share slab pricing and credit terms.", 5)], storeSlug: "annapoorna-wholesale", subject: "Cooking oil 120 L / month", unread: { buyer: 0, seller: 1 }, updatedAt: ago(5) },
  { buyer: { ...GUESTS[1] }, context: { id: 10, type: "enquiry" }, id: 4, messages: [msg(6, "buyer", "15 carbon steel woks for a new restaurant. Can you deliver to Madurai?", 44), msg(7, "seller", "Yes — ₹2,290 per wok for 15+ (10% bulk slab), free delivery to Madurai, 5 days. Sending formal quote.", 40)], storeSlug: "chefpro", subject: "Carbon steel woks × 15", unread: { buyer: 1, seller: 0 }, updatedAt: ago(40) },
  { buyer: VIKRAM, context: { id: 12, type: "enquiry" }, id: 5, messages: [msg(8, "buyer", "40 English-willow cricket bats for our academy, with our logo printed. Need by 15 Dec.", 2)], storeSlug: "jalandhar-sports", subject: "40 branded cricket bats", unread: { buyer: 0, seller: 1 }, updatedAt: ago(2) },
  { buyer: VIKRAM, context: { id: 21, type: "enquiry" }, id: 7, messages: [msg(11, "buyer", "Can you print our academy logo on 60 footballs? Need a sample first and delivery to Hyderabad.", 50), msg(12, "buyer", "Hello? Following up on logo printing — please reply.", 14)], storeSlug: "fitzone", subject: "Logo printing on 60 footballs", unread: { buyer: 0, seller: 2 }, updatedAt: ago(14) },
  { buyer: VIKRAM, context: { id: 2, type: "rfq" }, id: 6, messages: [msg(9, "seller", "Hello Vikram ji, we quoted ₹845/football with 2-colour logo print. Happy to courier a sample first.", 30), msg(10, "buyer", "Please send a sample. Address in my profile.", 22)], storeSlug: "jalandhar-sports", subject: "RFQ: 60 branded footballs", unread: { buyer: 0, seller: 1 }, updatedAt: ago(22) },
];

// ---------- Support tickets (buyers & sellers → Kartiva) ----------
// status: open → in_progress → resolved → closed. priority: low | medium | high | urgent
const ticket = (id, raisedBy, subject, category, priority, status, hours, messages, assignee = null) => ({
  assignee, category, createdAt: ago(hours), id, messages, number: `TKT-${String(1040 + id)}`, priority, raisedBy, slaDueAt: new Date(SEED_NOW - hours * HOUR + ({ high: 8, low: 72, medium: 24, urgent: 4 }[priority]) * HOUR).toISOString(), status, subject, updatedAt: ago(Math.max(0, hours - 1)),
});
const seller = (name, email, storeSlug) => ({ email, name, role: "seller", storeSlug });
const buyer = (b) => ({ email: b.email, name: b.name, role: "buyer" });
export const SEED_TICKETS = [
  ticket(1, seller("Arjun Mehta", "seller@kartiva.demo", "technest"), "Settlement STL-0007 shows lower amount than expected", "payments", "high", "open", 6, [msg(1, "seller", "The settlement for last week is ₹4,120 less than my calculation. Please share the breakup.", 6)]),
  ticket(2, buyer(PRIYA), "Refund not received for cancelled shipment", "refunds", "urgent", "in_progress", 30, [msg(2, "buyer", "I cancelled my order 5 days ago but the refund has not reached my card.", 30), msg(3, "admin", "Hi Priya, refund was initiated on the 6th. Card refunds take 5–7 working days. Sharing the ARN shortly.", 26)], "Kavya Iyer"),
  ticket(3, seller("Senthil Kumar", "wholesale@kartiva.demo", "annapoorna-wholesale"), "How do I upload 200 products at once?", "catalogue", "medium", "resolved", 80, [msg(4, "seller", "Is there a bulk upload option?", 80), msg(5, "admin", "Yes — Seller Hub → Bulk upload. Download the CSV template, fill it and upload.", 76)], "Rohan Das"),
  ticket(4, buyer(VIKRAM), "Seller not responding to my RFQ question", "other", "low", "open", 12, [msg(6, "buyer", "I asked FitZone about logo printing 2 days ago, no reply.", 12)]),
  ticket(5, seller("Gurpreet Singh", "sports@kartiva.demo", "jalandhar-sports"), "Need GST certificate re-verified after address change", "kyc", "medium", "open", 20, [msg(7, "seller", "We moved our factory. Uploaded the amended GST certificate in Business profile.", 20)]),
  ticket(6, buyer(RAHUL), "Wrong item received", "orders", "high", "closed", 400, [msg(8, "buyer", "Received a different colour.", 400), msg(9, "admin", "Return approved and replacement shipped.", 390)], "Rohan Das"),
];

// ---------- Membership plans (JustDial / Alibaba Gold Supplier style) ----------
export const SEED_PLANS = [
  { code: "free", color: "#64748b", commissionDiscount: 0, features: ["List unlimited products", "Receive orders", "5 buy-request quotes / month", "Standard support"], id: 1, isActive: true, leadCredits: 5, name: "Starter", priceYearly: 0 },
  { code: "gold", color: "#ca8a04", commissionDiscount: 1, features: ["Gold Supplier badge", "Trusted Seller badge after KYC", "50 buy-request quotes / month", "Priority in search results", "1% lower commission", "Store analytics"], id: 2, isActive: true, leadCredits: 50, name: "Gold Supplier", priceYearly: 24999 },
  { code: "platinum", color: "#7c3aed", commissionDiscount: 2, features: ["Everything in Gold", "Unlimited buy-request quotes", "Top-of-category placement", "Free sponsored-product credit ₹5,000 / quarter", "2% lower commission", "Dedicated account manager"], id: 3, isActive: true, leadCredits: null, name: "Platinum Partner", priceYearly: 59999 },
];
const SUB_SLUGS = { chefpro: "platinum", "gadget-galaxy": "gold", "jalandhar-sports": "gold", "kartiva-essentials": "platinum", "luxe-lane": "gold", "spice-route": "gold", technest: "platinum", urbanthread: "gold", "velocity-motors": "gold", "annapoorna-wholesale": "gold" };
export const SEED_SUBSCRIPTIONS = Object.entries(SUB_SLUGS).map(([storeSlug, planCode], i) => {
  const plan = SEED_PLANS.find((p) => p.code === planCode);
  const start = SEED_NOW - (30 + i * 23) * 24 * HOUR;
  return { amount: storeSlug === "kartiva-essentials" ? 0 : plan.priceYearly, endsAt: new Date(start + 365 * 24 * HOUR).toISOString(), id: i + 1, invoiceNumber: `KTV-MEM/26-27/${String(i + 1).padStart(4, "0")}`, leadCreditsUsed: Math.round((plan.leadCredits ?? 80) * (0.2 + (i % 4) * 0.15)), planCode, startsAt: new Date(start).toISOString(), status: "active", storeSlug };
});

// ---------- KYC documents ----------
// status: pending | verified | rejected
const DOC_TYPES = ["gst_certificate", "pan_card", "cancelled_cheque", "address_proof"];
export const SEED_KYC = [];
["technest", "gadget-galaxy", "urbanthread", "luxe-lane", "homecraft", "spice-route", "annapoorna-wholesale", "chefpro", "jalandhar-sports", "velocity-motors", "fitzone"].forEach((slug) => {
  DOC_TYPES.forEach((type) => {
    const pending = slug === "fitzone" || (slug === "jalandhar-sports" && type === "gst_certificate");
    SEED_KYC.push({ fileName: `${slug}-${type.replace(/_/g, "-")}.pdf`, id: SEED_KYC.length + 1, note: "", reviewedAt: pending ? null : ago(24 * 30), reviewedBy: pending ? null : "Rohan Das", sizeKb: 180 + ((SEED_KYC.length * 37) % 600), status: pending ? "pending" : "verified", storeSlug: slug, type, uploadedAt: ago(pending ? 20 : 24 * 32) });
  });
});
SEED_KYC.push({ fileName: "fitzone-trade-licence.jpg", id: SEED_KYC.length + 1, note: "Image is blurred — please upload a clear scan.", reviewedAt: ago(10), reviewedBy: "Rohan Das", sizeKb: 920, status: "rejected", storeSlug: "fitzone", type: "trade_licence", uploadedAt: ago(40) });

// ---------- Seller team members ----------
// role: owner | manager | catalogue | orders | accounts. status: active | invited | disabled
export const SEED_SELLER_STAFF = [
  { email: "seller@kartiva.demo", id: 1, lastActiveAt: ago(1), name: "Arjun Mehta", role: "owner", status: "active", storeSlug: "technest" },
  { email: "neha.ops@technest.example.in", id: 2, lastActiveAt: ago(5), name: "Neha Shetty", role: "orders", status: "active", storeSlug: "technest" },
  { email: "catalog@technest.example.in", id: 3, lastActiveAt: ago(30), name: "Faizal Ahmed", role: "catalogue", status: "active", storeSlug: "technest" },
  { email: "accounts@technest.example.in", id: 4, lastActiveAt: null, name: "Kiran Rao", role: "accounts", status: "invited", storeSlug: "technest" },
  { email: "wholesale@kartiva.demo", id: 5, lastActiveAt: ago(2), name: "Senthil Kumar", role: "owner", status: "active", storeSlug: "annapoorna-wholesale" },
  { email: "dispatch@annapoorna.example.in", id: 6, lastActiveAt: ago(8), name: "Muthu Pandi", role: "orders", status: "active", storeSlug: "annapoorna-wholesale" },
  { email: "chefpro@kartiva.demo", id: 7, lastActiveAt: ago(3), name: "Revathi Natarajan", role: "owner", status: "active", storeSlug: "chefpro" },
  { email: "sales@chefpro.example.in", id: 8, lastActiveAt: ago(4), name: "Prakash Iyer", role: "manager", status: "active", storeSlug: "chefpro" },
  { email: "sports@kartiva.demo", id: 9, lastActiveAt: ago(1), name: "Gurpreet Singh", role: "owner", status: "active", storeSlug: "jalandhar-sports" },
  { email: "motors@kartiva.demo", id: 10, lastActiveAt: ago(1), name: "Aditya Kulkarni", role: "owner", status: "active", storeSlug: "velocity-motors" },
  { email: "sales@velocitymotors.example.in", id: 11, lastActiveAt: ago(2), name: "Sameer Joshi", role: "manager", status: "active", storeSlug: "velocity-motors" },
];

// ---------- Admin staff (RBAC) ----------
// role: super_admin | operations | finance | catalogue | support
export const SEED_ADMIN_STAFF = [
  { email: "admin@kartiva.demo", id: 1, lastActiveAt: ago(0.2), name: "Kavya Iyer", role: "super_admin", status: "active", twoFactor: true },
  { email: "rohan.das@kartiva.example.in", id: 2, lastActiveAt: ago(2), name: "Rohan Das", role: "operations", status: "active", twoFactor: true },
  { email: "meera.finance@kartiva.example.in", id: 3, lastActiveAt: ago(20), name: "Meera Pillai", role: "finance", status: "active", twoFactor: true },
  { email: "sahil.catalog@kartiva.example.in", id: 4, lastActiveAt: ago(50), name: "Sahil Khan", role: "catalogue", status: "active", twoFactor: false },
  { email: "support2@kartiva.example.in", id: 5, lastActiveAt: null, name: "Tanvi Joshi", role: "support", status: "invited", twoFactor: false },
];

// ---------- Notifications (in-app bell) ----------
// audience: { role: "buyer"|"seller"|"admin"|"all", email?, storeSlug? }
const note = (id, audience, title, body, link, hours, read = false) => ({ at: ago(hours), audience, body, id, link, read, title });
export const SEED_NOTIFICATIONS = [
  note(1, { role: "seller", storeSlug: "velocity-motors" }, "New enquiry", "Priya Raman asked about Generic Motorcycle (test ride requested).", "/seller/leads", 3),
  note(2, { role: "seller", storeSlug: "jalandhar-sports" }, "New enquiry", "Vikram Nair wants 40 branded cricket bats.", "/seller/leads", 2),
  note(3, { role: "seller", storeSlug: "annapoorna-wholesale" }, "New buy request in your category", "400 kg basmati rice / month — Mumbai.", "/seller/buy-requests", 28),
  note(10, { role: "seller", storeSlug: "fitzone" }, "New enquiry", "Vikram Nair (Nair Sports Academy) asked about logo printing on 60 footballs.", "/seller/leads", 50),
  note(11, { role: "seller", storeSlug: "fitzone" }, "Message from Vikram Nair", "Hello? Following up on logo printing — please reply.", "/seller/messages", 14),
  note(12, { role: "seller", storeSlug: "fitzone" }, "Customer is waiting", "Vikram Nair raised a support ticket because the logo-printing enquiry has no reply. Please respond today.", "/seller/leads", 12),
  note(4, { role: "seller", storeSlug: "technest" }, "Low stock", "3 variants are below the low-stock threshold.", "/seller/inventory", 10),
  note(5, { email: "vikram@kartiva.demo", role: "buyer" }, "New quote received", "Jalandhar Sports Works quoted ₹845 / unit for your football RFQ.", "/account/enquiries", 30),
  note(6, { email: "ananya@kartiva.demo", role: "buyer" }, "New quote received", "Annapoorna Wholesale Mart quoted ₹92 / kg for basmati rice.", "/account/enquiries", 20),
  note(7, { role: "admin" }, "KYC pending", "FitZone Sports uploaded 4 documents for verification.", "/admin/verification", 20),
  note(8, { role: "admin" }, "Urgent ticket", "TKT-1042: refund not received (Priya Raman).", "/admin/support", 30),
  note(9, { role: "all" }, "Diwali sale week", "Platform-wide sale runs 1–7 Nov. Sponsored slots are 20% off.", "/advertise", 24 * 12, true),
];

// ---------- CMS pages + announcement bar ----------
export const SEED_CMS_PAGES = CMS_CONTENT.map((p, i) => ({ ...p, id: i + 1, updatedAt: ago(24 * (5 + ((i * 7) % 40))) }));
export const SEED_ANNOUNCEMENT = { active: true, link: "/post-requirement", text: "New: request quotes for bulk or custom needs — verified suppliers reply within hours." };

// ---------- Broadcast history (admin → sellers / buyers) ----------
export const SEED_BROADCASTS = [
  { audience: "sellers", body: "Platform-wide sale runs 1–7 Nov. Sponsored slots are 20% off.", channels: ["in_app", "email"], id: 1, recipients: 12, sentAt: ago(24 * 12), sentBy: "Kavya Iyer", title: "Diwali sale week" },
  { audience: "buyers", body: "Free delivery above ₹499 from 12 sellers this weekend.", channels: ["in_app"], id: 2, recipients: 18, sentAt: ago(24 * 6), sentBy: "Rohan Das", title: "Weekend free delivery" },
];

// ---------- Wishlists (buyer email → product ids) ----------
export const SEED_WISHLISTS = {
  "ananya@kartiva.demo": [52, 61, 20],
  "buyer@kartiva.demo": [113, 12, 78],
  "rahul@kartiva.demo": [79, 116],
  "vikram@kartiva.demo": [143, 147, 145],
};

export function buildMarketSeed() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  return {
    adminStaff: clone(SEED_ADMIN_STAFF), announcement: clone(SEED_ANNOUNCEMENT), broadcasts: clone(SEED_BROADCASTS), cmsPages: clone(SEED_CMS_PAGES),
    enquiries: clone(SEED_ENQUIRIES), kycDocuments: clone(SEED_KYC), notifications: clone(SEED_NOTIFICATIONS), plans: clone(SEED_PLANS), rfqs: clone(SEED_RFQS),
    sellerStaff: clone(SEED_SELLER_STAFF), subscriptions: clone(SEED_SUBSCRIPTIONS), threads: clone(SEED_THREADS), tickets: clone(SEED_TICKETS), wishlists: clone(SEED_WISHLISTS),
  };
}
