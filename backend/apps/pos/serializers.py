from rest_framework import serializers
from .models import Shift, Bill, BillLine, Payment, Customer, Promotion


class PromotionSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source="item.item_code", read_only=True)
    item_name = serializers.CharField(source="item.item_name", read_only=True)

    class Meta:
        model = Promotion
        fields = [
            "id", "outlet", "name", "code", "kind", "value", "scope",
            "item", "item_code", "item_name", "category", "min_bill_amount",
            "starts_at", "ends_at", "max_usage", "usage_count", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "outlet", "item_code", "item_name",
                            "usage_count", "created_at", "updated_at"]


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id", "outlet", "name", "phone", "email", "address",
            "loyalty_points", "credit_balance", "note", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "outlet", "created_at", "updated_at"]


class ShiftSerializer(serializers.ModelSerializer):
    opened_by_username = serializers.CharField(source="opened_by.username", read_only=True)
    closed_by_username = serializers.CharField(source="closed_by.username", read_only=True)
    outlet_name = serializers.CharField(source="outlet.outlet_name", read_only=True)
    bill_count = serializers.IntegerField(read_only=True, required=False)
    cash_sales = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, required=False)
    non_cash_sales = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, required=False)
    expected_cash = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, required=False)
    cash_variance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, required=False)

    class Meta:
        model = Shift
        fields = [
            "id", "outlet", "outlet_name",
            "opened_by", "opened_by_username", "opened_at", "opening_cash",
            "closed_by", "closed_by_username", "closed_at",
            "counted_cash", "closing_note", "status", "device_uuid",
            "bill_count", "cash_sales", "non_cash_sales",
            "expected_cash", "cash_variance",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "tender", "amount", "reference", "received_at"]
        read_only_fields = ["id", "received_at"]


class BillLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillLine
        fields = [
            "id", "item", "item_code", "item_name",
            "qty", "unit_price", "line_discount",
            "tax_rate_pct", "tax_amount", "line_total", "note",
        ]
        read_only_fields = ["id", "item_code", "item_name", "line_total", "tax_amount"]


class BillSerializer(serializers.ModelSerializer):
    lines = BillLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    cashier_username = serializers.CharField(source="cashier.username", read_only=True)
    outlet_name = serializers.CharField(source="outlet.outlet_name", read_only=True)
    outlet_address = serializers.CharField(source="outlet.address", read_only=True)
    outlet_phone = serializers.CharField(source="outlet.phone", read_only=True)
    outlet_tax_reg = serializers.CharField(source="outlet.tax_reg_no", read_only=True)
    outlet_receipt_footer = serializers.CharField(source="outlet.receipt_footer", read_only=True)

    class Meta:
        model = Bill
        fields = [
            "id", "bill_no", "shift", "outlet", "outlet_name",
            "outlet_address", "outlet_phone", "outlet_tax_reg", "outlet_receipt_footer",
            "cashier", "cashier_username", "kind", "status",
            "customer", "customer_name", "customer_phone",
            "loyalty_points_earned", "loyalty_points_redeemed",
            "subtotal", "bill_discount", "tax_total", "grand_total",
            "paid_total", "change_due",
            "returns_bill", "void_reason", "voided_by", "voided_at",
            "created_at", "closed_at", "updated_at",
            "lines", "payments",
        ]
        read_only_fields = fields


class CartLineInput(serializers.Serializer):
    item_id = serializers.IntegerField()
    qty = serializers.DecimalField(max_digits=12, decimal_places=3)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    line_discount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    tax_rate_pct = serializers.DecimalField(max_digits=6, decimal_places=3, required=False, default=0)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentInput(serializers.Serializer):
    tender = serializers.ChoiceField(choices=Payment.Tender.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reference = serializers.CharField(required=False, allow_blank=True, default="")


class CreateBillInput(serializers.Serializer):
    lines = CartLineInput(many=True)
    payments = PaymentInput(many=True)
    bill_discount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    customer_name = serializers.CharField(required=False, allow_blank=True, default="")
    customer_phone = serializers.CharField(required=False, allow_blank=True, default="")
    kind = serializers.ChoiceField(choices=Bill.Kind.choices, default=Bill.Kind.SALE)
    returns_bill_id = serializers.IntegerField(required=False, allow_null=True)
    promotion_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)


class PromotionInput(serializers.ModelSerializer):
    class Meta:
        model = Promotion
        fields = ["name", "code", "kind", "value", "scope", "item", "category",
                  "min_bill_amount", "starts_at", "ends_at", "max_usage", "is_active"]


class OpenShiftInput(serializers.Serializer):
    opening_cash = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)


class CloseShiftInput(serializers.Serializer):
    counted_cash = serializers.DecimalField(max_digits=14, decimal_places=2)
    closing_note = serializers.CharField(required=False, allow_blank=True, default="")
