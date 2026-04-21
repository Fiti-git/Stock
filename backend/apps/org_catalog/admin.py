from django.contrib import admin

from .models import MasterProduct, ItemMasterLink, DemandSnapshot, PurchasePlan, PurchasePlanLine


@admin.register(MasterProduct)
class MasterProductAdmin(admin.ModelAdmin):
    list_display = ("master_code", "name", "brand", "pack_size", "unit", "category", "default_supplier", "is_active")
    list_filter = ("is_active", "unit", "category", "default_supplier")
    search_fields = ("master_code", "name", "brand")
    ordering = ("master_code",)


@admin.register(ItemMasterLink)
class ItemMasterLinkAdmin(admin.ModelAdmin):
    list_display = ("id", "item", "master_product", "linked_at", "confidence")
    search_fields = ("item__item_code", "master_product__master_code")


@admin.register(DemandSnapshot)
class DemandSnapshotAdmin(admin.ModelAdmin):
    list_display = ("master_product", "outlet", "avg_daily_qty_30d", "total_qty_30d", "last_sale_date", "computed_at")
    search_fields = ("master_product__master_code", "master_product__name")


class PurchasePlanLineInline(admin.TabularInline):
    model = PurchasePlanLine
    extra = 0


@admin.register(PurchasePlan)
class PurchasePlanAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "mode", "status", "supplier", "created_by", "created_at")
    list_filter = ("status", "mode")
    search_fields = ("name",)
    inlines = [PurchasePlanLineInline]
