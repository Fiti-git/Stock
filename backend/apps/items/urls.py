from django.urls import path
from .views import ItemListView, ItemDetailView, PendingItemListView, assign_barcode, accept_change, reject_change, catalog_list, item_price_history, update_item, item_lookup, negative_pos_report, item_barcodes, item_barcode_detail, item_history, mark_pending_nbci
from .views_categories import (
    category_list_create, category_detail, category_assign_items, category_options,
)

urlpatterns = [
    path("", ItemListView.as_view(), name="item-list"),
    path("lookup/", item_lookup, name="item-lookup"),
    path("catalog/", catalog_list, name="item-catalog"),
    path("categories/", category_list_create, name="category-list-create"),
    path("categories/options/", category_options, name="category-options"),
    path("categories/<int:pk>/", category_detail, name="category-detail"),
    path("categories/<int:pk>/assign-items/", category_assign_items, name="category-assign-items"),
    path("<int:pk>/", ItemDetailView.as_view(), name="item-detail"),
    path("<int:item_id>/price-history/", item_price_history, name="item-price-history"),
    path("<int:item_id>/history/", item_history, name="item-history"),
    path("pending/", PendingItemListView.as_view(), name="pending-item-list"),
    path("pending/<int:pending_id>/assign-barcode/", assign_barcode, name="assign-barcode"),
    path("pending/<int:pending_id>/accept-change/", accept_change, name="accept-change"),
    path("pending/<int:pending_id>/reject-change/", reject_change, name="reject-change"),
    path("pending/<int:pending_id>/mark-nbci/", mark_pending_nbci, name="mark-pending-nbci"),
    path("<int:item_id>/update/", update_item, name="item-update"),
    path("<int:item_id>/barcodes/", item_barcodes, name="item-barcodes"),
    path("<int:item_id>/barcodes/<int:barcode_id>/", item_barcode_detail, name="item-barcode-detail"),
    path("negative-pos/", negative_pos_report, name="negative-pos-report"),
]
