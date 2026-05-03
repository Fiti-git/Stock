"""
Phase 0 inventory app — auxiliary tables only.

IMPORTANT: The append-only ledger ALREADY EXISTS at apps.items.StockMovement,
written by apps.items.inventory.apply_movement(). This app does not redefine
that model. It adds:

  - StockBalance:    rebuildable cache of current on-hand per (outlet, item)
  - StockReservation: soft holds for ecom checkout (consumed in Phase 2)

The signals + backfill in this package are scaffolding for a follow-up that
will route producer events into items.StockMovement consistently. They are
currently dormant (gated by INVENTORY_LEDGER_ENABLED=False) — see signals.py
and management/commands/backfill_movements.py.
"""
from django.db import models


class StockBalance(models.Model):
    """
    Cached on-hand per (outlet, item). Rebuildable at any time from
    items.StockMovement — that ledger is the source of truth.
    """
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE,
                               related_name="inventory_balances")
    item = models.ForeignKey("items.Item", on_delete=models.CASCADE,
                             related_name="inventory_balances")
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
    success the reservation is marked `consumed` AND a real movement is
    appended to items.StockMovement via apply_movement(). Phase 0 ships
    the schema; Phase 2 wires it.
    """
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CONSUMED = "consumed", "Consumed"
        EXPIRED = "expired", "Expired"
        RELEASED = "released", "Released"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE,
                               related_name="inventory_reservations")
    item = models.ForeignKey("items.Item", on_delete=models.CASCADE,
                             related_name="inventory_reservations")
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)

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
