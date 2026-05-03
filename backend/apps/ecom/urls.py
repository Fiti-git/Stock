from django.urls import path

from . import admin_views, views

urlpatterns = [
    path("health/", views.health, name="ecom-health"),

    # Carts
    path("cart/", views.create_cart, name="ecom-create-cart"),
    path("cart/<str:session_token>/", views.get_cart, name="ecom-get-cart"),
    path("cart/<str:session_token>/items/", views.add_cart_item, name="ecom-add-item"),
    path("cart/<str:session_token>/items/<int:item_id>/", views.update_cart_item, name="ecom-update-item"),
    path("cart/<str:session_token>/items/<int:item_id>/remove/", views.remove_cart_item, name="ecom-remove-item"),
    path("cart/<str:session_token>/checkout/", views.checkout, name="ecom-checkout"),

    # Orders (public + admin-mutation)
    path("orders/<str:number>/", views.order_detail, name="ecom-order-detail"),
    path("orders/<str:number>/confirm-payment/", views.confirm_payment, name="ecom-confirm-payment"),
    path("orders/<str:number>/cancel/", views.cancel, name="ecom-cancel"),

    # PayHere (Phase 5)
    path("orders/<str:number>/payhere/initiate/", views.payhere_initiate, name="ecom-payhere-initiate"),
    path("payhere/notify/", views.payhere_notify, name="ecom-payhere-notify"),

    # Admin (Phase 4) — used by the existing admin frontend
    path("admin/orders/", admin_views.admin_list_orders, name="ecom-admin-orders"),
    path("admin/products/", admin_views.admin_list_products, name="ecom-admin-products"),
    path("admin/products/<int:item_id>/", admin_views.admin_product_detail, name="ecom-admin-product-detail"),
    path("admin/products/<int:item_id>/description/", admin_views.admin_upsert_description, name="ecom-admin-product-desc"),
    path("admin/products/<int:item_id>/images/", admin_views.admin_upload_image, name="ecom-admin-product-image-upload"),
    path("admin/products/<int:item_id>/images/<int:image_id>/", admin_views.admin_delete_image, name="ecom-admin-product-image-delete"),
    path("admin/price-lists/", admin_views.admin_price_lists, name="ecom-admin-price-lists"),
    path("admin/price-lists/<int:pk>/", admin_views.admin_price_list_detail, name="ecom-admin-price-list-detail"),
    path("admin/price-lists/<int:pk>/items/", admin_views.admin_set_price, name="ecom-admin-price-set"),
    path("admin/price-lists/<int:pk>/items/<int:item_id>/", admin_views.admin_delete_price, name="ecom-admin-price-delete"),
]
