from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="storefront-health"),
    path("products/", views.list_products, name="storefront-products"),
    path("products/<str:slug>/", views.product_detail, name="storefront-product-detail"),
    path("categories/", views.list_categories, name="storefront-categories"),
    path("outlets/", views.list_outlets, name="storefront-outlets"),
]
