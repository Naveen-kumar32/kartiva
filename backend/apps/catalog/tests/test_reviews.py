"""Customer ratings & reviews: only delivered buyers can rate, one review per product (edits update it), the product's
average + star breakdown follow, private details never leak, sellers only see their own store's reviews, admins can hide."""
import pytest

from apps.catalog.models import Product, Review
from apps.catalog.reviews import estimate_counts

pytestmark = pytest.mark.django_db

DELIVERED = 135  # buyer@kartiva.demo has a delivered gadget-galaxy order with this product
NOT_DELIVERED = 130  # buyer@kartiva.demo's technest order for this one is only confirmed


def slug(pid):
    return Product.objects.get(pk=pid).slug


def url(pid):
    return f"/api/v1/products/{slug(pid)}/my-review/"


def test_estimate_counts_sum_to_the_rating_count():
    for rating, n in ((4.3, 1155), (3.1, 7), (5, 1), (0, 0)):
        assert sum(estimate_counts(rating, n).values()) == n


def test_any_buyer_can_rate_only_delivered_ones_are_verified(demo, anon, as_user):
    assert anon.post(url(DELIVERED), {"rating": 5}, format="json").status_code == 401
    assert as_user("gadgets@kartiva.demo").post(url(DELIVERED), {"rating": 5}, format="json").status_code == 403  # sellers can't rate
    buyer = as_user("buyer@kartiva.demo")
    assert buyer.get(url(DELIVERED)).json() == {"canReview": True, "review": None}
    assert buyer.get(url(NOT_DELIVERED)).json()["canReview"] is True  # like Amazon: no purchase needed
    assert buyer.post(url(DELIVERED), {"rating": 7}, format="json").status_code == 400
    assert buyer.post(url(DELIVERED), {"rating": "x"}, format="json").status_code == 400

    stranger = as_user("rahul@kartiva.demo")  # never bought it
    res = stranger.post(url(DELIVERED), {"rating": 3, "title": "Saw it in a shop"}, format="json")
    assert res.status_code == 201 and res.json()["verified"] is False
    assert buyer.post(url(DELIVERED), {"rating": 5}, format="json").json()["verified"] is True
    shown = {r["title"]: r["verified"] for r in anon.get(f"/api/v1/products/{slug(DELIVERED)}/").json()["reviews"][:2]}
    assert shown.get("Saw it in a shop") is False


def test_buyers_only_setting(demo, as_user):
    admin = as_user("admin@kartiva.demo")
    assert admin.patch("/api/v1/admin-api/settings/", {"reviewsBuyersOnly": True}, format="json").status_code == 200
    buyer = as_user("buyer@kartiva.demo")
    assert buyer.get(url(NOT_DELIVERED)).json()["canReview"] is False
    assert buyer.post(url(NOT_DELIVERED), {"rating": 5}, format="json").status_code == 403
    assert as_user("rahul@kartiva.demo").post(url(DELIVERED), {"rating": 5}, format="json").status_code == 403
    assert buyer.post(url(DELIVERED), {"rating": 5}, format="json").status_code == 201  # delivered buyers still can
    admin.patch("/api/v1/admin-api/settings/", {"reviewsBuyersOnly": False}, format="json")
    assert buyer.get(url(NOT_DELIVERED)).json()["canReview"] is True


def test_review_updates_product_and_edit_replaces_it(demo, anon, as_user):
    before = anon.get(f"/api/v1/products/{slug(DELIVERED)}/").json()
    buyer = as_user("buyer@kartiva.demo")
    res = buyer.post(url(DELIVERED), {"body": "Works great, fast delivery.", "rating": 5, "title": "Love it"}, format="json")
    assert res.status_code == 201 and res.json()["rating"] == 5

    after = anon.get(f"/api/v1/products/{slug(DELIVERED)}/").json()
    assert after["reviewCount"] == before["reviewCount"] + 1
    assert after["ratingCounts"]["5"] == before["ratingCounts"]["5"] + 1
    top = after["reviews"][0]
    assert top["title"] == "Love it" and top["verified"] is True and top["author"] == "Priya R." and top["city"] == "Chennai"
    assert not {"userEmail", "orderNumber", "hidden", "source"} & set(top)  # private fields never public

    buyer.post(url(DELIVERED), {"body": "Stopped working after a week.", "rating": 1, "title": "Changed my mind"}, format="json")
    edited = anon.get(f"/api/v1/products/{slug(DELIVERED)}/").json()
    assert edited["reviewCount"] == after["reviewCount"] and edited["ratingCounts"]["5"] == before["ratingCounts"]["5"]
    assert edited["ratingCounts"]["1"] == before["ratingCounts"]["1"] + 1 and edited["rating"] <= after["rating"]
    assert Review.objects.filter(data__userEmail="buyer@kartiva.demo").count() == 1
    assert buyer.get(url(DELIVERED)).json()["review"]["title"] == "Changed my mind"
    assert [r["productId"] for r in buyer.get("/api/v1/reviews/mine/").json()["results"]] == [DELIVERED]


def test_new_product_first_review_has_no_sample_reviews(demo, anon, as_user):
    from apps.orders.models import Order
    order = Order.objects.filter(buyer_email="buyer@kartiva.demo").first()
    lakshmi = Product.objects.filter(store_slug="lakshmi-graphics").first()
    sub = order.data["subOrders"][0]
    sub.update(status="delivered", items=[{**sub["items"][0], "productId": lakshmi.pk}])
    order.save()
    assert anon.get(f"/api/v1/products/{lakshmi.slug}/").json()["reviews"] == []
    as_user("buyer@kartiva.demo").post(f"/api/v1/products/{lakshmi.slug}/my-review/", {"rating": 4, "title": "Neat print"}, format="json")
    page = anon.get(f"/api/v1/products/{lakshmi.slug}/").json()
    assert page["reviewCount"] == 1 and page["rating"] == 4 and [r["title"] for r in page["reviews"]] == ["Neat print"]


def test_seller_and_admin_see_it_and_admin_can_hide(demo, anon, as_user):
    as_user("buyer@kartiva.demo").post(url(DELIVERED), {"rating": 4, "title": "Solid"}, format="json")
    mine = as_user("gadgets@kartiva.demo").get("/api/v1/seller/reviews/").json()["results"]
    assert mine[0]["title"] == "Solid" and "userEmail" not in mine[0]
    assert all(r.get("title") != "Solid" or r["productSlug"] != slug(DELIVERED) for r in as_user("seller@kartiva.demo").get("/api/v1/seller/reviews/").json()["results"])

    admin = as_user("admin@kartiva.demo")
    listed = admin.get("/api/v1/admin-api/reviews/").json()
    listed = listed.get("results", listed) if isinstance(listed, dict) else listed
    rid = next(r["id"] for r in listed if r.get("title") == "Solid")
    assert admin.patch(f"/api/v1/admin-api/reviews/{rid}/", {"hidden": True}, format="json").status_code == 200
    assert all(r["title"] != "Solid" for r in anon.get(f"/api/v1/products/{slug(DELIVERED)}/").json()["reviews"])
