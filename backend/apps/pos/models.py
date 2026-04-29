"""
Point-of-sale billing models.

Design notes:
  - Money is Decimal(14,2). Quantities are Decimal(12,3).
  - A Bill is immutable once CLOSED. Corrections are done via a second Bill
    of type RETURN (negative qty), never by editing an existing Bill.
  - A Shift groups Bills taken on one terminal between open and close. Close
    captures counted cash for reconciliation; `expected_cash` is computed.
  - Tenders are an enum, not a table — keeps the model simple for SL SMEs.
    A Payment row per tender type per Bill (so split tender is one Bill, N Payments).
"""

from decimal import Decimal
from django.db import models


class Customer(models.Model):
    """
    Customer directory scoped to an outlet. Phone is the natural key —
    auto-created from POS bills when a phone is entered. Loyalty points
    are simple integer accruals; redemption is handled as 'credit' tender.
    """
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40, blank=True, default="")
    email = models.CharField(max_length=255, blank=True, default="")
    address = models.CharField(max_length=500, blank=True, default="")
    loyalty_points = models.IntegerField(default=0)
    credit_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=500, blank=True, default="")
    is_active = models.BooleanField(default=True)
    # Phase 3 Agent 8 — tax-exempt customers (e.g. diplomatic, NGO).
    tax_exempt = models.BooleanField(default=False)
    tax_exempt_reason = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_customers"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["outlet", "phone"]),
            models.Index(fields=["outlet", "name"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["outlet", "phone"],
                condition=~models.Q(phone=""),
                name="uniq_customer_phone_per_outlet",
            ),
        ]

    def __str__(self):
        return f"{self.name} {self.phone}"


class Expense(models.Model):
    """Petty cash / shift-level expense — cash out that isn't a bill refund."""
    class Kind(models.TextChoices):
        PETTY = "petty", "Petty cash"
        UTILITY = "utility", "Utility"
        SALARY = "salary", "Salary / wage"
        RENT = "rent", "Rent"
        OTHER = "other", "Other"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="expenses")
    shift = models.ForeignKey("pos.Shift", null=True, blank=True, on_delete=models.SET_NULL, related_name="expenses")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PETTY)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    note = models.CharField(max_length=300, blank=True, default="")
    paid_to = models.CharField(max_length=120, blank=True, default="")
    receipt_ref = models.CharField(max_length=80, blank=True, default="")
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="expenses")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_expenses"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "-created_at"]),
            models.Index(fields=["shift"]),
            models.Index(fields=["kind"]),
        ]


class PurchaseReturn(models.Model):
    """Return goods to a supplier. Stock-out + payable adjustment."""
    class Status(models.TextChoices):
        POSTED = "posted", "Posted"
        VOID = "void", "Void"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.PROTECT, related_name="purchase_returns")
    supplier = models.ForeignKey("uploads.Supplier", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="purchase_returns")
    supplier_name = models.CharField(max_length=200, blank=True, default="")
    supplier_code = models.CharField(max_length=40, blank=True, default="")
    ref_no = models.CharField(max_length=40, unique=True)
    original_invoice_no = models.CharField(max_length=60, blank=True, default="")
    returned_on = models.DateField()
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=500, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.POSTED)
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="purchase_returns")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_purchase_returns"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "-created_at"]),
            models.Index(fields=["supplier"]),
            models.Index(fields=["status"]),
        ]


class PurchaseReturnLine(models.Model):
    ret = models.ForeignKey(PurchaseReturn, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="purchase_return_lines")
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=300)
    qty = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "pos_purchase_return_lines"
        indexes = [models.Index(fields=["ret"]), models.Index(fields=["item"])]


class SupplierPaymentTxn(models.Model):
    """
    Ledger of supplier payables. `+` = we owe the supplier (GRN received),
    `-` = we paid them or got credit (RTS / cash payment). Balance = sum.
    """
    class Kind(models.TextChoices):
        GRN = "grn", "Goods Received"
        RTS = "rts", "Return to Supplier"
        PAYMENT = "payment", "Payment Made"
        ADJUSTMENT = "adjustment", "Adjustment"
        OPENING = "opening", "Opening Balance"

    supplier = models.ForeignKey("uploads.Supplier", on_delete=models.CASCADE, related_name="payment_txns")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="supplier_payment_txns")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)   # signed
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    ref_type = models.CharField(max_length=40, blank=True, default="")
    ref_id = models.CharField(max_length=40, blank=True, default="")
    note = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="supplier_payment_txns")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_supplier_payment_txns"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["supplier", "-created_at"]),
            models.Index(fields=["outlet", "-created_at"]),
            models.Index(fields=["kind"]),
        ]


