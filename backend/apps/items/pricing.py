"""Price update helper — atomic, logs to ItemPriceHistory."""
from decimal import Decimal
from django.db import transaction

from .models import Item, ItemPriceHistory


@transaction.atomic
def set_prices(*, item, outlet=None, new_sell=None, new_cost=None, user=None, source="manual", note=""):
    """Update an item's sell/cost price and log the change."""
    locked = Item.objects.select_for_update().get(pk=item.pk)
    old_sell = locked.sell_price
    old_cost = None  # cost isn't stored on Item; it's on PosSnapshot / GRN. We keep old_cost=null for now.
    fields = []
    if new_sell is not None and Decimal(new_sell) != (locked.sell_price or Decimal("0")):
        locked.sell_price = Decimal(new_sell)
        fields.append("sell_price")
    if fields:
        locked.save(update_fields=fields)
        ItemPriceHistory.objects.create(
            item=locked, outlet=outlet or locked.outlet,
            old_sell=old_sell, new_sell=locked.sell_price,
            old_cost=old_cost, new_cost=Decimal(new_cost) if new_cost is not None else None,
            source=source, note=note,
            changed_by=user if (user and user.is_authenticated) else None,
        )
    return locked
