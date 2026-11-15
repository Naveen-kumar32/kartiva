// Smart product search — typo-tolerant, sound-alike ("sampoo" → shampoo), local words (Tamil / Tanglish / Hindi),
// intent words ("cheap", "pudhusa") and a related-products fallback. No AI, no external service.
// The backend has the SAME algorithm in apps/catalog/smart_search.py (keep the two in step).
import WORDS from "@/data/searchWords.json";

// keeps Latin letters, digits, Devanagari (U+0900–097F) and Tamil (U+0B80–0BFF), incl. their vowel signs
// eslint-disable-next-line no-misleading-character-class -- whole Unicode blocks on purpose (Tamil vowel signs are combining marks)
const LETTERS = new RegExp("[^a-z0-9\\u0900-\\u097f\\u0b80-\\u0bff]+", "g");

export const normalize = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(LETTERS, " ").trim();
const tokens = (s) => normalize(s).split(" ").filter(Boolean);
// plural → singular: batteries → battery, watches → watch, glasses → glass, boxes → box, shoes → shoe, fragrances → fragrance
export function stem(w) {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ss|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
const isLatin = (w) => /^[a-z0-9]+$/.test(w);

/** Sound-alike key for Latin words: sampoo/shampoo → "smp", kofee/coffee → "kf", zerox/xerox → "srks". */
export function phonetic(word) {
  if (!isLatin(word) || word.length < 3) return null;
  let w = word.replace(/^x/, "s").replace(/ph/g, "f").replace(/ck/g, "k").replace(/sch/g, "sk").replace(/sh/g, "s").replace(/ch/g, "c")
    .replace(/([tdbgk])h/g, "$1").replace(/z/g, "s").replace(/x/g, "ks").replace(/q/g, "k").replace(/c/g, "k").replace(/w/g, "v").replace(/y/g, "i");
  w = w.replace(/(.)\1+/g, "$1");
  const key = w[0] + w.slice(1).replace(/[aeiou]/g, "");
  return key.replace(/(.)\1+/g, "$1");
}

/** Optimal-string-alignment distance (insert / delete / replace / swap two neighbours = 1 each). */
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
const maxEdits = (len) => (len <= 4 ? 1 : len <= 7 ? 2 : 3);

/** "thakkali = tomato" lines (Admin → Settings) on top of the built-in word list. */
export function parseCustomWords(text) {
  const out = {};
  String(text ?? "").split(/\r?\n/).forEach((line) => {
    const [left, right] = line.split("=");
    const key = normalize(left);
    const values = String(right ?? "").split(",").map(normalize).filter(Boolean);
    if (key && values.length) out[key] = values;
  });
  return out;
}

// longest phrases first, so "kammi vilai" wins over "kammi"
const INTENT = Object.entries(WORDS.intent).flatMap(([sort, phrases]) => phrases.map((p) => [normalize(p), sort])).sort((a, b) => b[0].length - a[0].length);
const STOP = new Set(WORDS.stopwords.map(normalize));

/** Words a product can be found by, with how strongly each field counts. */
function productFields(p, categoryNames) {
  return [
    [tokens(p.name), 5],
    [[...tokens(p.brand), ...tokens(p.store?.name), ...tokens(categoryNames(p.categorySlug))], 3],
    [tokens(p.description), 1],
  ].map(([words, weight]) => [words.map(stem), weight]);
}

/**
 * Build a searcher over a list of products (each with .store) — cheap enough to rebuild per request.
 * categoryNames(slug) → "Smartphones Electronics" (category + parent names).
 */
export function createSearcher(products, { categoryNames = () => "", customWords = "" } = {}) {
  const synonyms = { ...Object.fromEntries(Object.entries(WORDS.synonyms).map(([k, v]) => [normalize(k), v.map(normalize)])), ...parseCustomWords(customWords) };
  const indexed = products.map((p) => ({ fields: productFields(p, categoryNames), p }));
  const vocab = new Map(); // stemmed word → phonetic key
  const display = new Map(); // stemmed word → how it is written in the catalogue (for "Did you mean")
  indexed.forEach(({ p }) => [...tokens(p.name), ...tokens(p.brand), ...tokens(categoryNames(p.categorySlug))].forEach((raw) => {
    const w = stem(raw);
    if (w.length > 1 && !vocab.has(w)) { vocab.set(w, phonetic(w)); display.set(w, raw); }
  }));
  const contains = (s) => s.length >= 4 && [...vocab.keys()].some((w) => w.includes(s));

  /** Close catalogue words for a misspelt word: [[word, weight]]. Two+ edits only when the first letter (or the sound) matches. */
  function closeWords(s) {
    if (s.length < 4) return [];
    const key = phonetic(s);
    const limit = maxEdits(s.length);
    const found = [];
    vocab.forEach((k, w) => {
      if (w.startsWith(s)) return found.push([w, 0.85]);
      if (w.includes(s)) return found.push([w, 0.8]);
      const dist = editDistance(s, w, limit + 1);
      const sim = 1 - dist / Math.max(s.length, w.length);
      const soundsSame = key && k === key;
      if (dist === 1 || (dist <= limit && sim >= 0.5 && (w[0] === s[0] || soundsSame))) found.push([w, 0.9 * sim]);
      else if (soundsSame && sim >= 0.4) found.push([w, 0.75 * Math.max(sim, 0.6)]);
    });
    return found.sort((a, b) => b[1] - a[1]).slice(0, 4);
  }

  /** A query word → [[catalogue word, weight]] alternatives (exact, local-word meaning, spelling / sound-alike fixes). */
  function expand(term) {
    const alts = new Map();
    const add = (w, weight) => { if ((alts.get(w) ?? 0) < weight) alts.set(w, weight); };
    const base = stem(term);
    // local word → English meanings (meanings are real words: only exact / prefix / compound matches, never "corrected")
    let meanings = synonyms[term];
    if (!meanings && !vocab.has(base) && term.length >= 5) {
      const near = Object.keys(synonyms).find((k) => !k.includes(" ") && editDistance(term, k, 1) <= 1);
      if (near) meanings = synonyms[near];
    }
    (meanings ?? []).forEach((m) => m.split(" ").forEach((w) => {
      const s = stem(w);
      if (vocab.has(s)) add(s, 0.95);
      else vocab.forEach((_, v) => { if (s.length >= 4 && (v.startsWith(s) || v.includes(s))) add(v, 0.8); });
    }));
    if (vocab.has(base)) add(base, 1);
    else {
      if (base.length >= 3) vocab.forEach((_, v) => { if (v.startsWith(base) || (base.length >= 4 && v.includes(base))) add(v, 0.85); });
      if (!meanings) closeWords(base).forEach(([w, weight]) => add(w, weight));
    }
    return [...alts].sort((a, b) => b[1] - a[1]);
  }

  /** Parse a query: intent words → sort hint, local phrases, filler words dropped. */
  function parse(q) {
    let words = tokens(q);
    let sortHint = null;
    for (const [phrase, sort] of INTENT) {
      const parts = phrase.split(" ");
      for (let i = 0; i + parts.length <= words.length; i++) {
        if (parts.every((w, k) => words[i + k] === w)) { sortHint ??= sort; words.splice(i, parts.length); i--; }
      }
    }
    // join two-word local phrases ("cell phone", "kammi vilai") into one term when the word list knows them
    const terms = [];
    for (let i = 0; i < words.length; i++) {
      const pair = `${words[i]} ${words[i + 1] ?? ""}`.trim();
      if (words[i + 1] && synonyms[pair]) { terms.push(pair); i++; } else terms.push(words[i]);
    }
    return { sortHint, terms: terms.filter((t) => !STOP.has(t) && (t.length > 1 || /\d/.test(t))) };
  }

  function scoreOf(fields, groups, requireAll) {
    let score = 0;
    let matched = 0;
    for (const alts of groups) {
      let best = 0;
      for (const [word, weight] of alts) {
        for (const [words, fieldWeight] of fields) {
          const hit = words.includes(word) ? 1 : word.length >= 3 && words.some((w) => w.startsWith(word)) ? 0.8 : 0;
          best = Math.max(best, hit * fieldWeight * weight);
        }
      }
      if (best > 0) matched += 1;
      score += best;
    }
    const needed = requireAll ? (groups.length >= 3 ? groups.length - 1 : groups.length) : 1;
    return matched >= needed ? score : 0;
  }

  /** → { results: [{p, score}], corrected, sortHint, mode: "match" | "partial" | "related" | "all" } */
  function search(q) {
    const { sortHint, terms } = parse(q);
    if (!terms.length) return { corrected: null, mode: "all", results: indexed.map(({ p }) => ({ p, score: 0 })), sortHint };
    const groups = terms.map(expand);
    // "Did you mean": only for words that are not in the catalogue, not a known local word and not part of a longer word
    const corrected = terms.map((t, i) => (synonyms[t] || vocab.has(stem(t)) || contains(stem(t)) || !groups[i][0] ? t : display.get(groups[i][0][0]) ?? groups[i][0][0])).join(" ");
    for (const requireAll of [true, false]) {
      const results = indexed.map(({ fields, p }) => ({ p, score: scoreOf(fields, groups, requireAll) })).filter((r) => r.score > 0);
      if (results.length) return { corrected: requireAll && corrected !== terms.join(" ") ? corrected : null, mode: requireAll ? "match" : "partial", results, sortHint };
    }
    // Nothing matched: related products — the category whose name is closest to a query word, else best sellers.
    const related = indexed.filter(({ p }) => terms.some((t) => normalize(categoryNames(p.categorySlug)).split(" ").filter(Boolean).some((w) => editDistance(stem(t), stem(w), 2) <= 2)));
    const pool = related.length ? related : indexed;
    return { corrected: null, mode: "related", results: pool.map(({ p }) => ({ p, score: (p.soldCount ?? 0) / 1e6 })), sortHint };
  }

  return { expand, parse, search };
}
