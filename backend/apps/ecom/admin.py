"""
Minimal admin so an operator can poke at carts, orders, and addresses
during testing — and manually confirm payment until a gateway is wired.
"""
from django.contrib import admin

from .models import EcomAddress, EcomCart, EcomCartItem, EcomOrder, EcomOrderLine


@admin.register(EcomAddress)
class EcomAddressAdmin(admin.ModelAdmin):
    """
    Note: pos.Customer / items.Item don't register search_fields-enabled
    admins, so autocomplete_fields can't target them. Use raw_id_fields
    instead — same UX (search popup), no dependency on a sibling admin.
    """
    list_display = ("recipient_name", "customer", "city", "country", "is_default", "updated_at")
    list_filter = ("country", "is_default")
    search_fields = ("recipient_name", "phone", "line1", "city", "customer__name", "customer__phone")
    raw_id_fields = ("customer",)


class EcomCartItemInline(admin.TabularInline):
    model = EcomCartItem
    extra = 0
    fields = ("item", "qty", "unit_price_snapshot", "reservation")
    raw_id_fields = ("item",)
    readonly_fields = ("reservation",)


@admin.register(EcomCart)
class EcomCartAdmin(admin.ModelAdmin):
    list_display = ("session_token", "outlet", "customer", "status", "created_at", "last_activity_at")
    list_filter = ("status", "outlet")
    search_fields = ("session_token", "customer__name", "customer__phone")
    inlines = [EcomCartItemInline]


class EcomOrderLineInline(admin.TabularInline):
    model = EcomOrderLine
    extra = 0
    fields = ("item_code_snapshot", "item_name_snapshot", "qty",
              "unit_price", "line_subtotal", "tax_amount", "line_total",
              "is_committed", "committed_at")
    readonly_fields = fields


@admin.register(EcomOrder)
class EcomOrderAdmin(admin.ModelAdmin):
    list_display = ("number", "outlet", "customer", "status",
                    "grand_total", "currency", "created_at", "paid_at")
    list_filter = ("status", "outlet", "currency")
    search_fields = ("number", "customer__name", "customer__phone",
                     "guest_email", "guest_phone", "payment_intent_ref")
    readonly_fields = ("number", "subtotal", "tax_total", "shipping_total",
                       "discount_total", "grand_total",
                       "created_at", "updated_at", "paid_at",
                       "fulfilled_at", "shipped_at", "delivered_at", "cancelled_at",
                       "shipping_address", "billing_address")
    inlines = [EcomOrderLineInline]