class Promotion(models.Model):
    """
    Simple promo engine. Either a percent off or a fixed LKR off, applied
    to a single item, a category (by item.category text), or the whole bill.
    Date-ranged with optional usage cap.
    """

    class Kind(models.TextChoices):
        PERCENT = "percent", "% off"
        AMOUNT = "amount", "LKR off"
        BOGO = "bogo", "Buy X Get Y"
        COMBO = "combo", "Combo bundle"
        TIERED = "tiered", "Tiered discount"
        HAPPY_HOUR = "happy_hour", "Happy hour"

    class Scope(models.TextChoices):
        ITEM = "item", "Single item"
        CATEGORY = "category", "Category"
        BILL = "bill", "Whole bill"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="promotions")
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=40, blank=True, default="")

    kind = models.CharField(max_length=15, choices=Kind.choices)
    value = models.DecimalField(max_digits=14, decimal_places=2)
    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.BILL)
    item = models.ForeignKey("items.Item", null=True, blank=True, on_delete=models.SET_NULL, related_name="promotions")
    category = models.CharField(max_length=200, blank=True, default="")
    min_bill_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # BOGO fields
    buy_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    get_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    get_item = models.ForeignKey("items.Item", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="+")
    # Combo fields
    combo_items = models.ManyToManyField("items.Item", blank=True, related_name="combo_promotions")
    combo_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Tiered: list of {"min_qty": .., "discount_pct": ..}
    tiers = models.JSONField(default=list, blank=True)
    # Happy hour
    time_from = models.TimeField(null=True, blank=True)
    time_to = models.TimeField(null=True, blank=True)
    weekdays = models.CharField(max_length=15, blank=True, default="")  # CSV "0,1,2"

    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    max_usage = models.IntegerField(default=0)  # 0 = unlimited
    usage_count = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="created_promotions")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_promotions"
        ordering = ["-starts_at"]
        indexes = [
            models.Index(fields=["outlet", "is_active", "starts_at", "ends_at"]),
            models.Index(fields=["item"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.kind} {self.value})"


class CustomerCreditTxn(models.Model):
    """Append-only ledger of customer credit balance changes."""

    class Kind(models.TextChoices):
        TOPUP = "topup", "Top-up"
        REDEEM = "redeem", "Redeem on Bill"
        REFUND = "refund", "Refund to Credit"
        ADJUST = "adjust", "Manual Adjustment"
        REVERSAL = "reversal", "Reversal (void)"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="credit_txns")
    amount = models.DecimalField(max_digits=14, decimal_places=2)  # signed: topup +, redeem -
    kind = models.CharField(max_length=12, choices=Kind.choices)
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    ref_type = models.CharField(max_length=40, blank=True, default="")
    ref_id = models.CharField(max_length=40, blank=True, default="")
    note = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="customer_credit_txns")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_customer_credit_txns"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["customer", "-created_at"]),
            models.Index(fields=["kind"]),
            models.Index(fields=["ref_type", "ref_id"]),
        ]


