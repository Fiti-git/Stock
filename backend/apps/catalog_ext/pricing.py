"""
Storefront price resolution.

For each Item, walks active PriceList rows in priority order (lower first)
and returns the first match. Falls back to None — caller decides whether
to hide the product or show "POA".

Designed to be called once per request with a list of item IDs (cached
per-request) so list pages don't N+1 the DB.
"""
from django.db.models import Q
from django.utils import timezone

from .models import PriceList, PriceListItem


def resolve_prices(item_ids):
    """
    Return {item_id: {"unit_price", "compare_at_price", "currency",
                      "price_list_code"}} for every item that has a match.
    """
    if not item_ids:
        return {}

    now = timezone.now()
    lists = (
        PriceList.objects
        .filter(is_active=True)
        .filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now))
        .filter(Q(ends_at__isnull=True) | Q(ends_at__gte=now))
        .order_by("priority", "id")
        .values("id", "code", "currency")
    )
    if not lists:
        return {}

    list_ids = [l["id"] for l in lists]
    list_meta = {l["id"]: l for l in lists}

    rows = (
        PriceListItem.objects
        .filter(price_list_id__in=list_ids, item_id__in=item_ids, is_active=True)
        .values("price_list_id", "item_id", "unit_price", "compare_at_price")
    )

    # Bucket by item, keep highest-priority (smallest priority value) match.
    by_item = {}
    list_priority = {l["id"]: idx for idx, l in enumerate(lists)}
    for r in rows:
        iid = r["item_id"]
        prio = list_priority[r["price_list_id"]]
        cur = by_item.get(iid)
        if cur is None or prio < cur[0]:
            meta = list_meta[r["price_list_id"]]
            by_item[iid] = (prio, {
                "unit_price": str(r["unit_price"]),
                "compare_at_price": (str(r["compare_at_price"])
                                     if r["compare_at_price"] is not None else None),
                "currency": meta["currency"],
                "price_list_code": meta["code"],
            })
    return {iid: payload for iid, (_, payload) in by_item.items()}
