from django.urls import path

from . import views, views_activity

urlpatterns = [
    path("checkout/", views.checkout),
    path("orders/", views.my_orders),
    path("orders/sub-orders/<str:sub_number>/cancel/", views.cancel_sub_order),
    path("orders/<str:number>/", views.order_detail),
    path("orders/<str:number>/refunds/", views.order_refunds),
    path("returns/", views.returns),
    path("returns/<int:pk>/escalate/", views.escalate_return),
    path("activity/seen/", views_activity.seen),
    path("activity/nav-counts/", views_activity.nav_counts),
]
