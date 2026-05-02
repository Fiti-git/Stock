from rest_framework import serializers

from .models import EcomCart, EcomCartItem, EcomOrder, EcomOrderLine


class CartLineSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source="item.item_code", read_only=True)
    item_name = serializers.CharField(source="item.item_name", read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = EcomCartItem
        fields = (
            "id", "item_id", "item_code", "item_name",
            "qty", "unit_price_snapshot", "line_total",
        )

    def get_line_total(self, obj):
        return str((obj.qty or 0) * (obj.unit_price_snapshot or 0))


class CartSerializer(serializers.ModelSerializer):
    items = CartLineSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = EcomCart
        fields = (
            "id", "session_token", "outlet_id", "customer_id", "status",
            "items", "subtotal", "item_count",
            "created_at", "last_activity_at",
        )

    def get_subtotal(self, obj):
        total = sum(((ci.qty or 0) * (ci.unit_price_snapshot or 0))
                    for ci in obj.items.all())
        return str(total)

    def get_item_count(self, obj):
        return obj.items.count()


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = EcomOrderLine
        fields = (
            "id", "item_id", "item_code_snapshot", "item_name_snapshot",
            "qty", "unit_price", "line_subtotal", "tax_amount", "line_total",
            "is_committed", "committed_at",
        )


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)

    class Meta:
        model = EcomOrder
        fields = (
            "id", "number", "outlet_id", "customer_id", "status",
            "guest_name", "guest_email", "guest_phone",
            "shipping_address", "billing_address",
            "subtotal", "shipping_total", "tax_total",
            "discount_total", "grand_total", "currency",
            "payment_intent_ref", "notes",
            "lines",
            "created_at", "paid_at", "fulfilled_at",
            "shipped_at", "delivered_at", "cancelled_at",
        )
