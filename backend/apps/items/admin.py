from django.contrib import admin
from .models import Item, PendingItem


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ["item_code", "item_name", "barcode", "category", "status", "barcode_assigned_at"]
    list_filter = ["status", "category"]
    search_fields = ["item_code", "item_name", "barcode"]


@admin.register(PendingItem)
class PendingItemAdmin(admin.ModelAdmin):
    list_display = ["item_code", "item_name", "first_seen_outlet", "first_seen_date", "status"]
    list_filter = ["status"]
    search_fields = ["item_code", "item_name"]
