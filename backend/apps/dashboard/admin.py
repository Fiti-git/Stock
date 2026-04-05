from django.contrib import admin
from .models import StockCount


@admin.register(StockCount)
class StockCountAdmin(admin.ModelAdmin):
    list_display = ["outlet", "item", "count_date", "actual_qty", "location_tag", "counted_by"]
    list_filter = ["outlet", "count_date", "is_month_end"]
    ordering = ["-counted_at"]
