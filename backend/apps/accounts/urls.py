from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.login),
    path("refresh/", views.refresh),
    path("logout/", views.logout),
    path("me/", views.me),
    path("register/", views.register),
    path("register/seller/", views.register_seller),
    path("password-reset/", views.password_reset),
    path("password-reset/confirm/", views.password_reset_confirm),
]
