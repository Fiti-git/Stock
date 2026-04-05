from rest_framework import serializers
from .models import UploadLog, AuditLog


class UploadLogSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source="outlet.outlet_name", read_only=True)
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)

    class Meta:
        model = UploadLog
        fields = [
            "id", "outlet_name", "snapshot_date", "uploaded_at",
            "status", "total_rows", "matched_rows", "new_items_count",
            "changed_items_count", "filename", "uploaded_by_username",
            "approval_status", "approved_at",
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "username", "action", "entity_type", "entity_id", "details", "created_at"]
