from django.urls import include, path

from apps.core import views as core

urlpatterns = [
    path("api/v1/health/", core.health),
    path("api/v1/bootstrap/", core.bootstrap),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.catalog.urls")),
    path("api/v1/", include("apps.orders.urls")),
    path("api/v1/", include("apps.marketing.urls")),
    path("api/v1/", include("apps.market.urls")),
    path("api/v1/seller/", include("apps.sellerhub.urls")),
    path("api/v1/admin-api/", include("apps.adminpanel.urls")),
]
