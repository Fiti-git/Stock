from rest_framework import serializers
from .models import StockCount


class StockCountSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source="item.item_code", read_only=True)
    item_name = serializers.CharField(source="item.item_name", read_only=True)
    counted_by_username = serializers.CharField(source="counted_by.username", read_only=True)

    class Meta:
        model = StockCount
        fields = [
            "id", "item_id", "item_code", "item_name",
            "count_date", "actual_qty", "location_tag",
            "counted_by_username", "counted_at", "is_month_end",
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
