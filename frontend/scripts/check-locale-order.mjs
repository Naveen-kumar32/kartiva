// Verifies that every object in src/locales/en.js has keys sorted A→Z (team convention).
import { EN } from "../src/locales/en.js";

const problems = [];
const check = (obj, path) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  const keys = Object.keys(obj);
  const sorted = [...keys].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })); // human A→Z
  keys.forEach((k, i) => {
    if (k !== sorted[i]) problems.push(`${path}: expected "${sorted[i]}" at position ${i}, found "${k}"`);
  });
  keys.forEach((k) => check(obj[k], `${path}.${k}`));
};
check(EN, "EN");
if (problems.length) {
  console.error(`en.js key order problems:\n  ${[...new Set(problems)].slice(0, 30).join("\n  ")}`);
  process.exit(1);
}
console.log("en.js keys are sorted A→Z ✓");