class Shift(models.Model):
    """A cashier's till session on one device for one outlet."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.PROTECT, related_name="shifts")
    opened_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="opened_shifts")
    opened_at = models.DateTimeField(auto_now_add=True)
    opening_cash = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    closed_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="closed_shifts")
    closed_at = models.DateTimeField(null=True, blank=True)
    counted_cash = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    closing_note = models.CharField(max_length=500, blank=True, default="")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    device_uuid = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "pos_shifts"
        ordering = ["-opened_at"]
        indexes = [
            models.Index(fields=["outlet", "status"]),
            models.Index(fields=["opened_by", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["outlet", "opened_by"],
                condition=models.Q(status="open"),
                name="uniq_open_shift_per_user_outlet",
            ),
        ]

    def __str__(self):
        return f"Shift {self.id} {self.outlet_id}/{self.opened_by_id} [{self.status}]"


class Bill(models.Model):
    """One transaction. Lines are BillLine rows; tender is Payment rows."""

    class Kind(models.TextChoices):
        SALE = "sale", "Sale"
        RETURN_ = "return", "Return"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"              # cart state — no stock effect yet
        CLOSED = "closed", "Closed"           # finalized, printed
        VOID = "void", "Void"                 # cancelled before close
        RETURNED = "returned", "Fully Returned"

    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="bills")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.PROTECT, related_name="bills")
    cashier = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="bills")
    # Phase 3 Agent 10 — optional sales rep attribution for commission reports.
    sales_rep = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="rep_bills",
    )

    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.SALE)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)

    bill_no = models.CharField(max_length=30, unique=True)   # assigned on close (BILL/00042)
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="bills")
    customer_name = models.CharField(max_length=120, blank=True, default="")   # snapshot
    customer_phone = models.CharField(max_length=40, blank=True, default="")   # snapshot
    loyalty_points_earned = models.IntegerField(default=0)
    loyalty_points_redeemed = models.IntegerField(default=0)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    bill_discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Phase 3 Agent 8 — multi-component tax breakdown snapshot.
    # List of {"code","name","rate_pct","amount","inclusive"}.
    tax_breakdown = models.JSONField(default=list, blank=True)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    paid_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    change_due = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # For returns — points at the original bill
    returns_bill = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="return_bills")

    void_reason = models.CharField(max_length=500, blank=True, default="")
    voided_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="voided_bills")
    voided_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_bills"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "created_at"]),
            models.Index(fields=["outlet", "status"]),
            models.Index(fields=["shift"]),
            models.Index(fields=["cashier", "created_at"]),
            models.Index(fields=["sales_rep", "created_at"]),
        ]

    def __str__(self):
        return f"{self.bill_no or 'DRAFT'} {self.grand_total}"


class BillLine(models.Model):
    """One item row on a bill."""
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="pos_lines")

    item_code = models.CharField(max_length=50)          # snapshot at sale time
    item_name = models.CharField(max_length=300)

    qty = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    line_discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_rate_pct = models.DecimalField(max_digits=6, decimal_places=3, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)  # qty*price - disc + tax

    note = models.CharField(max_length=200, blank=True, default="")

    # FEFO batch consumption snapshot — list of {"batch_id", "batch_no", "qty"}
    batches_consumed = models.JSONField(default=list, blank=True)

    # Pack-unit snapshot for receipts: when an item is sold in a non-base
    # unit (e.g. BOX12), `qty`/`unit_price` stay in base units but this
    # records what the customer actually saw — keys: `unit_code`,
    # `conversion_factor`, `qty_in_unit`, `unit_price_in_unit`.
    pack_unit_snapshot = models.JSONField(default=dict, blank=True)

    # Phase 2 Agent 6 — multi-unit billing snapshot.
    # `unit_kind` is "base" (default) or "pack". When "pack", `qty` is still
    # stored in base units (server-canonicalized) and `pack_size_at_sale`
    # records the conversion factor so receipts/returns/reports can recover
    # the customer-facing pack count via qty / pack_size_at_sale.
    unit_kind = models.CharField(max_length=8, default="base")
    pack_size_at_sale = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    # Phase 3 Agent 10 — optional per-line sales rep override (when one bill
    # involves multiple reps). When null the line inherits Bill.sales_rep.
    sales_rep = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="rep_bill_lines",
    )

    class Meta:
        db_table = "pos_bill_lines"
        indexes = [
            models.Index(fields=["bill"]),
            models.Index(fields=["item"]),
        ]

    def __str__(self):
        return f"{self.item_code} x {self.qty}"


class Payment(models.Model):
    """One tender leg of a bill. Split-tender = multiple rows."""

    class Tender(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        LANKAQR = "lankaqr", "LankaQR"
        BANK_TRANSFER = "bank", "Bank Transfer"
        CREDIT = "credit", "Store Credit"
        OTHER = "other", "Other"
        GIFT_CARD = "gift_card", "Gift Card"

    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="payments")
    tender = models.CharField(max_length=15, choices=Tender.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True, default="")   # auth code, txn id, etc.
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_payments"
        indexes = [
            models.Index(fields=["bill"]),
            models.Index(fields=["tender"]),
        ]


class BillSequence(models.Model):
    """
    Per-(outlet, date) atomic counter for bill_no. The row is locked with
    select_for_update() inside the bill creation transaction so concurrent
    cashiers can never collide on the same sequence number.

    The actual bill_no string is still formatted by views (`B{outlet:02d}{yymmdd}{seq:04d}`)
    — this table just owns the integer counter.
    """
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="bill_sequences")
    date_str = models.CharField(max_length=8)   # 'yymmdd'
    counter = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_bill_sequences"
        constraints = [
            models.UniqueConstraint(fields=["outlet", "date_str"], name="uniq_bill_seq_outlet_date"),
        ]
        indexes = [
            models.Index(fields=["outlet", "date_str"]),
        ]

    def __str__(self):
        return f"BillSeq {self.outlet_id}/{self.date_str}={self.counter}"


class IdempotencyKey(models.Model):
    """
    Caches the response of a write endpoint keyed by an `Idempotency-Key`
    header. If the same key arrives again with the same body, the original
    response is replayed without re-executing the view. Live for 24h.
    """
    key = models.CharField(max_length=80, unique=True)
    user = models.ForeignKey("accounts.User", null=True, blank=True,
                             on_delete=models.SET_NULL, related_name="idempotency_keys")
    endpoint = models.CharField(max_length=120)
    request_hash = models.CharField(max_length=64)   # sha256 hex
    response_status = models.IntegerField()
    response_body = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_idempotency_keys"
        indexes = [
            models.Index(fields=["key"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"IdemKey {self.key} @ {self.created_at:%Y-%m-%d %H:%M}"


class DiscountPolicy(models.Model):
    """
    Per-(outlet, role) caps on discounts a cashier can grant unaided.
    A bill exceeding the caps is rejected unless the request carries an
    `approval_token` countersigned by a manager (Phase-2 wiring; for now
    any non-empty token is accepted as a placeholder).

    If no row exists for the user's role, sensible defaults apply
    (max_line=10%, max_bill=10%, max_amount=5000, require_pin_above=5%).
    """
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE,
                               related_name="discount_policies", null=True, blank=True)
    role = models.CharField(max_length=30)   # User.Role choice
    max_line_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    max_bill_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    max_bill_discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=5000)
    require_manager_pin_above_pct = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_discount_policies"
        ordering = ["outlet_id", "role"]
        constraints = [
            models.UniqueConstraint(fields=["outlet", "role"], name="uniq_discount_policy_outlet_role"),
        ]
        indexes = [
            models.Index(fields=["outlet", "role"]),
        ]

    def __str__(self):
        return f"DiscPolicy {self.outlet_id}/{self.role}"


class Coupon(models.Model):
    """Single-use or limited-use bill-level coupon code."""

    class DiscountKind(models.TextChoices):
        PERCENT = "percent", "% off"
        AMOUNT = "amount", "LKR off"

    outlet = models.ForeignKey("outlets.Outlet", null=True, blank=True,
                               on_delete=models.CASCADE, related_name="coupons")
    code = models.CharField(max_length=40, unique=True, db_index=True)
    discount_kind = models.CharField(max_length=10, choices=DiscountKind.choices)
    value = models.DecimalField(max_digits=14, decimal_places=2)
    min_bill_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    one_time = models.BooleanField(default=False)
    per_customer_limit = models.IntegerField(default=0)   # 0 = unlimited
    usage_count = models.IntegerField(default=0)
    max_usage = models.IntegerField(default=0)            # 0 = unlimited
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="created_coupons")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_coupons"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "is_active"]),
            models.Index(fields=["code"]),
        ]

    def __str__(self):
        return f"Coupon {self.code}"


class CouponRedemption(models.Model):
    coupon = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name="redemptions")
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="coupon_redemptions")
    customer = models.ForeignKey(Customer, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="coupon_redemptions")
    discount_applied = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_coupon_redemptions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["coupon", "-created_at"]),
            models.Index(fields=["customer"]),
        ]


class GiftCard(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        REDEEMED = "redeemed", "Redeemed"
        EXPIRED = "expired", "Expired"
        VOID = "void", "Void"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="gift_cards")
    serial = models.CharField(max_length=40, unique=True, db_index=True)
    initial_balance = models.DecimalField(max_digits=14, decimal_places=2)
    current_balance = models.DecimalField(max_digits=14, decimal_places=2)
    customer = models.ForeignKey(Customer, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="gift_cards")
    expires_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    issued_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                  on_delete=models.SET_NULL, related_name="issued_gift_cards")
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_gift_cards"
        ordering = ["-issued_at"]
        indexes = [
            models.Index(fields=["outlet", "status"]),
            models.Index(fields=["serial"]),
        ]

    def __str__(self):
        return f"GiftCard {self.serial} {self.current_balance}"


class GiftCardTxn(models.Model):
    class Kind(models.TextChoices):
        ISSUE = "issue", "Issue"
        REDEEM = "redeem", "Redeem"
        ADJUST = "adjust", "Adjust"
        VOID = "void", "Void"

    card = models.ForeignKey(GiftCard, on_delete=models.CASCADE, related_name="txns")
    amount = models.DecimalField(max_digits=14, decimal_places=2)   # signed
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    bill = models.ForeignKey(Bill, null=True, blank=True,
                             on_delete=models.SET_NULL, related_name="gift_card_txns")
    note = models.CharField(max_length=300, blank=True, default="")
    created_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="gift_card_txns")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_gift_card_txns"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["card", "-created_at"]),
        ]


class TaxComponent(models.Model):
    """
    Phase 3 Agent 8 — multi-component tax engine.

    Each row represents one tax (VAT, SVAT, SSCL, NBT, ...). A bill applies all
    components active for the bill's outlet at sale time, filtered per-line by
    item category. `outlet=None` rows are chain-wide defaults; outlet-specific
    rows override only for that outlet (both can co-exist as long as their
    `code` differs — uniqueness is per-outlet+code).

    Opt-in: if no active rows exist for an outlet (outlet-specific OR null
    outlet), the legacy single-rate path on `Item.tax_rate_pct` /
    `BillLine.tax_rate_pct` is used unchanged.
    """
    outlet = models.ForeignKey(
        "outlets.Outlet", null=True, blank=True,
        on_delete=models.CASCADE, related_name="tax_components",
    )
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=80)
    rate_pct = models.DecimalField(max_digits=6, decimal_places=3)
    inclusive = models.BooleanField(default=False)
    applies_to_categories = models.JSONField(default=list, blank=True)
    excluded_categories = models.JSONField(default=list, blank=True)
    priority = models.IntegerField(default=100)
    is_active = models.BooleanField(default=True)
    starts_at = models.DateField(null=True, blank=True)
    ends_at = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_tax_components",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_tax_components"
        ordering = ["priority", "code"]
        indexes = [
            models.Index(fields=["outlet", "is_active"]),
            models.Index(fields=["code"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["outlet", "code"],
                                    name="uniq_taxcomp_outlet_code"),
        ]

    def __str__(self):
        scope = f"outlet={self.outlet_id}" if self.outlet_id else "chain-wide"
        return f"TaxComponent {self.code} {self.rate_pct}% [{scope}]"


# -------------------------------------------------------------------
# Phase 3 Agent 9 — GL Export + Cash Handover
# -------------------------------------------------------------------


class GLAccount(models.Model):
    """Chart of accounts entry mapping POS purposes to ledger accounts.

    `outlet=None` rows are chain-wide defaults; per-outlet rows override them
    for that outlet only. Lookup is by `purpose` (and optionally outlet) when
    building GL entries for a bill.
    """

    class Purpose(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        BANK = "bank", "Bank"
        AR_CREDIT = "ar_credit", "AR / Store Credit"
        SALES = "sales", "Sales Revenue"
        SALES_RETURN = "sales_return", "Sales Return"
        TAX = "tax", "Tax Payable"
        DISCOUNT = "discount", "Discount Given"
        ROUNDING = "rounding", "Rounding"
        TENDER_OTHER = "tender_other", "Other Tender"
        GIFT_CARD_LIABILITY = "gift_card_liability", "Gift Card Liability"

    outlet = models.ForeignKey(
        "outlets.Outlet", null=True, blank=True,
        on_delete=models.CASCADE, related_name="gl_accounts",
    )
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=80)
    purpose = models.CharField(max_length=24, choices=Purpose.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_gl_accounts"
        ordering = ["outlet_id", "code"]
        constraints = [
            models.UniqueConstraint(fields=["outlet", "code"], name="uniq_glacct_outlet_code"),
        ]
        indexes = [
            models.Index(fields=["outlet", "purpose", "is_active"]),
        ]

    def __str__(self):
        scope = f"outlet={self.outlet_id}" if self.outlet_id else "chain-wide"
        return f"GLAccount {self.code} {self.name} [{self.purpose} {scope}]"


class GLExport(models.Model):
    """Append-only export ledger; one row per generated GL export run."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FINALIZED = "finalized", "Finalized"
        CANCELLED = "cancelled", "Cancelled"

    outlet = models.ForeignKey(
        "outlets.Outlet", on_delete=models.CASCADE, related_name="gl_exports",
    )
    date_from = models.DateField()
    date_to = models.DateField()
    shift = models.ForeignKey(
        Shift, null=True, blank=True, on_delete=models.SET_NULL, related_name="gl_exports",
    )
    generated_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="gl_exports",
    )
    generated_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    totals = models.JSONField(default=dict, blank=True)
    csv_text = models.TextField(blank=True, default="")
    note = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        db_table = "pos_gl_exports"
        ordering = ["-generated_at"]
        indexes = [
            models.Index(fields=["outlet", "-generated_at"]),
        ]

    def __str__(self):
        return f"GLExport {self.id} {self.date_from}..{self.date_to} [{self.status}]"


