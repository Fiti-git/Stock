"""
Stock movement ledger.

Append-only event log: every physical inventory change writes one row, and
on-hand at any timestamp = SUM(qty) up to that point. Source of truth for
unified POS / Stock / Ecom inventory.

Design rules:
  1. Rows are immutable. Corrections are NEW offsetting rows — never UPDATE
     and never DELETE.
  2. Every row is idempotent on (source_table, source_id) so replays from
     signals or the backfill command can never double-count.
  3. Existing tables (sales_lines, grn_lines, etc.) are NOT modified — they
     remain the producers; this ledger consumes from them via signals.
"""
from django.db import models


class StockMovement(models.Model):
    class MovementType(models.TextChoices):
        OPENING_BALANCE = "opening_balance", "Opening Balance"
        GRN = "grn", "GRN (Receipt)"
        SALE = "sale", "Sale"
        SALES_RETURN = "sales_return", "Sales Return"
        DAMAGE = "damage", "Damage / Wastage"
        OFFICE_USE = "office_use", "Office Use"
        RTS = "rts", "Return to Supplier"
        TRANSFER_OUT = "transfer_out", "Transfer Out"
        TRANSFER_IN = "transfer_in", "Transfer In"
        COUNT_ADJUST = "count_adjust", "Count Adjustment"
        MANUAL_ADJUST = "manual_adjust", "Manual Adjustment"

    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    item = models.ForeignKey(
        "items.Item",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)

    source_table = models.CharField(max_length=40, db_index=True)
    source_id = models.BigIntegerField()
    source_doc = models.CharField(max_length=80, blank=True, default="")

    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    batch_id = models.CharField(max_length=60, blank=True, default="")
    expiry_date = models.DateField(null=True, blank=True)

    moved_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stock_movements",
    )
    notes = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "stock_movements"
        ordering = ["-moved_at", "-id"]
        indexes = [
            models.Index(fields=["outlet", "item", "moved_at"]),
            models.Index(fields=["outlet", "moved_at"]),
            models.Index(fields=["movement_type"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["source_table", "source_id", "movement_type"],
                name="uniq_movement_source",
            ),
        ]

    def __str__(self):
        sign = "+" if self.qty >= 0 else ""
        return f"{self.movement_type} {sign}{self.qty} item={self.item_id}@outlet={self.outlet_id}"


class StockBalance(models.Model):
    """
    Cached on-hand per (outlet, item). Rebuildable at any time from the
    movement ledger — the ledger is the source of truth, this is a fast
    point-lookup cache. Updated by post-save on StockMovement.
    """
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="stock_balances")
    item = models.ForeignKey("items.Item", on_delete=models.CASCADE, related_name="stock_balances")
    on_hand = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    last_movement_at = models.DateTimeField(null=True, blank=True)
    last_movement_id = models.BigIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stock_balances"
        constraints = [
            models.UniqueConstraint(fields=["outlet", "item"], name="uniq_balance_outlet_item"),
        ]
        indexes = [
            models.Index(fields=["outlet", "item"]),
        ]

    def __str__(self):
        return f"Balance outlet={self.outlet_id} item={self.item_id} on_hand={self.on_hand}"


class StockReservation(models.Model):
    """
    Soft hold on inventory for an open ecom cart/order. Does NOT write to
    the ledger. `available = on_hand - SUM(active reservations)`. On payment
    success the reservation is marked `consumed` AND a real `sale` movement
    is appended to the ledger. Phase 0 ships the schema; Phase 2 wires it.
    """
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CONSUMED = "consumed", "Consumed"
        EXPIRED = "expired", "Expired"
        RELEASED = "released", "Released"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="stock_reservations")
    item = models.ForeignKey("items.Item", on_delete=models.CASCADE, related_name="stock_reservations")
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)

    # Polymorphic reference to whichever order/cart owns the hold. Phase 2
    # adds ecom_orders / ecom_carts; we store the table+id so this model is
    # not coupled to those apps yet.
    owner_table = models.CharField(max_length=40, blank=True, default="")
    owner_id = models.BigIntegerField(null=True, blank=True)

    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "stock_reservations"
        indexes = [
            models.Index(fields=["outlet", "item", "status"]),
            models.Index(fields=["status", "expires_at"]),
            models.Index(fields=["owner_table", "owner_id"]),
        ]
