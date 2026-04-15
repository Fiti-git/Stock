from rest_framework import serializers
from .models import Item, PendingItem
from apps.uploads.models import PosSnapshot
from apps.dashboard.models import StockCount


class ItemSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source="outlet.outlet_name", read_only=True)
    latest_cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=None)
    latest_selling_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=None)

    class Meta:
        model = Item
        fields = [
            "id", "outlet", "outlet_name", "item_code", "item_name", "barcode",
            "category", "rack_number", "shelf", "status", "created_at", "barcode_assigned_at",
            "latest_cost_price", "latest_selling_price",
        ]
        read_only_fields = ["id", "created_at", "barcode_assigned_at"]


class PendingItemSerializer(serializers.ModelSerializer):
    first_seen_outlet_name = serializers.CharField(
        source="first_seen_outlet.outlet_name", read_only=True
    )
    latest_cost_price = serializers.SerializerMethodField()
    latest_selling_price = serializers.SerializerMethodField()

    class Meta:
        model = PendingItem
        fields = [
            "id", "item_code", "item_name", "first_seen_outlet",
            "first_seen_outlet_name", "first_seen_date", "staff_note",
            "status", "change_type", "changed_fields", "item", "created_at",
            "latest_cost_price", "latest_selling_price",
        ]
        read_only_fields = ["id", "first_seen_date", "created_at"]

    def get_latest_cost_price(self, obj):
        if not obj.item_id:
            return None
        snap = PosSnapshot.objects.filter(item_id=obj.item_id).order_by("-snapshot_date").first()
        return snap.cost_price if snap else None

    def get_latest_selling_price(self, obj):
        if not obj.item_id:
            return None
        snap = PosSnapshot.objects.filter(item_id=obj.item_id).order_by("-snapshot_date").first()
        return snap.selling_price if snap else None


class ItemUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = ["item_name", "barcode", "category", "rack_number", "shelf"]
        extra_kwargs = {
            "item_name": {"required": False},
            "barcode": {"required": False, "allow_null": True, "allow_blank": True},
            "category": {"required": False, "allow_blank": True},
            "rack_number": {"required": False, "allow_blank": True},
            "shelf": {"required": False, "allow_blank": True},
        }


class AssignBarcodeSerializer(serializers.Serializer):
    barcode = serializers.CharField(max_length=100)
    category = serializers.CharField(max_length=200, required=False, allow_blank=True)
    rack_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    shelf = serializers.CharField(max_length=50, required=False, allow_blank=True)


class PosSnapshotSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)

    class Meta:
        model = PosSnapshot
        fields = [
            "id", "snapshot_date", "pos_quantity",
            "cost_price", "selling_price",
            "uploaded_by_username", "uploaded_at",
        ]


class StockCountHistorySerializer(serializers.ModelSerializer):
    counted_by_username = serializers.CharField(source="counted_by.username", read_only=True)

    class Meta:
        model = StockCount
        fields = [
            "id", "count_date", "actual_qty", "location_tag",
            "counted_by_username", "counted_at", "is_month_end",
        ]


class ItemDetailSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source="outlet.outlet_name", read_only=True)
    pos_history = serializers.SerializerMethodField()
    count_history = serializers.SerializerMethodField()
    latest_pos_qty = serializers.SerializerMethodField()
    latest_actual_qty = serializers.SerializerMethodField()
    variance = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id", "outlet", "outlet_name", "item_code", "item_name",
            "barcode", "category", "rack_number", "shelf", "status", "created_at", "barcode_assigned_at",
            "latest_pos_qty", "latest_actual_qty", "variance",
            "pos_history", "count_history",
        ]

    def _latest_pos(self, obj):
        return PosSnapshot.objects.filter(item=obj).order_by("-snapshot_date").first()

    def _latest_count(self, obj):
        return StockCount.objects.filter(item=obj).order_by("-count_date").first()

    def get_pos_history(self, obj):
        snaps = PosSnapshot.objects.filter(item=obj).order_by("-snapshot_date")[:30]
        return PosSnapshotSerializer(snaps, many=True).data

    def get_count_history(self, obj):
        counts = StockCount.objects.filter(item=obj).order_by("-count_date")[:30]
        return StockCountHistorySerializer(counts, many=True).data

    def get_latest_pos_qty(self, obj):
        snap = self._latest_pos(obj)
        return float(snap.pos_quantity) if snap else None

    def get_latest_actual_qty(self, obj):
        sc = self._latest_count(obj)
        return float(sc.actual_qty) if sc else None

    def get_variance(self, obj):
        snap = self._latest_pos(obj)
        sc = self._latest_count(obj)
        if snap and sc:
            return float(sc.actual_qty) - float(snap.pos_quantity)
        return None
