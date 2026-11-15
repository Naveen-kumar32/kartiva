"""Smart product search — typo-tolerant, sound-alike ("sampoo" → shampoo), local words (Tamil / Tanglish / Hindi),
intent words ("cheap", "pudhusa") and a related-products fallback. No AI, no external service.
Same algorithm as the frontend's src/utils/smartSearch.js (keep the two in step; the word list is search_words.json,
an exact copy of frontend/src/data/searchWords.json — a test checks they match)."""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

WORDS = json.loads((Path(__file__).parent / "search_words.json").read_text(encoding="utf-8"))
_LETTERS = re.compile(r"[^a-z0-9ऀ-ॿ஀-௿]+")
_LATIN = re.compile(r"^[a-z0-9]+$")


def normalize(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(ch for ch in s if not ("̀" <= ch <= "ͯ"))
    return _LETTERS.sub(" ", s.lower()).strip()


def tokens(s):
    return [t for t in normalize(s).split(" ") if t]


def stem(w):
    """plural → singular: batteries → battery, watches → watch, glasses → glass, shoes → shoe."""
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 4 and re.search(r"(ss|x|z|ch|sh)es$", w):
        return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def phonetic(word):
    """Sound-alike key for Latin words: sampoo/shampoo → "smp", kofee/coffee → "kf", zerox/xerox → "srks"."""
    if not _LATIN.match(word or "") or len(word) < 3:
        return None
    w = re.sub(r"^x", "s", word)
    for a, b in (("ph", "f"), ("ck", "k"), ("sch", "sk"), ("sh", "s"), ("ch", "c")):
        w = w.replace(a, b)
    w = re.sub(r"([tdbgk])h", r"\1", w)
    for a, b in (("z", "s"), ("x", "ks"), ("q", "k"), ("c", "k"), ("w", "v"), ("y", "i")):
        w = w.replace(a, b)
    w = re.sub(r"(.)\1+", r"\1", w)
    key = w[0] + re.sub(r"[aeiou]", "", w[1:])
    return re.sub(r"(.)\1+", r"\1", key)


def edit_distance(a, b, mx=3):
    """Optimal-string-alignment distance (insert / delete / replace / swap two neighbours = 1 each)."""
    if abs(len(a) - len(b)) > mx:
        return mx + 1
    d = [[i] + [0] * len(b) for i in range(len(a) + 1)]
    for j in range(1, len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


def max_edits(n):
    return 1 if n <= 4 else 2 if n <= 7 else 3


def parse_custom_words(text):
    """"thakkali = tomato" lines (Admin → Settings) on top of the built-in word list."""
    out = {}
    for line in str(text or "").splitlines():
        left, _, right = line.partition("=")
        key = normalize(left)
        values = [v for v in (normalize(x) for x in right.split(",")) if v]
        if key and values:
            out[key] = values
    return out


# longest phrases first, so "kammi vilai" wins over "kammi"
INTENT = sorted(((normalize(p), sort) for sort, phrases in WORDS["intent"].items() for p in phrases), key=lambda x: -len(x[0]))
STOP = {normalize(w) for w in WORDS["stopwords"]}


@lru_cache(maxsize=8)
def _synonyms(custom_words):
    base = {normalize(k): [normalize(x) for x in v] for k, v in WORDS["synonyms"].items()}
    return {**base, **parse_custom_words(custom_words)}


class Searcher:
    """Build over a list of product dicts (each with "store") — cheap enough to rebuild per request.
    category_names(slug) → "Smartphones Electronics" (category + parent names)."""

    def __init__(self, products, category_names=lambda slug: "", custom_words=""):
        self.category_names = category_names
        self.synonyms = _synonyms(custom_words or "")
        self.indexed = [(self._fields(p), p) for p in products]
        self.vocab, self.display = {}, {}
        for _, p in self.indexed:
            for raw in tokens(p.get("name")) + tokens(p.get("brand")) + tokens(category_names(p.get("categorySlug"))):
                w = stem(raw)
                if len(w) > 1 and w not in self.vocab:
                    self.vocab[w] = phonetic(w)
                    self.display[w] = raw

    def _fields(self, p):
        rows = [(tokens(p.get("name")), 5),
                (tokens(p.get("brand")) + tokens((p.get("store") or {}).get("name")) + tokens(self.category_names(p.get("categorySlug"))), 3),
                (tokens(p.get("description")), 1)]
        return [([stem(w) for w in words], weight) for words, weight in rows]

    def _contains(self, s):
        return len(s) >= 4 and any(s in w for w in self.vocab)

    def _close_words(self, s):
        """Close catalogue words for a misspelt word. Two+ edits only when the first letter (or the sound) matches."""
        if len(s) < 4:
            return []
        key, limit, found = phonetic(s), max_edits(len(s)), []
        for w, k in self.vocab.items():
            if w.startswith(s):
                found.append((w, 0.85))
                continue
            if s in w:
                found.append((w, 0.8))
                continue
            dist = edit_distance(s, w, limit + 1)
            sim = 1 - dist / max(len(s), len(w))
            sounds_same = bool(key) and k == key
            if dist == 1 or (dist <= limit and sim >= 0.5 and (w[0] == s[0] or sounds_same)):
                found.append((w, 0.9 * sim))
            elif sounds_same and sim >= 0.4:
                found.append((w, 0.75 * max(sim, 0.6)))
        return sorted(found, key=lambda x: -x[1])[:4]

    def expand(self, term):
        """A query word → [(catalogue word, weight)] alternatives (exact, local-word meaning, spelling / sound-alike fixes)."""
        alts = {}

        def add(w, weight):
            if alts.get(w, 0) < weight:
                alts[w] = weight

        base = stem(term)
        meanings = self.synonyms.get(term)
        if not meanings and base not in self.vocab and len(term) >= 5:
            near = next((k for k in self.synonyms if " " not in k and edit_distance(term, k, 1) <= 1), None)
            if near:
                meanings = self.synonyms[near]
        for m in meanings or []:
            for w in m.split(" "):
                s = stem(w)
                if s in self.vocab:
                    add(s, 0.95)
                else:
                    for v in self.vocab:
                        if len(s) >= 4 and (v.startswith(s) or s in v):
                            add(v, 0.8)
        if base in self.vocab:
            add(base, 1)
        else:
            if len(base) >= 3:
                for v in self.vocab:
                    if v.startswith(base) or (len(base) >= 4 and base in v):
                        add(v, 0.85)
            if not meanings:
                for w, weight in self._close_words(base):
                    add(w, weight)
        return sorted(alts.items(), key=lambda x: -x[1])

    def parse(self, q):
        """Intent words → sort hint, local phrases joined, filler words dropped."""
        words, sort_hint = tokens(q), None
        for phrase, sort in INTENT:
            parts = phrase.split(" ")
            i = 0
            while i + len(parts) <= len(words):
                if words[i:i + len(parts)] == parts:
                    sort_hint = sort_hint or sort
                    del words[i:i + len(parts)]
                else:
                    i += 1
        terms, i = [], 0
        while i < len(words):
            pair = f"{words[i]} {words[i + 1]}" if i + 1 < len(words) else ""
            if pair and pair in self.synonyms:
                terms.append(pair)
                i += 2
            else:
                terms.append(words[i])
                i += 1
        return sort_hint, [t for t in terms if t not in STOP and (len(t) > 1 or any(c.isdigit() for c in t))]

    @staticmethod
    def _score(fields, groups, require_all):
        score = matched = 0
        for alts in groups:
            best = 0
            for word, weight in alts:
                for words, field_weight in fields:
                    hit = 1 if word in words else 0.8 if len(word) >= 3 and any(w.startswith(word) for w in words) else 0
                    best = max(best, hit * field_weight * weight)
            if best > 0:
                matched += 1
            score += best
        needed = (len(groups) - 1 if len(groups) >= 3 else len(groups)) if require_all else 1
        return score if matched >= needed else 0

    def search(self, q):
        """→ {results: [(product, score)], corrected, sortHint, mode: "match" | "partial" | "related" | "all"}"""
        sort_hint, terms = self.parse(q)
        if not terms:
            return {"corrected": None, "mode": "all", "results": [(p, 0) for _, p in self.indexed], "sortHint": sort_hint}
        groups = [self.expand(t) for t in terms]
        corrected = " ".join(
            t if (t in self.synonyms or stem(t) in self.vocab or self._contains(stem(t)) or not groups[i]) else self.display.get(groups[i][0][0], groups[i][0][0])
            for i, t in enumerate(terms))
        for require_all in (True, False):
            results = [(p, s) for p, s in ((p, self._score(f, groups, require_all)) for f, p in self.indexed) if s > 0]
            if results:
                return {"corrected": corrected if require_all and corrected != " ".join(terms) else None,
                        "mode": "match" if require_all else "partial", "results": results, "sortHint": sort_hint}
        related = [p for _, p in self.indexed
                   if any(edit_distance(stem(t), stem(w), 2) <= 2 for t in terms for w in normalize(self.category_names(p.get("categorySlug"))).split(" ") if w)]
        pool = related or [p for _, p in self.indexed]
        return {"corrected": None, "mode": "related", "results": [(p, (p.get("soldCount") or 0) / 1e6) for p in pool], "sortHint": sort_hint}
