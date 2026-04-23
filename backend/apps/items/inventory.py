"""
Inventory helpers. All stock changes flow through apply_movement() so
Item.on_hand and StockMovement stay in sync, under a transaction + row lock.
"""
from decimal import Decimal
from django.db import transaction
from django.db.models import F

from .models import Item, StockMovement


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


def current_stock(item):
    item.refresh_from_db(fields=["on_hand"])
    return item.on_hand