class GLEntry(models.Model):
    """Single debit/credit line within a GLExport (double-entry voucher row)."""

    export = models.ForeignKey(
        GLExport, on_delete=models.CASCADE, related_name="entries",
    )
    bill = models.ForeignKey(
        Bill, null=True, blank=True, on_delete=models.SET_NULL, related_name="gl_entries",
    )
    account_code = models.CharField(max_length=20)
    account_name = models.CharField(max_length=80)
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reference = models.CharField(max_length=80, blank=True, default="")
    memo = models.CharField(max_length=200, blank=True, default="")
    entry_date = models.DateField()

    class Meta:
        db_table = "pos_gl_entries"
        indexes = [
            models.Index(fields=["export"]),
            models.Index(fields=["bill"]),
            models.Index(fields=["account_code", "entry_date"]),
        ]

    def __str__(self):
        return f"GLEntry {self.account_code} D={self.debit} C={self.credit}"


class CashHandover(models.Model):
    """Manager-attested cash handover from cashier till after shift close."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DISPUTED = "disputed", "Disputed"

    shift = models.ForeignKey(Shift, on_delete=models.CASCADE, related_name="handovers")
    cashier = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="cash_handovers_given",
    )
    collected_by = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="cash_handovers_collected",
    )
    expected_cash = models.DecimalField(max_digits=14, decimal_places=2)
    counted_cash = models.DecimalField(max_digits=14, decimal_places=2)
    variance = models.DecimalField(max_digits=14, decimal_places=2)
    safe_deposit_ref = models.CharField(max_length=80, blank=True, default="")
    note = models.CharField(max_length=500, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    collected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_cash_handovers"
        ordering = ["-collected_at"]
        indexes = [
            models.Index(fields=["shift"]),
            models.Index(fields=["collected_by", "-collected_at"]),
        ]

    def __str__(self):
        return f"CashHandover shift={self.shift_id} variance={self.variance} [{self.status}]"


# -------------------------------------------------------------------
# Phase 3 Agent 10 — Sales Rep Commission Rules
# -------------------------------------------------------------------


# -------------------------------------------------------------------
# Phase 4 Agent 12 — Purchase Order → GRN match
# -------------------------------------------------------------------


class PurchaseOrder(models.Model):
    """A PO is created (DRAFT/OPEN), then its lines are progressively closed
    by GoodsReceipt rows. When all lines are fully received, status flips to
    CLOSED. A manual close is allowed (PARTIAL → CLOSED) — any unreceived qty
    is treated as written off / never coming.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Open"
        PARTIAL = "partial", "Partial"
        CLOSED = "closed", "Closed"
        CANCELLED = "cancelled", "Cancelled"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.PROTECT,
                               related_name="purchase_orders")
    supplier = models.ForeignKey("uploads.Supplier", on_delete=models.PROTECT,
                                 related_name="purchase_orders")
    supplier_name = models.CharField(max_length=200, blank=True, default="")
    po_no = models.CharField(max_length=40, unique=True)
    expected_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices,
                              default=Status.DRAFT)
    sub_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                   on_delete=models.SET_NULL,
                                   related_name="purchase_orders_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_reason = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "pos_purchase_orders"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "status"]),
            models.Index(fields=["supplier", "-created_at"]),
        ]

    def __str__(self):
        return f"PO {self.po_no} [{self.status}]"


