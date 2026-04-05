from django.contrib import admin
from .models import PosSnapshot, UploadLog, AuditLog


@admin.register(UploadLog)
class UploadLogAdmin(admin.ModelAdmin):
    list_display = ["outlet", "snapshot_date", "status", "total_rows", "new_items_count", "uploaded_at"]
    list_filter = ["status", "outlet"]
    ordering = ["-uploaded_at"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["user", "action", "entity_type", "entity_id", "created_at"]
    list_filter = ["action"]
    ordering = ["-created_at"]
