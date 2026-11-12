// End-to-end smoke test of the demo (Day-1 notes §23). Run the dev server first: npm run dev
// Usage: npm run e2e   (BASE_URL defaults to http://localhost:5173)
import { mkdirSync } from "node:fs";

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { height: 900, width: 1366 } });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});

const shot = async (name, opts = {}) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.loading = "eager"; i.onload = i.onerror = r; setTimeout(r, 3000); })))); return page.screenshot({ fullPage: opts.fullPage ?? false, path: `${OUT}${name}.png` }); };
const step = async (label, fn) => {
  process.stdout.write(`• ${label} … `);
  await fn();
  console.log("ok");
};

try {
  await step("home page with ad carousel", async () => {
    await page.goto(BASE);
    await page.getByRole("heading", { name: "Featured products" }).waitFor();
    await page.locator('[aria-roledescription="carousel"]').waitFor();
    await page.waitForTimeout(800);
    await shot("01-home");
    await shot("01-home-full", { fullPage: true });
  });

  await step("category listing + colour filter", async () => {
    await page.goto(`${BASE}/c/smartphones`);
    await page.getByRole("heading", { level: 1, name: "Smartphones" }).waitFor();
    await page.getByText("Sponsored").first().waitFor();
    await shot("02-listing");
  });

  await step("search", async () => {
    await page.fill("#site-search", "watch");
    await page.press("#site-search", "Enter");
    await page.getByRole("heading", { level: 1, name: /Results for “watch”/ }).waitFor();
  });

  await step("product with variants → add to cart", async () => {
    await page.goto(`${BASE}/p/iphone-13-pro-123`);
    await page.getByRole("radiogroup").first().waitFor();
    const radios = page.getByRole("radiogroup").first().getByRole("radio");
    await radios.nth(1).click();
    await page.getByRole("button", { exact: true, name: "Add to cart" }).click();
    await page.getByText("Added to cart").first().waitFor();
    await shot("03-product");
  });

  await step("second seller product (grocery) → cart", async () => {
    await page.goto(`${BASE}/p/cooking-oil-20`);
    await page.getByRole("button", { exact: true, name: "Add to cart" }).click();
    await page.goto(`${BASE}/cart`);
    await page.getByRole("heading", { name: "Shopping cart" }).waitFor();
    const sellers = await page.getByText("Sold by").count();
    if (sellers < 2) throw new Error(`expected 2 seller groups, got ${sellers}`);
    await shot("04-cart", { fullPage: true });
  });

  await step("checkout requires login → buyer demo login returns to checkout", async () => {
    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    await shot("05-login");
    await page.getByRole("button", { exact: true, name: "Buyer · Priya" }).click();
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("heading", { name: "Checkout" }).waitFor();
  });

  await step("checkout: address → delivery → payment → review → mock Razorpay", async () => {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Each seller ships separately").waitFor();
    if (await page.getByRole("button", { name: "Continue" }).isDisabled()) throw new Error("delivery step blocked");
    if (await page.locator("input[type=radio]:checked:disabled").count()) throw new Error("unserviceable delivery method selected");
    await shot("06-checkout-delivery", { fullPage: true });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Pay online").waitFor();
    await shot("07-checkout-payment");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Tax breakdown").waitFor();
    await shot("08-checkout-review", { fullPage: true });
    await page.getByRole("button", { name: /^Pay / }).click();
    await page.getByRole("dialog").waitFor();
    await shot("09-mock-razorpay");
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    await page.getByRole("heading", { name: "Order placed successfully!" }).waitFor();
    await shot("10-order-success");
  });

  await step("my orders shows split shipments", async () => {
    await page.getByRole("link", { name: "View my orders" }).click();
    await page.getByRole("heading", { name: "My orders" }).waitFor();
    if ((await page.getByText(/Shipment from/).count()) < 2) throw new Error("expected 2 shipments");
    await shot("11-my-orders", { fullPage: true });
  });

  // Custom dropdowns (components/ui/Select): open by label, pick the option by its text.
  const choose = async (label, option) => {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole("option", { exact: true, name: option }).click();
  };
  const DEMO = { Admin: "Admin · Kavya", Buyer: "Buyer · Priya", Seller: "Seller · Arjun" };
  const switchUser = async (roleLabel, { keepData = false } = {}) => {
    await context.clearCookies();
    await page.evaluate((keep) => (keep ? localStorage.removeItem("kartiva.authUser") : localStorage.clear()), keepData);
    await page.goto(`${BASE}/login`);
    await page.getByRole("button", { exact: true, name: DEMO[roleLabel] ?? roleLabel }).click();
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  };

  await step("seller dashboard", async () => {
    await switchUser("Seller");
    await page.getByRole("heading", { level: 1, name: /Welcome back/ }).waitFor();
    await page.locator("svg[role=img]").first().waitFor();
    await shot("12-seller-dashboard", { fullPage: true });
    await page.getByRole("link", { name: /^Products(\s|$)/ }).click();
    await page.getByRole("heading", { level: 1, name: "Products" }).waitFor();
    await shot("13-seller-products");
  });

  await step("seller cannot open admin area", async () => {
    await page.goto(`${BASE}/admin`);
    await page.waitForURL(/\/seller$/);
  });

  await step("admin dashboard, sellers approval, ad manager", async () => {
    await switchUser("Admin");
    await page.getByText("Platform revenue").waitFor();
    await shot("14-admin-dashboard", { fullPage: true });
    await page.getByRole("link", { name: /^Sellers(\s|$)/ }).click();
    await page.getByRole("button", { name: "Approve" }).first().click();
    await page.getByText(/approved — their store is live/).waitFor();
    await shot("15-admin-sellers");
    await page.getByRole("link", { name: /^Ads(\s|$)/ }).click();
    await page.getByRole("heading", { name: "Ad manager" }).waitFor();
    await shot("16-admin-ads", { fullPage: true });
  });

  await step("admin creates a category → it appears in the storefront menu", async () => {
    await page.goto(`${BASE}/admin/categories`); // Catalogue section → Categories tab
    await page.getByRole("heading", { level: 1, name: "Categories" }).waitFor();
    await page.getByRole("button", { exact: true, name: "New category" }).click();
    await page.getByRole("dialog").getByLabel("Category name").fill("Toys & Games");
    await page.getByRole("dialog").getByRole("button", { name: /save|create/i }).last().click();
    await page.getByText("Toys & Games").first().waitFor();
    await shot("19-admin-categories", { fullPage: true });
    await page.goto(`${BASE}/categories`);
    await page.getByRole("heading", { name: "Toys & Games" }).first().waitFor();
  });

  await step("admin pages render (orders, products, reports, documents, settlements, ads)", async () => {
    for (const [path, heading, file] of [
      ["/admin/orders", "Orders", "20-admin-orders"], ["/admin/products", "Products", "21-admin-products"],
      ["/admin/reports", "Reports", "22-admin-reports"], ["/admin/documents", "Documents", "23-admin-documents"],
      ["/admin/settlements", "Settlements", "24-admin-settlements"], ["/admin/commissions", "Commission", "25-admin-commission"],
      ["/admin/returns", "Returns & refunds", "26-admin-returns"], ["/admin/buyers", "Buyers", "27-admin-buyers"],
      ["/admin/reviews", "Reviews", "28-admin-reviews"], ["/admin/audit-log", "Audit log", "29-admin-audit"], ["/admin/settings", "Platform settings", "30-admin-settings"],
    ]) {
      await page.goto(`${BASE}${path}`);
      await page.getByRole("heading", { level: 1, name: heading }).waitFor();
      await shot(file, { fullPage: true });
    }
  });

  await step("admin downloads a GST tax invoice PDF", async () => {
    await page.goto(`${BASE}/admin/documents`);
    await page.getByRole("tab", { name: /GST tax invoices/ }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).first().click()]);
    if (!download.suggestedFilename().endsWith(".pdf")) throw new Error(`unexpected download ${download.suggestedFilename()}`);
  });

  await step("letterhead: write a letter, download PDF, email it → Outbox", async () => {
    await page.goto(`${BASE}/admin/letters`);
    await page.getByRole("heading", { level: 1, name: "Letters & mail" }).waitFor();
    await shot("40-admin-letters", { fullPage: true });
    const [letter] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).first().click()]);
    await letter.saveAs(`${OUT}letter.pdf`);
    await page.getByRole("button", { name: "Email this letter" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send email" }).click();
    await page.getByText(/Email sent to/).first().waitFor();
    await page.getByRole("tab", { name: /Outbox/ }).click();
    await page.getByText("Welcome to the Kartiva marketplace").first().waitFor();
    await shot("41-admin-outbox");
  });

  await step("admin order drawer: order summary + payment receipt PDFs", async () => {
    await page.goto(`${BASE}/admin/documents`);
    const [summary] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { exact: true, name: "Order summary" }).first().click()]);
    await summary.saveAs(`${OUT}order-summary.pdf`);
    const [receipt] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { exact: true, name: "Payment receipt" }).first().click()]);
    await receipt.saveAs(`${OUT}payment-receipt.pdf`);
  });

  await step("simplified navigation: sections + tabs + page search; customer pages are customer-only", async () => {
    await switchUser("Seller");
    await page.goto(`${BASE}/seller/inventory`);
    await page.getByRole("navigation", { name: "Products" }).getByRole("link", { name: "Bulk upload" }).waitFor();
    await page.getByPlaceholder("Find a page…").fill("delivery");
    await page.getByRole("link", { name: /Delivery options/ }).click();
    await page.waitForURL("**/seller/shipping");
    await page.goto(`${BASE}/account/orders`);
    await page.waitForURL(/\/seller$/);
    await switchUser("Buyer");
    await page.goto(`${BASE}/account`);
    await page.getByRole("heading", { level: 1, name: /Hello, Priya/ }).waitFor();
    await shot("87-account-home", { fullPage: true });
  });

  await step("seller hub pages render (inventory, returns, shipping, earnings, ads, reviews, store, product form)", async () => {
    await switchUser("Seller");
    for (const [path, file] of [
      ["/seller/products/new", "31-seller-product-form"], ["/seller/inventory", "32-seller-inventory"], ["/seller/orders", "33-seller-orders"],
      ["/seller/returns", "34-seller-returns"], ["/seller/shipping", "35-seller-shipping"], ["/seller/earnings", "36-seller-earnings"],
      ["/seller/ads", "37-seller-ads"], ["/seller/reviews", "38-seller-reviews"], ["/seller/store", "39-seller-store"],
    ]) {
      await page.goto(`${BASE}${path}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForTimeout(300);
      await shot(file, { fullPage: true });
    }
  });

  await step("Alibaba-style categories: mega menu + all-categories page", async () => {
    await page.goto(BASE);
    await page.getByRole("heading", { name: "Categories for you" }).waitFor();
    const bar = page.getByRole("navigation", { name: "All categories" });
    await bar.getByRole("button", { name: "All categories" }).click();
    await bar.getByRole("link", { name: /Industrial Machinery/ }).hover();
    await bar.getByRole("link", { name: "Packaging Machines" }).waitFor();
    await shot("84-mega-menu");
    await page.goto(`${BASE}/categories`);
    await page.getByRole("heading", { level: 1, name: "All categories" }).waitFor();
    await page.getByRole("heading", { name: "Renewable Energy" }).waitFor();
    await shot("85-all-categories", { fullPage: true });
    await page.goto(`${BASE}/c/renewable-energy`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await shot("86-empty-category");
  });

  await step("seller self sign-up → pending Seller Hub → admin sees application", async () => {
    await context.clearCookies();
    await page.evaluate(() => localStorage.removeItem("kartiva.authUser"));
    await page.goto(`${BASE}/register?type=seller`);
    const fill = (label, value) => page.getByLabel(label, { exact: true }).fill(value);
    await fill("First name", "Leela"); await fill("Last name", "Menon");
    await fill("Email address", "leela@coastalcashew.example.in"); await fill("Mobile number", "9876501234");
    await fill("Business / store name", "Coastal Cashew Exports");
    await choose("Business type", "Manufacturer & Exporter");
    await choose("Main product category", "Agriculture, Food & Beverage");
    await fill("GSTIN", "32ABCDE1234F1Z5"); await fill("Business PAN", "ABCDE1234F");
    await fill("City", "Kollam"); await choose("State", "Kerala"); await fill("Year established", "2001");
    await fill("Password", "Test@1234"); await fill("Confirm password", "Test@1234");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Register your business" }).click();
    await page.getByText("Your business is under review").waitFor();
    await shot("50-seller-signup-pending", { fullPage: true });
    await switchUser("Admin", { keepData: true });
    await page.goto(`${BASE}/admin/sellers`);
    await page.getByText("Coastal Cashew Exports").first().waitFor();
    await shot("51-admin-new-application", { fullPage: true });
  });

  await step("buyer enquiry on a dealer bike → lead in the dealer's Seller Hub", async () => {
    await switchUser("Buyer · Priya", { keepData: true });
    await page.goto(`${BASE}/p/generic-motorcycle-113`);
    await page.getByText(/Ex-showroom/).first().waitFor();
    if (await page.getByRole("button", { exact: true, name: "Add to cart" }).count()) throw new Error("enquiry-only product shows Add to cart");
    await page.getByRole("button", { name: /on-road price/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").first().fill("Smoke test enquiry: on-road price in Chennai please.");
    await dialog.locator("button[type=submit]").click();
    await page.getByText(/enquiry (has been )?sent|sent to/i).first().waitFor();
    await shot("52-buyer-enquiry-sent");
    await switchUser("Seller · Aditya", { keepData: true });
    await page.goto(`${BASE}/seller/leads`);
    await page.getByText(/Smoke test enquiry/).first().waitFor();
    await shot("53-seller-leads", { fullPage: true });
  });

  await step("round-3 seller pages render", async () => {
    for (const [path, file] of [
      ["/seller/analytics", "54-seller-analytics"], ["/seller/buy-requests", "55-seller-rfqs"], ["/seller/messages", "56-seller-messages"],
      ["/seller/customers", "57-seller-customers"], ["/seller/business", "58-seller-business"], ["/seller/plan", "59-seller-plan"],
      ["/seller/team", "60-seller-team"], ["/seller/bulk-upload", "61-seller-bulk"], ["/seller/support", "62-seller-support"],
    ]) {
      await page.goto(`${BASE}${path}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForTimeout(300);
      await shot(file, { fullPage: true });
    }
  });

  await step("round-3 admin pages render", async () => {
    await switchUser("Admin", { keepData: true });
    for (const [path, file] of [
      ["/admin/analytics", "63-admin-analytics"], ["/admin/product-requests", "63b-admin-product-requests"], ["/admin/leads", "64-admin-leads"], ["/admin/verification", "65-admin-kyc"],
      ["/admin/plans", "66-admin-plans"], ["/admin/support", "67-admin-support"], ["/admin/content", "68-admin-content"],
      ["/admin/broadcasts", "69-admin-broadcasts"], ["/admin/staff", "70-admin-staff"], ["/admin/risk", "71-admin-risk"],
      ["/admin/transactions", "72-admin-transactions"], ["/admin/tax", "73-admin-tax"],
    ]) {
      await page.goto(`${BASE}${path}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForTimeout(300);
      await shot(file, { fullPage: true });
    }
  });

  await step("buyer account pages + post a buy request", async () => {
    await switchUser("Buyer · Ananya", { keepData: true });
    for (const [path, file] of [
      ["/account/enquiries", "74-buyer-enquiries"], ["/account/messages", "75-buyer-messages"], ["/account/wishlist", "76-buyer-wishlist"],
      ["/account/profile", "77-buyer-profile"], ["/account/support", "78-buyer-support"], ["/account/notifications", "79-buyer-notifications"],
      ["/pages/about", "80-cms-about"], ["/pages/returns", "80b-cms-returns"], ["/pages/grievance", "80c-cms-grievance"], ["/report?type=ip", "80d-report-ip"], ["/store/chefpro", "81-store-chefpro"], ["/p/carbon-steel-wok-52", "82-product-bulk"], ["/post-requirement", "83-post-requirement"],
    ]) {
      await page.goto(`${BASE}${path}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForTimeout(300);
      await shot(file, { fullPage: true });
    }
  });

  await step("mobile home + product", async () => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto(BASE);
    await page.getByRole("heading", { name: "Featured products" }).waitFor();
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error("horizontal scroll on mobile home");
    await shot("17-mobile-home");
    await page.goto(`${BASE}/c/fashion`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForTimeout(400);
    await shot("18-mobile-listing");
  });
} catch (err) {
  console.log("FAILED");
  console.error(err);
  await shot("zz-failure", { fullPage: true });
  errors.push(`step failure: ${err.message}`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ${[...new Set(errors)].join("\n- ")}`);
  process.exit(1);
}
console.log(`\nAll smoke checks passed. Screenshots: ${OUT}`);