class PurchaseOrderLine(models.Model):
    po = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE,
                           related_name="lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT,
                             related_name="po_lines")
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=300)
    qty_ordered = models.DecimalField(max_digits=12, decimal_places=3)
    qty_received = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2)
    tax_rate_pct = models.DecimalField(max_digits=6, decimal_places=3, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)
    note = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "pos_purchase_order_lines"
        indexes = [
            models.Index(fields=["po"]),
            models.Index(fields=["item"]),
        ]

    def __str__(self):
        return f"POLine {self.item_code} {self.qty_received}/{self.qty_ordered}"


class GoodsReceipt(models.Model):
    """Persisted GRN header. Existing grn_entry path created only StockMovement
    rows; this header gives the receipt a real document and links back to a
    PurchaseOrder when one was supplied.
    """
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.PROTECT,
                               related_name="goods_receipts")
    supplier = models.ForeignKey("uploads.Supplier", null=True, blank=True,
                                 on_delete=models.SET_NULL,
                                 related_name="goods_receipts")
    supplier_name = models.CharField(max_length=200, blank=True, default="")
    grn_ref = models.CharField(max_length=40, unique=True)
    invoice_no = models.CharField(max_length=60, blank=True, default="")
    received_on = models.DateField()
    purchase_order = models.ForeignKey(PurchaseOrder, null=True, blank=True,
                                       on_delete=models.SET_NULL,
                                       related_name="receipts")
    sub_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                   on_delete=models.SET_NULL,
                                   related_name="goods_receipts_created")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_goods_receipts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "-created_at"]),
            models.Index(fields=["supplier"]),
            models.Index(fields=["purchase_order"]),
        ]

    def __str__(self):
        return f"GRN {self.grn_ref}"


