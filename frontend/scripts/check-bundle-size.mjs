// Performance budget (docs/OPERATIONS_GUIDE §4): fails CI when a production chunk grows past its gzip budget.
// Run after `vite build`:  node scripts/check-bundle-size.mjs
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIR = new URL("../dist/assets/", import.meta.url);
const KB = 1024;
// [file-name prefix, gzip budget] — storefront entry is what buyers download first.
const BUDGETS = [
  ["index-", 130 * KB, "js"],   // storefront entry (React, router, store, storefront pages)
  ["seller-", 60 * KB, "js"],   // Seller Hub lazy chunk
  ["admin-", 75 * KB, "js"],    // Admin lazy chunk
  ["index-", 25 * KB, "css"],
];
const files = readdirSync(DIR);
let failed = false;
for (const [prefix, budget, ext] of BUDGETS) {
  const matches = files.filter((f) => f.startsWith(prefix) && f.endsWith(`.${ext}`));
  for (const f of matches) {
    const size = gzipSync(readFileSync(new URL(f, DIR))).length;
    const ok = size <= budget;
    failed ||= !ok;
    console.log(`${ok ? "✓" : "✗"} ${f.padEnd(34)} ${(size / KB).toFixed(1).padStart(6)} kB gzip  (budget ${(budget / KB).toFixed(0)} kB)`);
  }
}
if (failed) { console.error("\nPerformance budget exceeded — split the chunk or remove weight before merging."); process.exit(1); }
