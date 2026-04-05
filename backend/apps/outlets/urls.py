from django.urls import path
from .views import OutletListCreateView, OutletDetailView

urlpatterns = [
    path("", OutletListCreateView.as_view(), name="outlet-list"),
    path("<int:pk>/", OutletDetailView.as_view(), name="outlet-detail"),
]
