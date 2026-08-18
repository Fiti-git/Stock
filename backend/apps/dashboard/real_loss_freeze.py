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
from .models import StockCount


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
    # POS snapshot is start-of-day (contains state BEFORE any of that day's
    # txns). Include the snapshot date itself in the delta window so we
    # capture same-day GRN / sales / damage / etc. — otherwise counts taken
    # the same day as the anchor snapshot get an empty window and all txn
    # totals show 0.
    day_from = anchor_date
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


def freeze_stock_counts_bulk(counts, source="rerun"):
    """
    Bulk equivalent of freeze_stock_count — one query per txn type for the
    whole batch, then per-count math in Python. Roughly 10-20x faster than
    calling freeze_stock_count in a loop for a page of ~200 counts.

    Returns a list of (count_id, prev, new) tuples so the caller can log
    RerunHistory rows in one bulk_create.
    """
    import bisect
    from collections import defaultdict
    from datetime import timedelta as _timedelta

    counts = list(counts)
    if not counts:
        return []

    # Resolve anchor dates + snap FKs in one query (already fetched via
    # select_related, but read defensively).
    snap_ids = {c.pos_snapshot_at_count_id for c in counts if c.pos_snapshot_at_count_id}
    snap_date_map = {}
    if snap_ids:
        snap_date_map = {
            s.id: s.snapshot_date
            for s in PosSnapshot.objects.filter(id__in=snap_ids).only("id", "snapshot_date")
        }

    # Resolve item info in one query.
    item_ids = {c.item_id for c in counts}
    item_map = {
        it.id: it for it in Item.objects.filter(id__in=item_ids).only(
            "id", "item_code", "cost_price"
        )
    }
    # Latest snapshot cost per (outlet, item) — same basis as the reader.
    outlet_ids = {c.outlet_id for c in counts}
    latest_cost_map = {}
    for r in (
        PosSnapshot.objects
        .filter(outlet_id__in=outlet_ids, item_id__in=item_ids)
        .order_by("outlet_id", "item_id", "-snapshot_date")
        .values("outlet_id", "item_id", "cost_price")
    ):
        pair = (r["outlet_id"], r["item_id"])
        if pair in latest_cost_map:
            continue
        if r["cost_price"] is not None:
            latest_cost_map[pair] = float(r["cost_price"])

    # Compute the overall txn date range across the whole batch.
    anchor_dates = [
        snap_date_map.get(c.pos_snapshot_at_count_id)
        for c in counts if c.pos_snapshot_at_count_id
    ]
    anchor_dates = [d for d in anchor_dates if d is not None]
    if not anchor_dates:
        # None of the counts have a usable anchor — freeze them all with NULLs.
        now = timezone.now()
        results = []
        for sc in counts:
            prev = {
                "expected": sc.real_expected_qty,
                "variance": sc.real_variance,
                "value": sc.real_value,
                "source": sc.real_freeze_source or "",
            }
            sc.real_expected_qty = None
            sc.real_variance = None
            sc.real_value = None
            sc.real_freeze_at = now
            sc.real_freeze_source = source
            sc.real_txn_breakdown = None
            results.append((sc.id, prev,
                            {"expected": None, "variance": None, "value": None, "source": source}))
        StockCount.objects.bulk_update(
            counts,
            ["real_expected_qty", "real_variance", "real_value",
             "real_freeze_at", "real_freeze_source", "real_txn_breakdown"],
            batch_size=500,
        )
        return results

    # POS snapshot is start-of-day → include the snapshot date itself in
    # the delta window (see freeze_stock_count for why). day_from is the
    # earliest anchor across the batch; same-count delta window per row
    # below is [anchor_date, count_date] inclusive on both ends.
    txn_from = min(anchor_dates)
    txn_to = max(c.count_date for c in counts)

    # Codes per outlet — used to bulk-filter txn tables.
    codes_by_outlet = defaultdict(set)
    for c in counts:
        it = item_map.get(c.item_id)
        if it:
            codes_by_outlet[c.outlet_id].add(it.item_code)
    # Reverse lookup for join back to item_id.
    code_to_id_by_outlet = defaultdict(dict)
    for c in counts:
        it = item_map.get(c.item_id)
        if it:
            code_to_id_by_outlet[c.outlet_id][it.item_code] = c.item_id

    def _index_bulk(model, has_free=False):
        """
        Return {(outlet_id, item_id): [(date, qty), ...] sorted asc}
        for one txn line table. One SQL query for the whole batch.
        Individual rows also captured so we can rebuild the itemised
        txn_breakdown per count without re-querying.
        """
        # Build union of outlet -> codes filter — one big query.
        from django.db.models import Q as _Q
        combined_q = _Q()
        for oid, codes in codes_by_outlet.items():
            combined_q |= _Q(outlet_id=oid, item_code__in=codes)
        if not combined_q:
            return {}, {}
        qs = model.objects.filter(combined_q, txn_date__gte=txn_from, txn_date__lte=txn_to)
        # Aggregate for the delta-window math.
        from django.db.models import Sum as _Sum
        if has_free:
            agg = qs.values("outlet_id", "item_code", "txn_date").annotate(
                _q=_Sum("qty"), _f=_Sum("free_qty"),
            )
        else:
            agg = qs.values("outlet_id", "item_code", "txn_date").annotate(_q=_Sum("qty"))
        idx = {}
        events = {}  # (oid, iid) -> ordered [{"date": str, "qty": float}, ...]
        for row in agg:
            oid = row["outlet_id"]
            iid = code_to_id_by_outlet.get(oid, {}).get(row["item_code"])
            if iid is None:
                continue
            qty = float(row["_q"] or 0)
            if has_free:
                qty += float(row.get("_f") or 0)
            if not qty:
                continue
            key = (oid, iid)
            idx.setdefault(key, []).append((row["txn_date"], qty))
            # Keep the raw date in `events` so we can range-filter cleanly;
            # it's stringified only when written into the txn_breakdown JSON.
            events.setdefault(key, []).append({"date": row["txn_date"], "qty": qty})
        for k in idx:
            idx[k].sort()
        for k in events:
            events[k].sort(key=lambda x: x["date"])
        return idx, events

    from apps.uploads.models import (
        SalesLine as _S, SalesReturnLine as _SR, DamageLine as _D,
        OfficeLine as _O, VerificationLine as _V, GrnLine as _G, RtsLine as _R,
    )
    sales_idx, sales_ev = _index_bulk(_S)
    returns_idx, returns_ev = _index_bulk(_SR)
    damage_idx, damage_ev = _index_bulk(_D)
    office_idx, office_ev = _index_bulk(_O)
    verification_idx, verification_ev = _index_bulk(_V)
    grn_idx, grn_ev = _index_bulk(_G, has_free=True)
    rts_idx, rts_ev = _index_bulk(_R, has_free=True)

    def _sum_window(idx, oid, iid, day_from, day_to):
        arr = idx.get((oid, iid))
        if not arr:
            return 0.0
        dates_only = [d for d, _ in arr]
        lo = bisect.bisect_left(dates_only, day_from)
        hi = bisect.bisect_right(dates_only, day_to)
        return sum(v for _, v in arr[lo:hi])

    def _events_window(events, oid, iid, day_from, day_to):
        arr = events.get((oid, iid))
        if not arr:
            return []
        # e["date"] is a datetime.date; convert to ISO string on the way out
        # so the stored JSON matches the single-count freeze path.
        return [
            {"date": str(e["date"]), "qty": e["qty"]}
            for e in arr if day_from <= e["date"] <= day_to
        ]

    now = timezone.now()
    results = []
    for sc in counts:
        prev = {
            "expected": sc.real_expected_qty,
            "variance": sc.real_variance,
            "value": sc.real_value,
            "source": sc.real_freeze_source or "",
        }
        anchor_qty = sc.pos_qty_at_count
        anchor_date = snap_date_map.get(sc.pos_snapshot_at_count_id) if sc.pos_snapshot_at_count_id else None
        if anchor_qty is None or anchor_date is None:
            sc.real_expected_qty = None
            sc.real_variance = None
            sc.real_value = None
            sc.real_freeze_at = now
            sc.real_freeze_source = source
            sc.real_txn_breakdown = None
            results.append((sc.id, prev,
                            {"expected": None, "variance": None, "value": None, "source": source}))
            continue

        # Inclusive window: [anchor_date, count_date] — POS snapshot is
        # start-of-day so today's txns must be added.
        day_from = anchor_date
        day_to = sc.count_date
        it = item_map.get(sc.item_id)
        cost = latest_cost_map.get((sc.outlet_id, sc.item_id))
        if cost is None and it:
            cost = float(it.cost_price or 0)
        cost = cost or 0.0

        s_ = _sum_window(sales_idx, sc.outlet_id, sc.item_id, day_from, day_to)
        r_ = _sum_window(returns_idx, sc.outlet_id, sc.item_id, day_from, day_to)
        d_ = _sum_window(damage_idx, sc.outlet_id, sc.item_id, day_from, day_to)
        o_ = _sum_window(office_idx, sc.outlet_id, sc.item_id, day_from, day_to)
        v_ = _sum_window(verification_idx, sc.outlet_id, sc.item_id, day_from, day_to)
        g_ = _sum_window(grn_idx, sc.outlet_id, sc.item_id, day_from, day_to)
        rts_ = _sum_window(rts_idx, sc.outlet_id, sc.item_id, day_from, day_to)

        expected = float(anchor_qty) + g_ + r_ + v_ - s_ - rts_ - d_ - o_
        variance = float(sc.actual_qty or 0) - expected
        value = variance * cost

        sc.real_expected_qty = Decimal(str(round(expected, 3)))
        sc.real_variance = Decimal(str(round(variance, 3)))
        sc.real_value = Decimal(str(round(value, 2)))
        sc.real_freeze_at = now
        sc.real_freeze_source = source
        sc.real_txn_breakdown = {
            "totals": {
                "grn": g_, "sales": s_, "returns": r_, "damage": d_,
                "office": o_, "rts": rts_, "verification": v_,
            },
            "grn":          _events_window(grn_ev, sc.outlet_id, sc.item_id, day_from, day_to),
            "sales":        _events_window(sales_ev, sc.outlet_id, sc.item_id, day_from, day_to),
            "returns":      _events_window(returns_ev, sc.outlet_id, sc.item_id, day_from, day_to),
            "damage":       _events_window(damage_ev, sc.outlet_id, sc.item_id, day_from, day_to),
            "office":       _events_window(office_ev, sc.outlet_id, sc.item_id, day_from, day_to),
            "rts":          _events_window(rts_ev, sc.outlet_id, sc.item_id, day_from, day_to),
            "verification": _events_window(verification_ev, sc.outlet_id, sc.item_id, day_from, day_to),
            "anchor_qty": float(anchor_qty),
            "anchor_date": str(anchor_date),
            "cost_used": cost,
        }
        results.append((sc.id, prev, {
            "expected": sc.real_expected_qty,
            "variance": sc.real_variance,
            "value": sc.real_value,
            "source": source,
        }))

    StockCount.objects.bulk_update(
        counts,
        ["real_expected_qty", "real_variance", "real_value",
         "real_freeze_at", "real_freeze_source", "real_txn_breakdown"],
        batch_size=500,
    )
    return results