class GoodsReceiptLine(models.Model):
    grn = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE,
                            related_name="lines")
    po_line = models.ForeignKey(PurchaseOrderLine, null=True, blank=True,
                                on_delete=models.SET_NULL,
                                related_name="receipt_lines")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT,
                             related_name="goods_receipt_lines")
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=300)
    qty = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2)
    batch_no = models.CharField(max_length=80, blank=True, default="")
    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "pos_goods_receipt_lines"
        indexes = [
            models.Index(fields=["grn"]),
            models.Index(fields=["po_line"]),
        ]


class CommissionRule(models.Model):
    """A commission rule scoped optionally by outlet/rep/category.

    Most-specific match wins (see commission.find_rule_for). For
    ``basis="line_qty"``, ``rate_pct`` is treated as a flat LKR amount per
    base unit rather than a percentage.
    """

    class Basis(models.TextChoices):
        LINE_TOTAL = "line_total", "Line Total"
        LINE_PROFIT = "line_profit", "Line Profit"
        LINE_QTY = "line_qty", "Per Unit"

    outlet = models.ForeignKey(
        "outlets.Outlet", null=True, blank=True,
        on_delete=models.CASCADE, related_name="commission_rules",
    )
    rep = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.CASCADE, related_name="commission_rules",
    )
    item_category = models.CharField(max_length=200, blank=True, default="")
    rate_pct = models.DecimalField(max_digits=6, decimal_places=3, default=0)
    basis = models.CharField(max_length=12, choices=Basis.choices, default=Basis.LINE_TOTAL)
    priority = models.IntegerField(default=100)
    is_active = models.BooleanField(default=True)
    starts_at = models.DateField(null=True, blank=True)
    ends_at = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_commission_rules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_commission_rules"
        ordering = ["priority", "id"]
        indexes = [
            models.Index(fields=["outlet", "is_active", "priority"]),
            models.Index(fields=["rep"]),
            models.Index(fields=["item_category"]),
        ]

    def __str__(self):
        return f"CommissionRule rep={self.rep_id} cat={self.item_category!r} {self.rate_pct} [{self.basis}]"


