from django.urls import path
from .views import OutletListCreateView, OutletDetailView
from apps.items.views import outlet_barcode_master

urlpatterns = [
    path("", OutletListCreateView.as_view(), name="outlet-list"),
    path("<int:pk>/", OutletDetailView.as_view(), name="outlet-detail"),
    path("<int:outlet_id>/barcodes/", outlet_barcode_master, name="outlet-barcode-master"),
]
