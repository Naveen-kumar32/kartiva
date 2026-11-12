from apps.marketing.models import Ad, AdSlot


def test_slot_ads_priority_and_max_items(demo, anon):
    data = anon.get("/api/v1/ads/", {"slot": "home_hero_carousel"}).json()
    assert data["slot"]["key"] == "home_hero_carousel"
    assert len(data["items"]) <= data["slot"]["maxItems"]
    prios = [a.get("priority") or 0 for a in data["items"]]
    assert prios == sorted(prios, reverse=True)
    assert all(a["product"] is None or {"store", "summary"} <= set(a["product"]) for a in data["items"])


def test_contextual_filtering(demo, anon):
    elec = anon.get("/api/v1/ads/", {"slot": "listing_sponsored", "category": "electronics"}).json()["items"]
    fashion = anon.get("/api/v1/ads/", {"slot": "listing_sponsored", "category": "fashion"}).json()["items"]
    from apps.catalog.services import Catalog
    cat = Catalog()
    assert elec and all(a["product"]["categorySlug"] in cat.with_descendants("electronics") for a in elec)
    assert all(a["product"]["categorySlug"] in cat.with_descendants("fashion") for a in fashion)
    assert not {a["id"] for a in elec} & {a["id"] for a in fashion}  # phones don't show on a fashion page
    first = elec[0]["product"]["id"]
    excl = anon.get("/api/v1/ads/", {"slot": "listing_sponsored", "category": "electronics", "exclude": first}).json()["items"]
    assert first not in {a["product"]["id"] for a in excl}
    assert anon.get("/api/v1/ads/", {"slot": "listing_sponsored", "q": "zzzz qqqq"}).json()["items"] == []


def test_inactive_slot_and_expired_ads(demo, anon):
    slot = AdSlot.objects.get(key="home_mid_banner")
    slot.data["isActive"] = False
    slot.save()
    assert anon.get("/api/v1/ads/", {"slot": "home_mid_banner"}).json()["items"] == []
    for ad in Ad.objects.filter(slot="home_strip_top"):
        ad.data["endsAt"] = "2020-01-01"
        ad.save()
    assert anon.get("/api/v1/ads/", {"slot": "home_strip_top"}).json()["items"] == []


def test_impressions(demo, anon):
    ad = Ad.objects.get(pk=1)
    before = ad.data["impressions"]
    res = anon.post("/api/v1/ads/impressions/", '{"ids": [1, 1, "x"], "page": "home"}', content_type="text/plain")
    assert res.status_code == 204
    ad.refresh_from_db()
    assert ad.data["impressions"] == before + 1
