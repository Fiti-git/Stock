"""
Phase 0 producer signals — DEFERRED.

The append-only stock ledger lives at apps.items.StockMovement and is
already written by apps.items.inventory.apply_movement() for POS / GRN /
return / void / variance flows. Hooking the legacy upload-driven tables
(SalesLine, GrnLine, DamageLine, OfficeLine, RtsLine, SalesReturnLine)
into the same ledger is the next ledger task — it requires field mapping
to (kind, qty_change, balance_after, ref_type, ref_id) and an idempotency
constraint that doesn't exist yet on items.StockMovement.

This module is intentionally empty for now so the inventory app can ship
its useful bits (StockBalance cache, StockReservation table) without
breaking on a stale model reference.
"""

# No signals connected. INVENTORY_LEDGER_ENABLED currently has no effect;
# the real producer wiring will land in a follow-up commit alongside the
# idempotency constraint on items.StockMovement.
