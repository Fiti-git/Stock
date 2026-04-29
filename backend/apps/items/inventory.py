"""
Inventory helpers. All stock changes flow through apply_movement() so
Item.on_hand and StockMovement stay in sync, under a transaction + row lock.
"""
from decimal import Decimal
from django.db import transaction
from django.db.models import F

from .models import Item, StockMovement, ItemBatch, BatchMovement


@transaction.atomic
def apply_movement(*, item, outlet, kind, qty_change, user=None,
                   unit_cost=None, ref_type="", ref_id="", note=""):
    """
    Atomically apply a stock change. Returns the StockMovement.
    qty_change is signed: sales negative, receipts positive.
    """
    # Lock the row
    locked = Item.objects.select_for_update().get(pk=item.pk)
    new_balance = (locked.on_hand or Decimal("0")) + Decimal(qty_change)
    Item.objects.filter(pk=item.pk).update(on_hand=F("on_hand") + Decimal(qty_change))
    mv = StockMovement.objects.create(
        outlet=outlet, item=locked, kind=kind,
        qty_change=Decimal(qty_change), balance_after=new_balance,
        unit_cost=Decimal(unit_cost) if unit_cost is not None else None,
        ref_type=ref_type, ref_id=str(ref_id or ""),
        note=note, created_by=user if (user and user.is_authenticated) else None,
    )
    return mv


def consume_fefo(*, item, qty, user=None, ref_type="", ref_id=""):
    """
    Consume `qty` from this item's active batches, earliest expiry first.

    Returns a list of (batch, qty_consumed) tuples. Caller must already be
    inside a transaction.atomic() block. Each batch row is locked with
    select_for_update before mutation. Raises ValueError if there isn't
    enough batched stock — caller decides whether to fall back to a
    non-batch consumption path (legacy items without batches).
    """
    qty = Decimal(qty)
    if qty <= 0:
        return []
    # FEFO: earliest expiry first; null expiry treated as far-future; tie-break on id.
    batches = list(
        ItemBatch.objects.select_for_update()
        .filter(item=item, is_active=True, qty__gt=0)
        .extra(select={"_exp_null": "expiry_date IS NULL"})
        .order_by("_exp_null", "expiry_date", "id")
    )
    available = sum((b.qty for b in batches), Decimal("0"))
    if available < qty:
        raise ValueError(
            f"Insufficient batched stock for item {item.pk}: have {available}, need {qty}"
        )

    consumed = []
    remaining = qty
    for b in batches:
        if remaining <= 0:
            break
        take = min(b.qty, remaining)
        if take <= 0:
            continue
        b.qty = b.qty - take
        b.save(update_fields=["qty", "updated_at"])
        BatchMovement.objects.create(
            batch=b,
            qty_change=-take,
            balance_after=b.qty,
            kind="sale",
            ref_type=ref_type, ref_id=str(ref_id or ""),
            created_by=user if (user and user.is_authenticated) else None,
        )
        consumed.append((b, take))
        remaining -= take
    return consumed


def current_stock(item):
    item.refresh_from_db(fields=["on_hand"])
    return item.on_hand
