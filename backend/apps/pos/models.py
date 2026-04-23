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

    class Scope(models.TextChoices):
        ITEM = "item", "Single item"
        CATEGORY = "category", "Category"
        BILL = "bill", "Whole bill"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="promotions")
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=40, blank=True, default="")

    kind = models.CharField(max_length=10, choices=Kind.choices)
    value = models.DecimalField(max_digits=14, decimal_places=2)
    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.BILL)
    item = models.ForeignKey("items.Item", null=True, blank=True, on_delete=models.SET_NULL, related_name="promotions")
    category = models.CharField(max_length=200, blank=True, default="")
    min_bill_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

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