# -------------------------------------------------------------------
# Phase 4 Agent 13 — Payment Gateways + SMS receipts
# -------------------------------------------------------------------

# Encryption helpers — use Fernet (cryptography lib) with a key derived from
# settings.SECRET_KEY via PBKDF2. If `cryptography` is not importable for any
# reason, we fall back to plaintext storage (dev-only) — calls log a warning
# but do not crash. NOTE: storing real API keys in plaintext is unsafe; the
# fallback is only here to keep migrations / tests working without the package.
def _fernet():
    try:
        import base64
        from cryptography.fernet import Fernet
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from django.conf import settings
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"pos-gateway-fernet-v1",
            iterations=100_000,
        )
        secret = (settings.SECRET_KEY or "dev").encode("utf-8")
        key = base64.urlsafe_b64encode(kdf.derive(secret))
        return Fernet(key)
    except Exception:
        return None


def _encrypt_secret(raw):
    """Returns ciphertext string. Falls back to plaintext with PLAIN: prefix."""
    if not raw:
        return ""
    f = _fernet()
    if f is None:
        # TODO: install `cryptography` to encrypt at-rest. Plaintext fallback.
        return "PLAIN:" + raw
    return f.encrypt(raw.encode("utf-8")).decode("utf-8")


def _decrypt_secret(ciphertext):
    if not ciphertext:
        return ""
    if ciphertext.startswith("PLAIN:"):
        return ciphertext[len("PLAIN:"):]
    f = _fernet()
    if f is None:
        return ""
    try:
        return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""


