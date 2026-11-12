import { describe, expect, it } from "vitest";

import { EN } from "../en";

// Same comparison as scripts/check-locale-order.mjs (team convention: keys A→Z at every level).
const compare = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });
const collectProblems = (obj, path = "EN", out = []) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  const keys = Object.keys(obj);
  const sorted = [...keys].sort(compare);
  if (keys.join("|") !== sorted.join("|")) out.push(`${path}: ${keys.find((k, i) => k !== sorted[i])} is out of order`);
  keys.forEach((k) => collectProblems(obj[k], `${path}.${k}`, out));
  return out;
};

describe("en.js", () => {
  it("has top-level keys sorted A→Z", () => {
    const keys = Object.keys(EN);
    expect(keys).toEqual([...keys].sort(compare));
  });

  it("has every nested object's keys sorted A→Z", () => {
    expect(collectProblems(EN)).toEqual([]);
  });
});
