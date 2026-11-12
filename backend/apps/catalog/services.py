"""Storefront catalogue logic — port of frontend src/api/catalogApi.js + src/utils/catalog.js (mock branch)."""
from apps.core.services import get_platform
from apps.market.models import KycDocument

from .models import Category, Product, Review, Store

PAGE_SIZE = 24


# ---------- Reference data ----------
class Catalog:
    """One snapshot of categories + stores for a request (avoids N+1 lookups while filtering products)."""

    def __init__(self):
        self.categories = [c.data for c in Category.objects.all()]
        self.cat_by_slug = {c.get("slug"): c for c in self.categories}
        self.cat_by_id = {c.get("id"): c for c in self.categories}
        self.stores = {s.slug: s.data for s in Store.objects.all()}

    def is_public(self, p):
        """Active, not deleted, from an approved store, in an active category."""
        store = self.stores.get(p.get("storeSlug"))
        cat = self.cat_by_slug.get(p.get("categorySlug"))
        return p.get("status") == "active" and not p.get("deletedAt") and bool(store) and store.get("status") == "approved" and (cat or {}).get("isActive") is not False

    def public_products(self):
        return [p.data for p in Product.objects.filter(deleted_at__isnull=True, status="active") if self.is_public(p.data)]

    def with_summary(self, p):
        return {**p, "summary": summarize_product(p), "store": self.stores.get(p.get("storeSlug"))}

    def with_descendants(self, slug):
        """Category slug → itself + all descendant slugs."""
        result = [slug]

        def walk(parent_slug):
            parent = self.cat_by_slug.get(parent_slug)
            if not parent:
                return
            for child in self.categories:
                if child.get("parentId") == parent.get("id") and child.get("slug") not in result:
                    result.append(child.get("slug"))
                    walk(child.get("slug"))
        walk(slug)
        return result

    def trail(self, slug):
        trail, current, seen = [], self.cat_by_slug.get(slug), set()
        while current and current.get("id") not in seen:
            seen.add(current.get("id"))
            trail.insert(0, current)
            current = self.cat_by_id.get(current.get("parentId")) if current.get("parentId") is not None else None
        return trail


def default_variant(product):
    variants = product.get("variants") or []
    return (next((v for v in variants if v.get("isDefault") and v.get("stock", 0) > 0), None)
            or next((v for v in variants if v.get("stock", 0) > 0), None) or (variants[0] if variants else {}))


def discount_percent(price, mrp):
    if not price or not mrp or mrp <= price:
        return 0
    from apps.orders.pricing import js_round
    return js_round(((mrp - price) / mrp) * 100)


def summarize_product(product):
    prices = [v.get("price", 0) for v in product.get("variants") or []] or [0]
    display = default_variant(product)
    return {
        "discount": discount_percent(display.get("price"), display.get("mrp")), "hasRange": min(prices) != max(prices), "minPrice": min(prices),
        "mrp": display.get("mrp"), "price": display.get("price"), "totalStock": sum(v.get("stock", 0) for v in product.get("variants") or []),
    }


def price_tiers_of(p):
    return p.get("priceTiers") or []


def is_verified_supplier(p):
    return (p.get("store") or {}).get("kycStatus") == "verified"


def is_premium_supplier(p):
    return (p.get("store") or {}).get("plan") in ("gold", "platinum")


def is_serviceable(method, pincode):
    """Empty pincode list = all India; otherwise the pincode must start with one of the prefixes."""
    prefixes = method.get("pincodes") or []
    return not prefixes or any(str(pincode).startswith(str(x)) for x in prefixes)


# ---------- Reviews (sample reviews stored per product; hidden ones excluded) ----------
NAMES = ["Priya R.", "Rahul S.", "Ananya G.", "Vikram N.", "Fatima K.", "Arun P.", "Sneha M.", "Imran A.", "Divya T.", "Karthik V.", "Neha J.", "Rohit B."]
CITIES = ["Chennai", "Mumbai", "Bengaluru", "Delhi", "Hyderabad", "Pune", "Kochi", "Jaipur", "Kolkata", "Lucknow"]
TEXTS = [
    [5, "Excellent quality", "Exactly as described. Packaging was solid and delivery was quicker than expected."],
    [5, "Value for money", "Great price compared to other sites, and the GST invoice came with the package."],
    [4, "Good product", "Works well. Took one extra day to arrive but the seller kept me updated."],
    [4, "Happy with the purchase", "Build quality is nice. Would buy from this seller again."],
    [3, "Decent", "It is okay for the price. Expected slightly better finishing."],
    [5, "Highly recommend", "Paid via COD and the delivery person was polite. Product is genuine."],
    [2, "Not as expected", "Colour was a little different from the photos. Returning it — the return request was easy."],
]