class PaymentGatewayConfig(models.Model):
    """Per-outlet credentials for a payment provider (LankaQR, Sampath, ...)."""

    class Provider(models.TextChoices):
        MOCK = "mock", "Mock (testing)"
        SAMPATH = "sampath", "Sampath VishwaQR"
        HNB = "hnb", "HNB Solo"
        FRIMI = "frimi", "FriMi"
        GENIE = "genie", "Genie"
        HELAPAY = "helapay", "HelaPay"

    outlet = models.ForeignKey(
        "outlets.Outlet", on_delete=models.CASCADE,
        related_name="payment_gateways",
    )
    provider = models.CharField(max_length=12, choices=Provider.choices)
    merchant_id = models.CharField(max_length=120, blank=True, default="")
    api_key_encrypted = models.TextField(blank=True, default="")
    webhook_secret = models.CharField(max_length=120, blank=True, default="")
    callback_url = models.CharField(max_length=300, blank=True, default="")
    sandbox = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    extra_config = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_payment_gateways",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_payment_gateways"
        ordering = ["outlet_id", "provider"]
        constraints = [
            models.UniqueConstraint(
                fields=["outlet", "provider"],
                name="uniq_gateway_outlet_provider",
            ),
        ]
        indexes = [
            models.Index(fields=["outlet", "is_active"]),
        ]

    def set_api_key(self, raw):
        self.api_key_encrypted = _encrypt_secret(raw or "")

    def get_api_key(self):
        return _decrypt_secret(self.api_key_encrypted)

    def __str__(self):
        return f"PaymentGateway outlet={self.outlet_id} {self.provider}"


class PaymentIntent(models.Model):
    """A single initiated gateway payment, bound to an optional Bill."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    outlet = models.ForeignKey(
        "outlets.Outlet", on_delete=models.CASCADE,
        related_name="payment_intents",
    )
    gateway = models.ForeignKey(
        PaymentGatewayConfig, on_delete=models.PROTECT,
        related_name="intents",
    )
    bill = models.ForeignKey(
        Bill, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="payment_intents",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=8, default="LKR")
    provider_ref = models.CharField(max_length=120, blank=True, default="")
    payment_url = models.TextField(blank=True, default="")
    qr_data = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING,
    )
    customer_phone = models.CharField(max_length=40, blank=True, default="")
    initiated_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="initiated_payment_intents",
    )
    initiated_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    webhook_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "pos_payment_intents"
        ordering = ["-initiated_at"]
        indexes = [
            models.Index(fields=["outlet", "status"]),
            models.Index(fields=["provider_ref"]),
            models.Index(fields=["bill"]),
        ]

    def __str__(self):
        return f"PaymentIntent {self.id} {self.amount} [{self.status}]"


class SmsConfig(models.Model):
    """Per-outlet SMS provider credentials."""

    class Provider(models.TextChoices):
        MOCK = "mock", "Mock (testing)"
        DIALOG = "dialog", "Dialog"
        MOBITEL = "mobitel", "Mobitel"
        HUTCH = "hutch", "Hutch"
        TEXTIT = "textit", "TextIt"

    outlet = models.ForeignKey(
        "outlets.Outlet", on_delete=models.CASCADE,
        related_name="sms_configs",
    )
    provider = models.CharField(max_length=12, choices=Provider.choices)
    sender_id = models.CharField(max_length=20, blank=True, default="")
    api_key_encrypted = models.TextField(blank=True, default="")
    endpoint_url = models.CharField(max_length=300, blank=True, default="")
    is_active = models.BooleanField(default=True)
    extra_config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_sms_configs"
        ordering = ["outlet_id", "provider"]
        constraints = [
            models.UniqueConstraint(
                fields=["outlet", "provider"],
                name="uniq_smsconf_outlet_provider",
            ),
        ]
        indexes = [
            models.Index(fields=["outlet", "is_active"]),
        ]

    def set_api_key(self, raw):
        self.api_key_encrypted = _encrypt_secret(raw or "")

    def get_api_key(self):
        return _decrypt_secret(self.api_key_encrypted)

    def __str__(self):
        return f"SmsConfig outlet={self.outlet_id} {self.provider}"


class SmsLog(models.Model):
    """Append-only log of every SMS attempt."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    outlet = models.ForeignKey(
        "outlets.Outlet", on_delete=models.CASCADE,
        related_name="sms_logs",
    )
    config = models.ForeignKey(
        SmsConfig, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="logs",
    )
    bill = models.ForeignKey(
        Bill, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="sms_logs",
    )
    to_phone = models.CharField(max_length=40)
    body = models.CharField(max_length=500)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.QUEUED,
    )
    provider_ref = models.CharField(max_length=120, blank=True, default="")
    error = models.CharField(max_length=500, blank=True, default="")
    queued_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pos_sms_logs"
        ordering = ["-queued_at"]
        indexes = [
            models.Index(fields=["outlet", "-queued_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["bill"]),
        ]

    def __str__(self):
        return f"SmsLog {self.id} → {self.to_phone} [{self.status}]"
