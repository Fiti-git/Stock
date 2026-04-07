from django.contrib import admin
from .models import Outlet


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ["id", "outlet_name", "short_code", "location_code", "file_location_name", "created_at"]
    search_fields = ["outlet_name", "file_location_name"]
