from rest_framework import serializers
from .models import StockCount, CountSession, VarianceRecord


class StockCountSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source="item.item_code", read_only=True)
    item_name = serializers.CharField(source="item.item_name", read_only=True)
    counted_by_username = serializers.CharField(source="counted_by.username", read_only=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)

    class Meta:
        model = StockCount
        fields = [
            "id", "item_id", "item_code", "item_name",
            "count_date", "actual_qty", "location_tag",
            "counted_by_username", "counted_at", "is_month_end",
            "session", "approval_status", "submitted_at",
            "approved_by_username", "approved_at",
            "rejection_reason", "flagged_outlier",
        ]


class VarianceSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    item_code = serializers.CharField()
    item_name = serializers.CharField()
    category = serializers.CharField()
    pos_qty = serializers.FloatField()
    actual_qty = serializers.FloatField(allow_null=True)
    variance = serializers.FloatField(allow_null=True)
    location_tag = serializers.CharField()
    last_counted = serializers.CharField(allow_null=True)
    snapshot_date = serializers.CharField()


class SubmitCountSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    actual_qty = serializers.DecimalField(max_digits=12, decimal_places=3)
    location_tag = serializers.CharField(max_length=100, required=False, allow_blank=True)
    is_month_end = serializers.BooleanField(required=False, default=False)

    def validate_actual_qty(self, value):
        if value < 0:
            raise serializers.ValidationError("Count quantity cannot be negative.")
        return value


class CountSessionSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source="outlet.outlet_name", read_only=True)
    started_by_username = serializers.CharField(source="started_by.username", read_only=True)
    closed_by_username = serializers.CharField(source="closed_by.username", read_only=True)
    count_total = serializers.IntegerField(read_only=True, required=False)
    submitted_count = serializers.IntegerField(read_only=True, required=False)
    approved_count = serializers.IntegerField(read_only=True, required=False)
    variance_total = serializers.IntegerField(read_only=True, required=False)
    variance_pending = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = CountSession
        fields = [
            "id", "outlet", "outlet_name", "count_date", "status",
            "started_by_username", "started_at",
            "closed_by_username", "closed_at", "note",
            "count_total", "submitted_count", "approved_count",
            "variance_total", "variance_pending",
        ]
        read_only_fields = ["status", "started_by_username", "started_at", "closed_by_username", "closed_at"]


class VarianceRecordSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source="item.item_code", read_only=True)
    item_name = serializers.CharField(source="item.item_name", read_only=True)
    category = serializers.CharField(source="item.category", read_only=True)
    resolved_by_username = serializers.CharField(source="resolved_by.username", read_only=True)

    class Meta:
        model = VarianceRecord
        fields = [
            "id", "session", "outlet", "item", "item_code", "item_name", "category",
            "count_date", "pos_qty", "counted_qty", "variance_qty", "variance_value",
            "status", "resolution_note", "adjustment_qty",
            "resolved_by_username", "resolved_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "session", "outlet", "item", "count_date",
            "pos_qty", "counted_qty", "variance_qty", "variance_value",
            "resolved_by_username", "resolved_at", "created_at", "updated_at",
        ]
