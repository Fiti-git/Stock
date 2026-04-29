from rest_framework import serializers

from .models import StockTransfer, StockTransferLine, TransferEvent


class StockTransferLineSerializer(serializers.ModelSerializer):
    variance = serializers.SerializerMethodField()

    class Meta:
        model = StockTransferLine
        fields = [
            "id", "item", "item_code", "item_name",
            "qty_requested", "qty_dispatched", "qty_received",
            "unit_cost", "batches_dispatched", "note", "variance",
        ]
        read_only_fields = ["item_code", "item_name", "batches_dispatched"]

    def get_variance(self, obj):
        return float((obj.qty_dispatched or 0) - (obj.qty_received or 0))


class TransferEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.SerializerMethodField()

    class Meta:
        model = TransferEvent
        fields = [
            "id", "from_status", "to_status", "actor", "actor_username",
            "note", "payload", "created_at",
        ]

    def get_actor_username(self, obj):
        return obj.actor.username if obj.actor_id else None


class StockTransferListSerializer(serializers.ModelSerializer):
    source_outlet_name = serializers.SerializerMethodField()
    dest_outlet_name = serializers.SerializerMethodField()
    line_count = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = [
            "id", "ref_no", "status",
            "source_outlet", "source_outlet_name",
            "dest_outlet", "dest_outlet_name",
            "requested_at", "dispatched_at", "received_at", "closed_at",
            "note", "variance_note", "line_count",
            "created_at", "updated_at",
        ]

    def get_source_outlet_name(self, obj):
        return obj.source_outlet.outlet_name if obj.source_outlet_id else ""

    def get_dest_outlet_name(self, obj):
        return obj.dest_outlet.outlet_name if obj.dest_outlet_id else ""

    def get_line_count(self, obj):
        return obj.lines.count()


class StockTransferDetailSerializer(StockTransferListSerializer):
    lines = StockTransferLineSerializer(many=True, read_only=True)
    events = TransferEventSerializer(many=True, read_only=True)
    requested_by_username = serializers.SerializerMethodField()
    dispatched_by_username = serializers.SerializerMethodField()
    received_by_username = serializers.SerializerMethodField()
    closed_by_username = serializers.SerializerMethodField()

    class Meta(StockTransferListSerializer.Meta):
        fields = StockTransferListSerializer.Meta.fields + [
            "lines", "events",
            "requested_by", "requested_by_username",
            "dispatched_by", "dispatched_by_username",
            "received_by", "received_by_username",
            "closed_by", "closed_by_username",
        ]

    def get_requested_by_username(self, obj):
        return obj.requested_by.username if obj.requested_by_id else None

    def get_dispatched_by_username(self, obj):
        return obj.dispatched_by.username if obj.dispatched_by_id else None

    def get_received_by_username(self, obj):
        return obj.received_by.username if obj.received_by_id else None

    def get_closed_by_username(self, obj):
        return obj.closed_by.username if obj.closed_by_id else None
