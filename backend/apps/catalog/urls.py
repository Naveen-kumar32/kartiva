from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.categories),
    path("home/", views.home),
    path("products/", views.products),
    path("products/<slug:slug>/", views.product_detail),
    path("products/<slug:slug>/delivery/", views.product_delivery),
    path("products/<slug:slug>/my-review/", views.my_review),
    path("reviews/mine/", views.my_reviews),
    path("stores/<slug:slug>/", views.store_detail),
]
