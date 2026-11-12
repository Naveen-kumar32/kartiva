from django.urls import path

from . import views as v
from . import views_comms as c

urlpatterns = [
    # enquiries + quote requests (RFQs)
    path("enquiries/", v.enquiries),
    path("enquiries/mine/", v.my_enquiries),
    path("enquiries/<int:pk>/thread/", v.enquiry_thread),
    path("rfqs/", v.rfqs),
    path("rfqs/categories/", v.rfq_categories),
    path("rfqs/mine/", v.my_rfqs),
    path("rfqs/recent/", v.recent_rfqs),
    path("rfqs/<int:pk>/close/", v.close_rfq),
    path("rfqs/<int:pk>/quotes/<int:quote_id>/accept/", v.accept_quote),
    path("rfqs/<int:pk>/thread/", v.rfq_thread),
    # wishlist
    path("wishlist/", v.wishlist),
    path("wishlist/ids/", v.wishlist_ids_view),
    path("wishlist/toggle/", v.wishlist_toggle),
    # profile
    path("me/", v.me),
    path("me/addresses/", v.addresses),
    path("me/addresses/<int:addr_id>/", v.address_detail),
    path("me/addresses/<int:addr_id>/default/", v.address_default),
    path("me/delete-request/", v.delete_request),
    path("me/export/", v.export_my_data),
    path("me/notification-prefs/", v.notification_prefs),
    path("me/password/", v.change_password),
    # support
    path("support/tickets/", v.tickets),
    path("support/tickets/<int:pk>/reply/", v.ticket_reply),
    path("support/tickets/<int:pk>/resolve/", v.ticket_resolve),
    # CMS, announcement, plans
    path("announcement/", v.announcement),
    path("pages/", v.cms_pages),
    path("pages/<slug:slug>/", v.cms_page),
    path("plans/", v.plans),
    # messages + notifications
    path("messages/", c.threads),
    path("messages/unread-count/", c.unread_count),
    path("messages/<int:pk>/", c.thread_send),
    path("messages/<int:pk>/read/", c.thread_read),
    path("notifications/", c.notifications),
    path("notifications/read/", c.notifications_read),
    # mail outbox
    path("emails/", c.emails),
    path("emails/attachments/", c.attachment_source),
    path("sms/", c.sms),
]
