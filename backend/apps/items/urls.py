from django.urls import path
from .views import ItemListView, ItemDetailView, PendingItemListView, assign_barcode, accept_change, reject_change, catalog_list, item_price_history

urlpatterns = [
    path("", ItemListView.as_view(), name="item-list"),
    path("catalog/", catalog_list, name="item-catalog"),
    path("<int:pk>/", ItemDetailView.as_view(), name="item-detail"),
    path("<int:item_id>/price-history/", item_price_history, name="item-price-history"),
    path("pending/", PendingItemListView.as_view(), name="pending-item-list"),
    path("pending/<int:pending_id>/assign-barcode/", assign_barcode, name="assign-barcode"),
    path("pending/<int:pending_id>/accept-change/", accept_change, name="accept-change"),
    path("pending/<int:pending_id>/reject-change/", reject_change, name="reject-change"),
]
