"""
Real Loss freeze — captures the expected qty + txn breakdown for a
StockCount at the moment of submit (or on manual rerun). Once frozen,
the values live on the StockCount row itself so the report reads them
directly with no live compute.

freeze_stock_count(sc) is the single entry point. Safe to call multiple
times; the latest call wins. Returns the (prev, new) tuple so the caller
can log a RerunHistory row.
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.items.models import Item
from apps.uploads.models import (
    PosSnapshot,
    SalesLine, SalesReturnLine, DamageLine, OfficeLine,
    VerificationLine, GrnLine, RtsLine,
)


def _sum_qty(qs):
    total = 0.0
    for v in qs.values_list("qty", flat=True):
        total += float(v or 0)
    return total


def _sum_qty_plus_free(qs):
    total = 0.0
    for row in qs.values("qty", "free_qty"):
        total += float(row["qty"] or 0) + float(row["free_qty"] or 0)
    return total


def _list_txns(qs, extra_free=False):
    """Return an ordered list of {date, qty} dicts for the delta window."""
    out = []
    if extra_free:
        for row in qs.order_by("txn_date").values("txn_date", "qty", "free_qty"):
            qty = float(row["qty"] or 0) + float(row["free_qty"] or 0)
            if qty:
                out.append({"date": str(row["txn_date"]), "qty": qty})
    else:
        for row in qs.order_by("txn_date").values("txn_date", "qty"):
            qty = float(row["qty"] or 0)
            if qty:
                out.append({"date": str(row["txn_date"]), "qty": qty})
    return out


def freeze_stock_count(sc, source="submit"):
    """
    Compute + persist real_expected_qty, real_variance, real_value,
    real_txn_breakdown for one StockCount. Idempotent.

    Returns (prev_snapshot, new_snapshot) where each snapshot is a dict:
      {"expected": Decimal|None, "variance": Decimal|None,
       "value": Decimal|None, "source": str}
    """
    prev = {
        "expected": sc.real_expected_qty,
        "variance": sc.real_variance,
        "value": sc.real_value,
        "source": sc.real_freeze_source or "",
    }

    # Anchor must exist to reconcile. If not, blank the fields so the UI
    # honestly says "—" and prompts a Rerun once a snapshot exists.
    anchor_qty = sc.pos_qty_at_count
    anchor_snap = sc.pos_snapshot_at_count
    if anchor_qty is None or anchor_snap is None:
        sc.real_expected_qty = None
        sc.real_variance = None
        sc.real_value = None
        sc.real_freeze_at = timezone.now()
        sc.real_freeze_source = source
        sc.real_txn_breakdown = None
        sc.save(update_fields=[
            "real_expected_qty", "real_variance", "real_value",
            "real_freeze_at", "real_freeze_source", "real_txn_breakdown",
        ])
        new = {"expected": None, "variance": None, "value": None, "source": source}
        return prev, new

    anchor_date = anchor_snap.snapshot_date
    day_from = anchor_date + timedelta(days=1)
    day_to = sc.count_date

    # Resolve item_code + cost from the item (fresh read).
    it = Item.objects.only("item_code", "cost_price").get(pk=sc.item_id)
    code = it.item_code
    # Cost basis: latest snapshot's cost_price; fall back to item master.
    latest = (
        PosSnapshot.objects
        .filter(outlet_id=sc.outlet_id, item_id=sc.item_id)
        .order_by("-snapshot_date")
        .only("cost_price")
        .first()
    )
    cost = None
    if latest and latest.cost_price is not None:
        cost = float(latest.cost_price)
    else:
        cost = float(it.cost_price or 0)

    common = dict(
        outlet_id=sc.outlet_id, item_code=code,
        txn_date__gte=day_from, txn_date__lte=day_to,
    )
    sales_q = _sum_qty(SalesLine.objects.filter(**common))
    returns_q = _sum_qty(SalesReturnLine.objects.filter(**common))
    damage_q = _sum_qty(DamageLine.objects.filter(**common))
    office_q = _sum_qty(OfficeLine.objects.filter(**common))
    verification_q = _sum_qty(VerificationLine.objects.filter(**common))
    grn_q = _sum_qty_plus_free(GrnLine.objects.filter(**common))
    rts_q = _sum_qty_plus_free(RtsLine.objects.filter(**common))

    expected = float(anchor_qty) + grn_q + returns_q + verification_q \
        - sales_q - rts_q - damage_q - office_q
    variance = float(sc.actual_qty or 0) - expected
    value = variance * cost

    sc.real_expected_qty = Decimal(str(round(expected, 3)))
    sc.real_variance = Decimal(str(round(variance, 3)))
    sc.real_value = Decimal(str(round(value, 2)))
    sc.real_freeze_at = timezone.now()
    sc.real_freeze_source = source
    sc.real_txn_breakdown = {
        "totals": {
            "grn": grn_q, "sales": sales_q, "returns": returns_q,
            "damage": damage_q, "office": office_q, "rts": rts_q,
            "verification": verification_q,
        },
        # Itemised event lists — one per txn type, ordered by date.
        "grn":          _list_txns(GrnLine.objects.filter(**common), extra_free=True),
        "sales":        _list_txns(SalesLine.objects.filter(**common)),
        "returns":      _list_txns(SalesReturnLine.objects.filter(**common)),
        "damage":       _list_txns(DamageLine.objects.filter(**common)),
        "office":       _list_txns(OfficeLine.objects.filter(**common)),
        "rts":          _list_txns(RtsLine.objects.filter(**common), extra_free=True),
        "verification": _list_txns(VerificationLine.objects.filter(**common)),
        "anchor_qty": float(anchor_qty),
        "anchor_date": str(anchor_date),
        "cost_used": cost,
    }
    sc.save(update_fields=[
        "real_expected_qty", "real_variance", "real_value",
        "real_freeze_at", "real_freeze_source", "real_txn_breakdown",
    ])
    new = {
        "expected": sc.real_expected_qty,
        "variance": sc.real_variance,
        "value": sc.real_value,
        "source": source,
    }
    return prev, new