def build_reviews(product, count=6):
    """Deterministic sample reviews (same as src/data/reviews.js) for products that have no stored reviews."""
    out = []
    pid = product.get("id") or 0
    for i in range(count):
        seed = (pid * 7 + i * 13) % 97
        rating, title, body = TEXTS[seed % len(TEXTS)]
        day = 1 + ((pid + i * 5) % 28)
        out.append({"id": f"{pid}-{i}", "author": NAMES[seed % len(NAMES)], "body": body, "city": CITIES[(seed + i) % len(CITIES)],
                    "createdAt": f"2026-10-{day:02d}T12:00:00Z", "helpful": (seed * 3) % 40, "rating": rating, "title": title, "verified": True})
    return out


def _public_review(r):
    out = {k: v for k, v in r.items() if k not in ("hidden", "productId", "reviewKey")}
    out["id"] = r.get("reviewKey") or r.get("id")
    return out


def reviews_for(product, count=6):
    rows = list(Review.objects.filter(product_id=product.get("id")).order_by("id"))
    if not rows:
        return build_reviews(product, count)
    return [_public_review(r.data) for r in rows[:count] if not r.data.get("hidden")]


# ---------- Endpoints' logic ----------
def _sort_order(c):
    return c.get("sortOrder") or 0


def categories():
    return [c for c in Catalog().categories if c.get("isActive") is not False]


def category_directory():
    cat = Catalog()
    products = cat.public_products()
    active = [c for c in cat.categories if c.get("isActive") is not False]

    def stats(slugs):
        lst = [p for p in products if p.get("categorySlug") in slugs]
        return {"productCount": len(lst), "supplierCount": len({p.get("storeSlug") for p in lst})}

    roots = []
    for root in sorted([c for c in active if not c.get("parentId")], key=_sort_order):
        children = [{**c, **stats([c.get("slug")])} for c in sorted([c for c in active if c.get("parentId") == root.get("id")], key=_sort_order)]
        child_slugs = {c.get("slug") for c in children}
        thumb = next((p.get("thumbnail") for p in products if p.get("categorySlug") in child_slugs), None)
        roots.append({**root, "children": children, **stats([root.get("slug"), *child_slugs]), "thumbnail": thumb})
    return roots


def home():
    cat = Catalog()
    allp = [p for p in (cat.with_summary(p) for p in cat.public_products()) if p["summary"]["totalStock"] > 0]
    active = [c for c in cat.categories if c.get("isActive") is not False]
    return {
        "featuredProducts": [p for p in allp if p.get("isFeatured")][:12],
        "featuredStores": [s for s in cat.stores.values() if s.get("isFeatured") and s.get("status") == "approved"],
        "newArrivals": sorted(allp, key=lambda p: p.get("createdAt") or "", reverse=True)[:12],
        "showBuyRequestBanner": (get_platform().get("homeSections") or {}).get("buyRequestBanner") is not False,
        "rootCategories": sorted([c for c in active if not c.get("parentId")], key=_sort_order),
        "topCategories": [c for c in active if c.get("parentId")],
        "trendingProducts": sorted(allp, key=lambda p: p.get("soldCount") or 0, reverse=True)[:12],
    }


def _search_score(p, terms):
    hay = {"brand": (p.get("brand") or "").lower(), "cat": p.get("categorySlug") or "", "desc": (p.get("description") or "").lower(),
           "name": (p.get("name") or "").lower(), "store": ((p.get("store") or {}).get("name") or "").lower()}
    score = 0
    for t in terms:
        if t in hay["name"]:
            score += 5
        elif t in hay["brand"] or t in hay["store"] or t in hay["cat"]:
            score += 3
        elif t in hay["desc"]:
            score += 1
        else:
            return 0
    return score


def _count_by(lst, key):
    out = {}
    for item in lst:
        k = key(item)
        out[k] = out.get(k, 0) + 1
    return out


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


SORTERS = {
    "newest": (lambda p: p.get("createdAt") or "", True),
    "popular": (lambda p: p.get("soldCount") or 0, True),
    "price_asc": (lambda p: p["summary"]["minPrice"], False),
    "price_desc": (lambda p: p["summary"]["minPrice"], True),
    "rating": (lambda p: (p.get("rating") or 0, p.get("reviewCount") or 0), True),
}


