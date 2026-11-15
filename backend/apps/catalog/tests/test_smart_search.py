"""Smart search: typos, sound-alikes, local words, intent words, related fallback — and the word list matches the frontend's."""
import json
from pathlib import Path

import pytest
from django.conf import settings

from apps.catalog.smart_search import WORDS, edit_distance, phonetic, stem
from apps.core.services import get_platform, save_platform

pytestmark = pytest.mark.django_db


def names(res):
    return [p["name"] for p in res.json()["results"]]


def search(anon, q, **extra):
    return anon.get("/api/v1/products/", {"q": q, **extra})


def test_word_list_is_identical_to_the_frontend_copy():
    front = Path(settings.BASE_DIR).parent / "frontend" / "src" / "data" / "searchWords.json"
    assert json.loads(front.read_text(encoding="utf-8")) == WORDS


def test_building_blocks():
    assert phonetic("sampoo") == phonetic("shampoo") and phonetic("zerox") == phonetic("xerox") and phonetic("kofee") == phonetic("coffee")
    assert edit_distance("iphnoe", "iphone") == 1  # swapped neighbours count once
    assert [stem(w) for w in ("watches", "glasses", "batteries", "shoes", "fragrances")] == ["watch", "glass", "battery", "shoe", "fragrance"]


@pytest.mark.parametrize("query, expect", [("iphnoe", "iPhone"), ("laptp", "Laptop"), ("kofee", "Coffee"), ("zerox", "Xerox"), ("chappal", "Slipper"),
                                           ("kadigaram", "Watch"), ("arisi", "Rice"), ("perfum", "Calvin Klein"), ("mobil cover", "Case")])
def test_misspelt_and_local_words_find_products(demo, anon, query, expect):
    res = search(anon, query)
    assert res.status_code == 200
    assert any(expect.lower() in n.lower() for n in names(res)[:8]), (query, names(res)[:8])


def test_did_you_mean_and_intent_words(demo, anon):
    body = search(anon, "iphnoe").json()
    assert body["search"]["corrected"] == "iphone" and body["search"]["mode"] == "match"
    cheap = search(anon, "cheap phone").json()
    prices = [p["summary"]["minPrice"] for p in cheap["results"]]
    assert cheap["search"]["sortHint"] == "price_asc" and prices == sorted(prices)
    # an explicit sort chosen by the shopper wins over the intent word
    chosen = [p["summary"]["minPrice"] for p in search(anon, "cheap phone", sort="price_desc").json()["results"]]
    assert chosen == sorted(chosen, reverse=True) and chosen[0] > prices[0]


def test_nonsense_shows_related_products_not_an_empty_page(demo, anon):
    body = search(anon, "xyzzqq").json()
    assert body["count"] > 0 and body["search"]["mode"] == "related"
    tanglish = search(anon, "seri recent ah ennala add panirukangalo adhella kaatu").json()
    dates = [p["createdAt"] for p in tanglish["results"]]
    assert tanglish["search"]["sortHint"] == "newest" and dates == sorted(dates, reverse=True)


def test_admin_custom_words(demo, anon, as_user):
    assert not names(search(anon, "kuzhal"))[:1] or search(anon, "kuzhal").json()["search"]["mode"] == "related"
    res = as_user("admin@kartiva.demo").patch("/api/v1/admin-api/settings/", {"searchWords": "kuzhal = sunglasses"}, format="json")
    assert res.status_code == 200 and get_platform()["searchWords"] == "kuzhal = sunglasses"
    assert any("sun" in n.lower() for n in names(search(anon, "kuzhal"))[:5])
    save_platform({**get_platform(), "searchWords": ""})
