"""
Ecommerce domain models. Additive — every FK points outward into existing
apps (pos.Customer, items.Item, outlets.Outlet, inventory.StockReservation),
nothing in those apps points back here.

Design rules:
  1. Address + price are SNAPSHOTTED into the order at checkout time so
     later edits to master data don't rewrite history.
  2. Status is a single linear enum per row; transitions logged via
     `created_at`/`paid_at`/`fulfilled_at`/etc. timestamps.
  3. Carts can be guest (session_token) or customer-bound (FK pos.Customer).
     Both paths converge in EcomOrder.
  4. Stock is held via inventory.StockReservation during checkout, then
     committed to items.StockMovement (the canonical ledger) when payment
     succeeds — via apps.items.inventory.apply_movement().
"""
from django.db import models


class EcomAddress(models.Model):
    customer = models.ForeignKey(
        "pos.Customer", on_delete=models.CASCADE, related_name="ecom_addresses",
    )
    label = models.CharField(max_length=40, blank=True, default="")
    recipient_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40, blank=True, default="")
    line1 = models.CharField(max_length=200)
    line2 = models.CharField(max_length=200, blank=True, default="")
    city = models.CharField(max_length=80)
    postal_code = models.CharField(max_length=20, blank=True, default="")
    country = models.CharField(max_length=2, default="LK")
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ecom_addresses"
        ordering = ["-is_default", "-updated_at"]
        indexes = [
            models.Index(fields=["customer", "is_default"]),
        ]

    def to_snapshot(self):
        """Return an inline JSON dict suitable for snapshotting onto an order."""
        return {
            "label": self.label,
            "recipient_name": self.recipient_name,
            "phone": self.phone,
            "line1": self.line1,
            "line2": self.line2,
            "city": self.city,
            "postal_code": self.postal_code,
            "country": self.country,
        }


class EcomCart(models.Model):
    """
    A shopping cart. Guests use `session_token` to identify; logged-in
    customers use `customer`. Both can coexist (cart is created on guest
    visit; customer login merges or claims it later).
    """
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CONVERTED = "converted", "Converted to Order"
        ABANDONED = "abandoned", "Abandoned"
        EXPIRED = "expired", "Expired"

    outlet = models.ForeignKey(
        "outlets.Outlet", on_delete=models.PROTECT, related_name="ecom_carts",
    )
    customer = models.ForeignKey(
        "pos.Customer", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="ecom_carts",
    )
    session_token = models.CharField(max_length=64, unique=True, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    last_activity_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ecom_carts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "last_activity_at"]),
            models.Index(fields=["customer", "status"]),
        ]

    def __str__(self):
        return f"Cart {self.session_token[:8]}.. ({self.status})"


class EcomCartItem(models.Model):
    cart = models.ForeignKey(EcomCart, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, related_name="ecom_cart_items",
    )
    qty = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    # Soft-hold against on_hand. Created at checkout, NOT at add-to-cart
    # (so window-shoppers don't starve real buyers). Cleared on cart abandon.
    reservation = models.ForeignKey(
        "inventory.StockReservation", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="cart_items",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ecom_cart_items"
        constraints = [
            models.UniqueConstraint(fields=["cart", "item"], name="uniq_cart_item"),
        ]
        indexes = [
            models.Index(fields=["cart"]),
        ]


class EcomOrder(models.Model):
    """
    A placed order. Created from a cart at checkout; immutable once paid
    (refunds and returns get their own rows / status transitions).
    """
    class Status(models.TextChoices):
        PENDING_PAYMENT = "pending_payment", "Pending Payment"
        PAID = "paid", "Paid"
        FULFILLING = "fulfilling", "Fulfilling"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    number = models.CharField(max_length=32, unique=True, db_index=True)
    outlet = models.ForeignKey(
        "outlets.Outlet", on_delete=models.PROTECT, related_name="ecom_orders",
    )
    cart = models.ForeignKey(
        EcomCart, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="orders",
    )
    customer = models.ForeignKey(
        "pos.Customer", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="ecom_orders",
    )
    # Guest-checkout fallback fields (used when customer is null).
    guest_name = models.CharField(max_length=120, blank=True, default="")
    guest_email = models.CharField(max_length=255, blank=True, default="")
    guest_phone = models.CharField(max_length=40, blank=True, default="")

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING_PAYMENT,
        db_index=True,
    )

    # Address snapshots — frozen at order creation.
    shipping_address = models.JSONField(default=dict, blank=True)
    billing_address = models.JSONField(default=dict, blank=True)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    shipping_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, default="LKR")

    # Payment linkage. We keep both: a free-text gateway intent id (cheap
    # to populate at checkout, before pos.PaymentIntent rows exist for ecom)
    # and a FK to pos.Payment once the payment is actually captured.
    payment_intent_ref = models.CharField(max_length=120, blank=True, default="")
    payment = models.ForeignKey(
        "pos.Payment", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="ecom_orders",
    )

    notes = models.CharField(max_length=500, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    fulfilled_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ecom_orders"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "status"]),
            models.Index(fields=["customer", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.number} ({self.status})"


class EcomOrderLine(models.Model):
    order = models.ForeignKey(EcomOrder, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, related_name="ecom_order_lines",
    )
    # Snapshots — keep history readable even if the master changes.
    item_code_snapshot = models.CharField(max_length=50)
    item_name_snapshot = models.CharField(max_length=300)

    qty = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    line_subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)

    # Set when the order is paid → ledger movement is written.
    is_committed = models.BooleanField(default=False)
    committed_at = models.DateTimeField(null=True, blank=True)
    # Reservation that backed this line during checkout (CONSUMED on payment).
    reservation = models.ForeignKey(
        "inventory.StockReservation", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="order_lines",
    )

    class Meta:
        db_table = "ecom_order_lines"
        indexes = [
            models.Index(fields=["order"]),
            models.Index(fields=["item"]),
            models.Index(fields=["is_committed"]),
        ]
