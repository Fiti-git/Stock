"""
Backfill stock movements from legacy upload tables — DEFERRED.

The ledger this command originally targeted was a duplicate of the
already-existing apps.items.StockMovement, which writes via
apps.items.inventory.apply_movement(). Running the original command would
have collided.

The replacement (one-shot historical backfill from sales_lines / grn_lines /
damage_lines / office_lines / rts_lines / sales_return_lines into
items.StockMovement) is the next ledger task. It needs:

  1. An idempotency UNIQUE constraint on items.StockMovement
     (ref_type, ref_id, kind) — added via a separate migration in the items
     app, with idempotent SQL to handle prod-DB drift.
  2. balance_after computed per row in chronological order.
  3. Per-outlet staged rollout (--outlet flag).

Until that lands, this command is a stub that prints what it WILL do.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Backfill historical stock movements (currently deferred — see docstring)."

    def handle(self, *args, **opts):
        self.stdout.write(self.style.WARNING(
            "backfill_movements is deferred.\n"
            "The append-only ledger already exists at apps.items.StockMovement,\n"
            "fed by apps.items.inventory.apply_movement(). Historical backfill\n"
            "from legacy upload tables will land in a follow-up commit once\n"
            "the idempotency constraint and balance_after computation are\n"
            "ready. This command is a stub for now."
        ))
