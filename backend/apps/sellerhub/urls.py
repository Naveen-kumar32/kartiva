from django.urls import path

from . import views as v
from . import views_growth as g

urlpatterns = [
    # sellerApi.js
    path("dashboard/", v.dashboard),
    path("products/", v.products),
    path("products/<int:pk>/", v.product_detail),
    path("products/<int:pk>/activate/", v.product_activate),
    path("products/<int:pk>/deactivate/", v.product_deactivate),
    path("variants/<int:variant_id>/stock/", v.variant_stock),
    path("stock-movements/", v.stock_movements),
    path("orders/", v.seller_orders),
    path("orders/<str:number>/status/", v.order_status),
    path("returns/", v.seller_returns),
    path("returns/<int:pk>/<str:action>/", v.return_action),
    path("shipping-methods/", v.shipping_methods),
    path("shipping-methods/<int:pk>/", v.shipping_method_detail),
    path("store/", v.seller_store),
    path("earnings/", v.earnings),
    path("ads/", v.seller_ads),
    path("reviews/", v.seller_reviews),
    # sellerGrowthApi.js
    path("growth-summary/", g.growth_summary),
    path("leads/", g.leads),
    path("leads/<int:pk>/status/", g.lead_status),
    path("leads/<int:pk>/notes/", g.lead_note),
    path("leads/<int:pk>/reply/", g.lead_reply),
    path("rfqs/", g.rfqs),
    path("rfqs/<int:pk>/viewed/", g.rfq_viewed),
    path("rfqs/<int:pk>/quote/", g.rfq_quote),
    path("customers/", g.customers),
    path("customers/notes/", g.customer_notes),
    path("analytics/", g.analytics),
    path("business/", g.business),
    path("business/kyc/", g.kyc_upload),
    path("plan/", g.plan),
    path("plan/change/", g.plan_change),
    path("team/", g.team),
    path("team/<int:pk>/", g.team_member),
    path("bulk/", g.bulk),
    path("bulk/price-stock/", g.bulk_price_stock),
    path("bulk/products/", g.bulk_create),
    path("tickets/", g.tickets),
    path("tickets/<int:pk>/reply/", g.ticket_reply),
    path("tickets/<int:pk>/resolve/", g.ticket_resolve),
]