def products(params):
    """params: q, category, store, brands[], sellers[], businessTypes[], minPrice, maxPrice, minRating, inStock, verified, bulk,
    premium, attrs{name: [values]}, sort, page → {count, facets, page, pageCount, results}."""
    cat = Catalog()
    lst = [cat.with_summary(p) for p in cat.public_products()]
    terms = [t for t in (params.get("q") or "").lower().split() if t]
    if terms:
        lst = [p for p in ({**p, "score": _search_score(p, terms)} for p in lst) if p["score"] > 0]
    if params.get("category"):
        slugs = cat.with_descendants(params["category"])
        lst = [p for p in lst if p.get("categorySlug") in slugs]
    if params.get("store"):
        lst = [p for p in lst if p.get("storeSlug") == params["store"]]

    # Facets are computed before brand/seller/price filters so the panel keeps its options.
    facets = {
        "attributes": {}, "brands": _count_by(lst, lambda p: p.get("brand")), "bulk": sum(1 for p in lst if price_tiers_of(p)),
        "businessTypes": _count_by([p for p in lst if (p.get("store") or {}).get("businessType")], lambda p: p["store"]["businessType"]),
        "premium": sum(1 for p in lst if is_premium_supplier(p)), "sellers": _count_by(lst, lambda p: p.get("storeSlug")),
        "verified": sum(1 for p in lst if is_verified_supplier(p)),
    }
    for p in lst:
        for o in p.get("variantOptions") or []:
            if o.get("name") in ("Storage", "Configuration"):
                continue
            bucket = facets["attributes"].setdefault(o.get("name"), {})
            for v in o.get("values") or []:
                bucket[v] = bucket.get(v, 0) + 1

    brands, sellers, btypes = params.get("brands") or [], params.get("sellers") or [], params.get("businessTypes") or []
    if brands:
        lst = [p for p in lst if p.get("brand") in brands]
    if sellers:
        lst = [p for p in lst if p.get("storeSlug") in sellers]
    if btypes:
        lst = [p for p in lst if (p.get("store") or {}).get("businessType") in btypes]
    if params.get("verified"):
        lst = [p for p in lst if is_verified_supplier(p)]
    if params.get("bulk"):
        lst = [p for p in lst if price_tiers_of(p)]
    if params.get("premium"):
        lst = [p for p in lst if is_premium_supplier(p)]
    lo, hi, rating = _float(params.get("minPrice")), _float(params.get("maxPrice")), _float(params.get("minRating"))
    if params.get("minPrice") and lo is not None:
        lst = [p for p in lst if p["summary"]["minPrice"] >= lo]
    if params.get("maxPrice") and hi is not None:
        lst = [p for p in lst if p["summary"]["minPrice"] <= hi]
    if params.get("minRating") and rating is not None:
        lst = [p for p in lst if (p.get("rating") or 0) >= rating]
    if params.get("inStock"):
        lst = [p for p in lst if p["summary"]["totalStock"] > 0]
    for name, values in (params.get("attrs") or {}).items():
        if values:
            lst = [p for p in lst if any((v.get("attributes") or {}).get(name) in values for v in p.get("variants") or [])]

    sort = params.get("sort") or "relevance"
    if sort == "relevance":
        lst.sort(key=lambda p: (p.get("score") or 0, p.get("soldCount") or 0), reverse=True)
    else:
        key, rev = SORTERS.get(sort, SORTERS["popular"])
        lst.sort(key=key, reverse=rev)

    try:
        page = max(1, int(params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    count = len(lst)
    return {"count": count, "facets": facets, "page": page, "pageCount": max(1, -(-count // PAGE_SIZE)),
            "results": lst[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]}


def product_detail(slug):
    cat = Catalog()
    row = Product.objects.filter(slug=slug).first()
    if not row or not cat.is_public(row.data):
        return None
    product = row.data
    related = [cat.with_summary(p) for p in cat.public_products() if p.get("categorySlug") == product.get("categorySlug") and p.get("id") != product.get("id")][:12]
    return {**cat.with_summary(product), "related": related, "reviews": reviews_for(product)}


def delivery_options(slug, pincode):
    cat = Catalog()
    row = Product.objects.filter(slug=slug).first()
    if not row or not cat.is_public(row.data):
        return None
    store = cat.stores.get(row.data.get("storeSlug")) or {}
    return [m for m in store.get("shippingMethods") or [] if is_serviceable(m, pincode or "")]


def store_with_products(slug):
    cat = Catalog()
    store = cat.stores.get(slug)
    if not store or store.get("status") != "approved":
        return None
    prods = [cat.with_summary(p) for p in cat.public_products() if p.get("storeSlug") == slug]
    verified = list(dict.fromkeys(d.data.get("type") for d in KycDocument.objects.filter(store_slug=slug, status="verified")))
    reviews = []
    for p in sorted(prods, key=lambda p: p.get("reviewCount") or 0, reverse=True)[:4]:
        reviews += [{**rv, "productName": p.get("name"), "productSlug": p.get("slug")} for rv in reviews_for(p, 2)]
    return {"products": prods, "reviews": reviews, "store": store, "verifiedDocuments": verified}
