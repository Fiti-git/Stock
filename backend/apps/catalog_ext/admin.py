"""
Minimal Django admin so a manager can attach images and descriptions to
existing Items right away — useful for testing Phase 1 without waiting
for the full ecom-admin UI in Phase 4.
"""
from django.contrib import admin

from .models import ProductDescription, ProductImage, PriceList, PriceListItem


@admin.register(ProductDescription)
class ProductDescriptionAdmin(admin.ModelAdmin):
    list_display = ("item", "slug", "is_published", "updated_at")
    list_filter = ("is_published",)
    search_fields = ("slug", "item__item_code", "item__item_name")
    autocomplete_fields = ("item",)


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("item", "sort_order", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("item__item_code", "item__item_name", "alt_text")
    autocomplete_fields = ("item",)
    list_editable = ("sort_order", "is_active")


class PriceListItemInline(admin.TabularInline):
    model = PriceListItem
    extra = 0
    autocomplete_fields = ("item",)
    fields = ("item", "unit_price", "compare_at_price", "is_active")


@admin.register(PriceList)
class PriceListAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "currency", "priority", "is_active", "starts_at", "ends_at")
    list_filter = ("is_active", "currency")
    search_fields = ("code", "name")
    inlines = [PriceListItemInline]
