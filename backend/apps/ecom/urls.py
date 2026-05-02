from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="ecom-health"),

    # Carts
    path("cart/", views.create_cart, name="ecom-create-cart"),
    path("cart/<str:session_token>/", views.get_cart, name="ecom-get-cart"),
    path("cart/<str:session_token>/items/", views.add_cart_item, name="ecom-add-item"),
    path("cart/<str:session_token>/items/<int:item_id>/", views.update_cart_item, name="ecom-update-item"),
    path("cart/<str:session_token>/items/<int:item_id>/remove/", views.remove_cart_item, name="ecom-remove-item"),
    path("cart/<str:session_token>/checkout/", views.checkout, name="ecom-checkout"),

    # Orders
    path("orders/<str:number>/", views.order_detail, name="ecom-order-detail"),
    path("orders/<str:number>/confirm-payment/", views.confirm_payment, name="ecom-confirm-payment"),
    path("orders/<str:number>/cancel/", views.cancel, name="ecom-cancel"),
]
