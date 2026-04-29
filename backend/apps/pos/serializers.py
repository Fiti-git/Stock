from rest_framework import serializers
from .models import (
    Shift, Bill, BillLine, Payment, Customer, Promotion,
    Coupon, CouponRedemption, GiftCard, GiftCardTxn,
    TaxComponent, CommissionRule,
)


class PromotionSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source="item.item_code", read_only=True)
    item_name = serializers.CharField(source="item.item_name", read_only=True)

    class Meta:
        model = Promotion
        fields = [
            "id", "outlet", "name", "code", "kind", "value", "scope",
            "item", "item_code", "item_name", "category", "min_bill_amount",
            "buy_qty", "get_qty", "get_item",
            "combo_items", "combo_price",
            "tiers", "time_from", "time_to", "weekdays",
            "starts_at", "ends_at", "max_usage", "usage_count", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "outlet", "item_code", "item_name",
                            "usage_count", "created_at", "updated_at"]


class CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = [
            "id", "outlet", "code", "discount_kind", "value", "min_bill_amount",
            "one_time", "per_customer_limit", "usage_count", "max_usage",
            "starts_at", "ends_at", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "usage_count", "created_at", "updated_at"]


class CouponInput(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = [
            "code", "discount_kind", "value", "min_bill_amount",
            "one_time", "per_customer_limit", "max_usage",
            "starts_at", "ends_at", "is_active", "outlet",
        ]


class GiftCardTxnSerializer(serializers.ModelSerializer):
    class Meta:
        model = GiftCardTxn
        fields = ["id", "kind", "amount", "balance_after", "bill", "note", "created_at"]


class GiftCardSerializer(serializers.ModelSerializer):
    txns = GiftCardTxnSerializer(many=True, read_only=True)

    class Meta:
        model = GiftCard
        fields = [
            "id", "outlet", "serial", "initial_balance", "current_balance",
            "customer", "expires_at", "status", "issued_by", "issued_at", "txns",
        ]
        read_only_fields = ["id", "current_balance", "issued_by", "issued_at", "txns"]


class GiftCardIssueInput(serializers.Serializer):
    serial = serializers.CharField(max_length=40)
    initial_balance = serializers.DecimalField(max_digits=14, decimal_places=2)
    customer_id = serializers.IntegerField(required=False, allow_null=True)
    expires_at = serializers.DateField(required=False, allow_null=True)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id", "outlet", "name", "phone", "email", "address",
            "loyalty_points", "credit_balance", "note", "is_active",
            "tax_exempt", "tax_exempt_reason",
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
            "batches_consumed", "pack_unit_snapshot",
            "unit_kind", "pack_size_at_sale",
            "sales_rep",
        ]
        read_only_fields = ["id", "item_code", "item_name", "line_total",
                            "tax_amount", "batches_consumed", "pack_unit_snapshot",
                            "unit_kind", "pack_size_at_sale"]


class BillSerializer(serializers.ModelSerializer):
    lines = BillLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    cashier_username = serializers.CharField(source="cashier.username", read_only=True)
    sales_rep_username = serializers.CharField(source="sales_rep.username", read_only=True)
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
            "cashier", "cashier_username",
            "sales_rep", "sales_rep_username",
            "kind", "status",
            "customer", "customer_name", "customer_phone",
            "loyalty_points_earned", "loyalty_points_redeemed",
            "subtotal", "bill_discount", "tax_total", "tax_breakdown", "grand_total",
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
    # Multi-unit (Phase 2 Agent 6). When set, `qty_in_unit` is in the
    # given pack unit and is converted to base units server-side using
    # the pack unit's `conversion_factor`. `unit_price` (if supplied) is
    # interpreted as the price *per pack unit* and re-stated to a
    # per-base-unit price before being stored on BillLine.
    pack_unit_id = serializers.IntegerField(required=False, allow_null=True)
    qty_in_unit = serializers.DecimalField(
        max_digits=12, decimal_places=3, required=False, allow_null=True,
    )
    # Phase 2 Agent 6 — simple unit toggle. When `unit_kind="pack"`, `qty`
    # is interpreted as a pack count and converted to base units server-side
    # using Item.pack_size. `qty_input` is the raw user-entered number kept
    # purely for clarity / audit (not strictly required).
    unit_kind = serializers.ChoiceField(
        choices=[("base", "base"), ("pack", "pack")],
        required=False, default="base",
    )
    qty_input = serializers.DecimalField(
        max_digits=12, decimal_places=3, required=False, allow_null=True,
    )
    # Phase 3 Agent 10 — per-line sales rep override.
    sales_rep_id = serializers.IntegerField(required=False, allow_null=True)


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
    coupon_code = serializers.CharField(required=False, allow_blank=True, default="")
    # Phase 3 Agent 10 — bill-level sales rep attribution.
    sales_rep_id = serializers.IntegerField(required=False, allow_null=True)


class PromotionInput(serializers.ModelSerializer):
    class Meta:
        model = Promotion
        fields = ["name", "code", "kind", "value", "scope", "item", "category",
                  "min_bill_amount", "starts_at", "ends_at", "max_usage", "is_active",
                  "buy_qty", "get_qty", "get_item",
                  "combo_items", "combo_price",
                  "tiers", "time_from", "time_to", "weekdays"]


class OpenShiftInput(serializers.Serializer):
    opening_cash = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)


class CloseShiftInput(serializers.Serializer):
    counted_cash = serializers.DecimalField(max_digits=14, decimal_places=2)
    closing_note = serializers.CharField(required=False, allow_blank=True, default="")


class CommissionRuleSerializer(serializers.ModelSerializer):
    rep_username = serializers.CharField(source="rep.username", read_only=True)

    class Meta:
        model = CommissionRule
        fields = [
            "id", "outlet", "rep", "rep_username", "item_category",
            "rate_pct", "basis", "priority", "is_active",
            "starts_at", "ends_at", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "rep_username", "created_at", "updated_at"]


class TaxComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxComponent
        fields = [
            "id", "outlet", "code", "name", "rate_pct", "inclusive",
            "applies_to_categories", "excluded_categories",
            "priority", "is_active", "starts_at", "ends_at",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
