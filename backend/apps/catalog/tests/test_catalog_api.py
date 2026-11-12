from apps.catalog.models import Product, Review, Store


def test_categories_and_directory(demo, anon):
    cats = anon.get("/api/v1/categories/").json()
    assert cats and all(c.get("isActive") is not False for c in cats)
    roots = anon.get("/api/v1/categories/", {"directory": 1}).json()
    assert all(not r.get("parentId") for r in roots)
    assert {"children", "productCount", "supplierCount", "thumbnail"} <= set(roots[0])


def test_home(demo, anon):
    home = anon.get("/api/v1/home/").json()
    assert set(home) == {"featuredProducts", "featuredStores", "newArrivals", "showBuyRequestBanner", "rootCategories", "topCategories", "trendingProducts"}
    trending = home["trendingProducts"]
    assert len(trending) == 12 and trending[0]["soldCount"] >= trending[-1]["soldCount"] and "summary" in trending[0] and "store" in trending[0]


def test_product_filters_facets_sort_and_pagination(demo, anon):
    allp = anon.get("/api/v1/products/").json()
    assert allp["count"] > 24 and len(allp["results"]) == 24 and allp["pageCount"] == -(-allp["count"] // 24)
    page2 = anon.get("/api/v1/products/", {"page": 2}).json()
    assert page2["page"] == 2 and page2["results"][0]["id"] not in {p["id"] for p in allp["results"]}

    elec = anon.get("/api/v1/products/", {"category": "electronics", "sort": "price_asc"}).json()
    prices = [p["summary"]["minPrice"] for p in elec["results"]]
    assert prices == sorted(prices) and elec["facets"]["brands"].get("Apple")
    apple = anon.get("/api/v1/products/", {"category": "electronics", "brand": "Apple"}).json()
    assert apple["count"] == elec["facets"]["brands"]["Apple"] and all(p["brand"] == "Apple" for p in apple["results"])
    assert apple["facets"] == elec["facets"]  # facets computed before brand filter

    q = anon.get("/api/v1/products/", {"q": "iphone"}).json()
    assert q["count"] and all("iphone" in (p["name"] + p["description"]).lower() or "iphone" in p["brand"].lower() for p in q["results"])
    bulk = anon.get("/api/v1/products/", {"bulk": 1}).json()
    assert bulk["count"] and all(p.get("priceTiers") for p in bulk["results"])
    verified = anon.get("/api/v1/products/", {"verified": 1}).json()
    assert all(p["store"]["kycStatus"] == "verified" for p in verified["results"])
    premium = anon.get("/api/v1/products/", {"premium": 1}).json()
    assert all(p["store"]["plan"] in ("gold", "platinum") for p in premium["results"])
    cheap = anon.get("/api/v1/products/", {"max_price": 500, "min_rating": 4, "in_stock": 1}).json()
    assert all(p["summary"]["minPrice"] <= 500 and p["rating"] >= 4 and p["summary"]["totalStock"] > 0 for p in cheap["results"])
    colour = next(iter(elec["facets"]["attributes"]["Colour"]))
    attr = anon.get("/api/v1/products/", {"category": "electronics", f"attr.Colour": colour}).json()
    assert attr["count"] and all(any(v["attributes"].get("Colour") == colour for v in p["variants"]) for p in attr["results"])
    btype = next(iter(elec["facets"]["businessTypes"]))
    assert all(p["store"]["businessType"] == btype for p in anon.get("/api/v1/products/", {"btype": btype}).json()["results"])


def test_hidden_products_and_stores_are_not_public(demo, anon):
    p = Product.objects.get(slug="essence-mascara-lash-princess-1")
    assert anon.get(f"/api/v1/products/{p.slug}/").status_code == 200
    p.data["status"] = "inactive"
    p.save()
    assert anon.get(f"/api/v1/products/{p.slug}/").status_code == 404
    assert p.slug not in {x["slug"] for x in anon.get("/api/v1/products/", {"store": "glowup"}).json()["results"]}
    s = Store.objects.get(slug="glowup")
    s.data["status"] = "suspended"
    s.save()
    assert anon.get("/api/v1/stores/glowup/").status_code == 404
    assert anon.get("/api/v1/products/", {"store": "glowup"}).json()["count"] == 0


def test_product_detail_reviews_related_delivery(demo, anon):
    r = Review.objects.filter(product_id=1).order_by("id").first()
    r.data["hidden"] = True
    r.save()
    data = anon.get("/api/v1/products/essence-mascara-lash-princess-1/").json()
    assert len(data["reviews"]) == 5 and r.data["reviewKey"] not in {x["id"] for x in data["reviews"]}
    assert all(x["categorySlug"] == data["categorySlug"] and x["id"] != data["id"] for x in data["related"])
    methods = anon.get("/api/v1/products/essence-mascara-lash-princess-1/delivery/", {"pincode": "600040"}).json()
    assert methods and all("fee" in m for m in methods)


def test_store_page(demo, anon):
    data = anon.get("/api/v1/stores/technest/").json()
    assert data["store"]["slug"] == "technest" and data["products"]
    assert "gst_certificate" in data["verifiedDocuments"]
    assert len(data["reviews"]) <= 8 and all("productSlug" in r for r in data["reviews"])
