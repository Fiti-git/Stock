from django.contrib import admin
from .models import Outlet


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ["id", "outlet_name", "location_code", "created_at"]
    search_fields = ["outlet_name"]
