"""
Background tasks for the inventory ledger.

Phase 0:
  - rebuild_balances: hourly snapshot of stock_balances from the ledger.
  - expire_stale_reservations: every minute, flip ACTIVE → EXPIRED.

Both are no-ops if INVENTORY_LEDGER_ENABLED=False, so they are safe to
schedule from day one — they will start doing real work only after the
backfill is verified and the flag is flipped on.
"""
from decimal import Decimal

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import StockBalance, StockMovement, StockReservation


@shared_task(name="apps.inventory.tasks.rebuild_balances")
def rebuild_balances():
    if not getattr(settings, "INVENTORY_LEDGER_ENABLED", False):
        return {"skipped": True, "reason": "ledger disabled"}

    with transaction.atomic():
        agg = (
            StockMovement.objects
            .values("outlet_id", "item_id")
            .annotate(on_hand=Sum("qty"))
        )
        # Idempotent upsert per row.
        n = 0
        for r in agg.iterator(chunk_size=2000):
            StockBalance.objects.update_or_create(
                outlet_id=r["outlet_id"],
                item_id=r["item_id"],
                defaults={
                    "on_hand": r["on_hand"] or Decimal("0"),
                    "last_movement_at": timezone.now(),
                },
            )
            n += 1
    return {"rebuilt": n}


@shared_task(name="apps.inventory.tasks.expire_stale_reservations")
def expire_stale_reservations():
    if not getattr(settings, "INVENTORY_LEDGER_ENABLED", False):
        return {"skipped": True}

    now = timezone.now()
    n = StockReservation.objects.filter(
        status=StockReservation.Status.ACTIVE,
        expires_at__lte=now,
    ).update(status=StockReservation.Status.EXPIRED)
    return {"expired": n}
