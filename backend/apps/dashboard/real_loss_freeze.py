"""
Real Loss freeze — captures the expected qty + itemised txn breakdown for
a StockCount at the moment of submit or Rerun.

TIMESTAMP-PRECISE reconciliation:
  Anchor moment = PosSnapshot.uploaded_at (the exact datetime the snapshot
                  became known to the system).
  Count moment  = StockCount.counted_at.
  Txn moment    = datetime.combine(txn_date, parse(txn_time)) when txn_time
                  is present; falls back to txn_date @ 00:00 otherwise.

  A txn belongs to the count's delta window iff:
      anchor_ts <= txn_ts <= count_ts

  Anchor selection: the LATEST PosSnapshot whose uploaded_at <= count_ts.
  This avoids the "day 0" ambiguity — no need to pick "which day's
  snapshot"; time answers it directly.

Once frozen, the values live on the StockCount row so the report reads
them straight — no live compute.
"""

from datetime import datetime, time as _time, timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from apps.items.models import Item
from apps.uploads.models import (
    PosSnapshot,
    SalesLine, SalesReturnLine, DamageLine, OfficeLine,
    VerificationLine, GrnLine, RtsLine,
)
from .models import StockCount


# --------------------------------------------------------------------------- #
# Time helpers                                                                #
# --------------------------------------------------------------------------- #
def _parse_txn_time(txn_time_str):
    """
    Parse the free-text txn_time column into a datetime.time.
    Accepts: 'HH:MM:SS', 'HH:MM', '' / None → returns None.
    Anything unrecognisable returns None (caller treats as start-of-day).
    """
    if not txn_time_str:
        return None
    s = str(txn_time_str).strip()
    if not s:
        return None
    for fmt in ("%H:%M:%S", "%H:%M", "%H:%M:%S.%f"):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    return None


def _txn_moment(txn_date, txn_time_str):
    """Combine txn_date + txn_time_str into a naive datetime for comparison."""
    t = _parse_txn_time(txn_time_str)
    if t is None:
        # No time recorded → treat as the very START of the day. This is the
        # conservative choice for reconciliation: unknown-time txns will be
        # included in any count on that date, matching the pre-time-precise
        # behavior for those edge cases.
        return datetime.combine(txn_date, _time(0, 0, 0))
    return datetime.combine(txn_date, t)


def _to_naive(dt):
    """Strip tz so mixed naive/aware comparisons don't blow up."""
    if dt is None:
        return None
    if timezone.is_aware(dt):
        return timezone.make_naive(dt, timezone.get_current_timezone())
    return dt


# --------------------------------------------------------------------------- #
# Anchor selection                                                            #
# --------------------------------------------------------------------------- #
def _pick_anchor(sc):
    """
    Pick the freshest PosSnapshot with uploaded_at <= sc.counted_at.
    Returns (snap, anchor_ts) or (None, None).

    Note: we intentionally IGNORE the sc.pos_snapshot_at_count FK because
    that field was frozen using a date-only heuristic; timestamp-precise
    logic must re-derive from uploaded_at.
    """
    count_ts = _to_naive(sc.counted_at)
    if count_ts is None:
        # Legacy row missing counted_at — fall back to end of count_date.
        count_ts = datetime.combine(sc.count_date, _time(23, 59, 59))
    snap = (
        PosSnapshot.objects
        .filter(outlet_id=sc.outlet_id, item_id=sc.item_id,
                uploaded_at__lte=timezone.make_aware(count_ts, timezone.get_current_timezone())
                    if timezone.is_naive(count_ts) else count_ts)
        .order_by("-uploaded_at")
        .only("id", "snapshot_date", "pos_quantity", "cost_price", "uploaded_at")
        .first()
    )
    if not snap:
        return None, None
    return snap, _to_naive(snap.uploaded_at)


# --------------------------------------------------------------------------- #
# Txn windowing                                                               #
# --------------------------------------------------------------------------- #
def _txns_in_window(model, outlet_id, item_code, anchor_ts, count_ts, has_free=False):
    """
    Return list of (moment, qty) for txns whose txn_date is in
    [anchor_date, count_date] AND whose combined datetime satisfies
    anchor_ts <= moment <= count_ts.

    Fetching by date first is essential — we can't filter on
    datetime.combine at DB level without CAST/CONCAT which kills indexes.
    So we over-pull by date, then filter in Python by time. In practice the
    per-item date range for a count is 0-2 days, so the pull is tiny.
    """
    anchor_date = anchor_ts.date()
    count_date = count_ts.date()
    qs = model.objects.filter(
        outlet_id=outlet_id, item_code=item_code,
        txn_date__gte=anchor_date, txn_date__lte=count_date,
    )
    if has_free:
        rows = qs.values("txn_date", "txn_time", "qty", "free_qty")
    else:
        rows = qs.values("txn_date", "txn_time", "qty")
    out = []
    for r in rows:
        moment = _txn_moment(r["txn_date"], r["txn_time"])
        if not (anchor_ts <= moment <= count_ts):
            continue
        qty = float(r["qty"] or 0)
        if has_free:
            qty += float(r.get("free_qty") or 0)
        if qty:
            out.append((moment, qty))
    out.sort(key=lambda x: x[0])
    return out


def _sum_and_list(txns):
    """Convert [(moment, qty), ...] into (total, [{"at": iso, "qty": ...}, ...])."""
    total = 0.0
    items = []
    for moment, qty in txns:
        total += qty
        items.append({"at": moment.isoformat(sep=" "), "qty": qty})
    return total, items


# --------------------------------------------------------------------------- #
# Single-count freeze                                                         #
# --------------------------------------------------------------------------- #
def freeze_stock_count(sc, source="submit"):
    """
    Compute + persist real_expected_qty, real_variance, real_value,
    real_txn_breakdown for one StockCount using timestamp-precise
    reconciliation.

    Returns (prev, new) snapshot dicts for RerunHistory logging.
    """
    prev = {
        "expected": sc.real_expected_qty,
        "variance": sc.real_variance,
        "value": sc.real_value,
        "source": sc.real_freeze_source or "",
    }

    count_ts = _to_naive(sc.counted_at)
    if count_ts is None:
        count_ts = datetime.combine(sc.count_date, _time(23, 59, 59))

    snap, anchor_ts = _pick_anchor(sc)
    if snap is None or anchor_ts is None:
        # No usable POS snapshot before this count → can't reconcile.
        sc.real_expected_qty = None
        sc.real_variance = None
        sc.real_value = None
        sc.real_freeze_at = timezone.now()
        sc.real_freeze_source = source
        sc.real_txn_breakdown = None
        # Also clear the legacy anchor fields for consistency.
        sc.pos_qty_at_count = None
        sc.pos_snapshot_at_count_id = None
        sc.save(update_fields=[
            "real_expected_qty", "real_variance", "real_value",
            "real_freeze_at", "real_freeze_source", "real_txn_breakdown",
            "pos_qty_at_count", "pos_snapshot_at_count",
        ])
        new = {"expected": None, "variance": None, "value": None, "source": source}
        return prev, new

    # Refresh the legacy anchor fields to reflect the timestamp-picked snap.
    sc.pos_qty_at_count = snap.pos_quantity
    sc.pos_snapshot_at_count_id = snap.id

    # Item + cost.
    it = Item.objects.only("item_code", "cost_price").get(pk=sc.item_id)
    # Latest snapshot cost for the item (may differ from anchor's cost if
    # anchor is old). Match the reader's cost basis for continuity.
    latest = (
        PosSnapshot.objects
        .filter(outlet_id=sc.outlet_id, item_id=sc.item_id)
        .order_by("-snapshot_date")
        .only("cost_price")
        .first()
    )
    if latest and latest.cost_price is not None:
        cost = float(latest.cost_price)
    else:
        cost = float(it.cost_price or 0)

    common = (sc.outlet_id, it.item_code, anchor_ts, count_ts)
    sales_t = _txns_in_window(SalesLine, *common)
    returns_t = _txns_in_window(SalesReturnLine, *common)
    damage_t = _txns_in_window(DamageLine, *common)
    office_t = _txns_in_window(OfficeLine, *common)
    verification_t = _txns_in_window(VerificationLine, *common)
    grn_t = _txns_in_window(GrnLine, *common, has_free=True)
    rts_t = _txns_in_window(RtsLine, *common, has_free=True)

    sales_q, sales_items = _sum_and_list(sales_t)
    returns_q, returns_items = _sum_and_list(returns_t)
    damage_q, damage_items = _sum_and_list(damage_t)
    office_q, office_items = _sum_and_list(office_t)
    verification_q, verification_items = _sum_and_list(verification_t)
    grn_q, grn_items = _sum_and_list(grn_t)
    rts_q, rts_items = _sum_and_list(rts_t)

    anchor_qty = float(snap.pos_quantity)
    expected = (
        anchor_qty
        + grn_q + returns_q + verification_q
        - sales_q - rts_q - damage_q - office_q
    )
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
        "grn": grn_items,
        "sales": sales_items,
        "returns": returns_items,
        "damage": damage_items,
        "office": office_items,
        "rts": rts_items,
        "verification": verification_items,
        "anchor_qty": anchor_qty,
        "anchor_date": str(snap.snapshot_date),
        "anchor_at": anchor_ts.isoformat(sep=" "),
        "count_at": count_ts.isoformat(sep=" "),
        "cost_used": cost,
    }
    sc.save(update_fields=[
        "real_expected_qty", "real_variance", "real_value",
        "real_freeze_at", "real_freeze_source", "real_txn_breakdown",
        "pos_qty_at_count", "pos_snapshot_at_count",
    ])
    new = {
        "expected": sc.real_expected_qty,
        "variance": sc.real_variance,
        "value": sc.real_value,
        "source": source,
    }
    return prev, new


# --------------------------------------------------------------------------- #
# Bulk freeze                                                                 #
# --------------------------------------------------------------------------- #
def freeze_stock_counts_bulk(counts, source="rerun"):
    """
    Bulk version — one query per txn type for the whole batch. Same
    timestamp-precise math as freeze_stock_count.

    Returns [(count_id, prev, new), ...] for RerunHistory logging.
    """
    counts = list(counts)
    if not counts:
        return []

    # Resolve item metadata in one query.
    item_ids = {c.item_id for c in counts}
    item_map = {
        it.id: it for it in Item.objects.filter(id__in=item_ids).only(
            "id", "item_code", "cost_price"
        )
    }
    codes_by_outlet = {}
    for c in counts:
        it = item_map.get(c.item_id)
        if it:
            codes_by_outlet.setdefault(c.outlet_id, set()).add(it.item_code)

    # Latest snapshot cost per (outlet, item) — for cost basis.
    latest_cost = {}
    outlet_ids = list(codes_by_outlet.keys())
    for r in (
        PosSnapshot.objects
        .filter(outlet_id__in=outlet_ids, item_id__in=item_ids)
        .order_by("outlet_id", "item_id", "-snapshot_date")
        .values("outlet_id", "item_id", "cost_price")
    ):
        pair = (r["outlet_id"], r["item_id"])
        if pair in latest_cost:
            continue
        if r["cost_price"] is not None:
            latest_cost[pair] = float(r["cost_price"])

    # For each count: pick anchor snapshot (latest with uploaded_at <=
    # counted_at). Uses one query per outlet-item pair which is unavoidable
    # for per-count precision, but per-count is cheap since we filter by
    # (outlet, item) and take the top row.
    #
    # Optimisation: pre-fetch every candidate snapshot in ONE query, then
    # pick per count in memory.
    all_snaps_by_pair = {}  # (outlet_id, item_id) -> [{id, snapshot_date, pos_quantity, cost_price, uploaded_at (naive)}] sorted by uploaded_at asc
    if item_ids:
        earliest_count_ts = min(
            (_to_naive(c.counted_at) or datetime.combine(c.count_date, _time(23, 59, 59)))
            for c in counts
        )
        # Give a small buffer for edge cases (snapshot uploaded within same second as count).
        for r in (
            PosSnapshot.objects
            .filter(outlet_id__in=outlet_ids, item_id__in=item_ids)
            .order_by("outlet_id", "item_id", "uploaded_at")
            .values("id", "outlet_id", "item_id", "snapshot_date",
                    "pos_quantity", "cost_price", "uploaded_at")
        ):
            key = (r["outlet_id"], r["item_id"])
            r["uploaded_at"] = _to_naive(r["uploaded_at"])
            all_snaps_by_pair.setdefault(key, []).append(r)

    import bisect

    def pick_anchor(oid, iid, count_ts_naive):
        arr = all_snaps_by_pair.get((oid, iid))
        if not arr:
            return None, None
        ts_list = [s["uploaded_at"] for s in arr]
        idx = bisect.bisect_right(ts_list, count_ts_naive) - 1
        if idx < 0:
            return None, None
        return arr[idx], arr[idx]["uploaded_at"]

    # Bulk-pull ALL txn lines in the widest date range needed for this
    # batch. Then per-count filter in Python by (item, time window).
    # Because we bulk once but filter per-count, this scales to thousands
    # of counts per request comfortably.
    from datetime import date as _d
    earliest_date = min(
        (all_snaps_by_pair.get((c.outlet_id, c.item_id), [{"snapshot_date": c.count_date}])[0]["snapshot_date"])
        for c in counts
    ) if counts else _d.today()
    latest_date = max(c.count_date for c in counts)

    def _bulk_txns(model, has_free=False):
        """Return dict[(outlet, item_code)] -> [(datetime moment, qty), ...] sorted by moment."""
        from django.db.models import Q as _Q
        combined = _Q()
        for oid, codes in codes_by_outlet.items():
            combined |= _Q(outlet_id=oid, item_code__in=codes)
        if not combined:
            return {}
        qs = model.objects.filter(
            combined, txn_date__gte=earliest_date, txn_date__lte=latest_date,
        )
        if has_free:
            rows = qs.values("outlet_id", "item_code", "txn_date", "txn_time", "qty", "free_qty")
        else:
            rows = qs.values("outlet_id", "item_code", "txn_date", "txn_time", "qty")
        idx = {}
        for r in rows:
            moment = _txn_moment(r["txn_date"], r["txn_time"])
            qty = float(r["qty"] or 0)
            if has_free:
                qty += float(r.get("free_qty") or 0)
            if not qty:
                continue
            key = (r["outlet_id"], r["item_code"])
            idx.setdefault(key, []).append((moment, qty))
        for k in idx:
            idx[k].sort(key=lambda x: x[0])
        return idx

    sales_idx = _bulk_txns(SalesLine)
    returns_idx = _bulk_txns(SalesReturnLine)
    damage_idx = _bulk_txns(DamageLine)
    office_idx = _bulk_txns(OfficeLine)
    verification_idx = _bulk_txns(VerificationLine)
    grn_idx = _bulk_txns(GrnLine, has_free=True)
    rts_idx = _bulk_txns(RtsLine, has_free=True)

    def _window(idx, oid, code, anchor_ts, count_ts):
        arr = idx.get((oid, code))
        if not arr:
            return []
        moments = [m for m, _ in arr]
        lo = bisect.bisect_left(moments, anchor_ts)
        hi = bisect.bisect_right(moments, count_ts)
        return arr[lo:hi]

    now = timezone.now()
    results = []
    for sc in counts:
        prev = {
            "expected": sc.real_expected_qty,
            "variance": sc.real_variance,
            "value": sc.real_value,
            "source": sc.real_freeze_source or "",
        }
        count_ts = _to_naive(sc.counted_at) or datetime.combine(sc.count_date, _time(23, 59, 59))
        snap, anchor_ts = pick_anchor(sc.outlet_id, sc.item_id, count_ts)
        if snap is None or anchor_ts is None:
            sc.real_expected_qty = None
            sc.real_variance = None
            sc.real_value = None
            sc.real_freeze_at = now
            sc.real_freeze_source = source
            sc.real_txn_breakdown = None
            sc.pos_qty_at_count = None
            sc.pos_snapshot_at_count_id = None
            results.append((sc.id, prev,
                            {"expected": None, "variance": None, "value": None, "source": source}))
            continue

        it = item_map.get(sc.item_id)
        if not it:
            continue
        code = it.item_code
        cost = latest_cost.get((sc.outlet_id, sc.item_id))
        if cost is None:
            cost = float(it.cost_price or 0)

        common_args = (sc.outlet_id, code, anchor_ts, count_ts)
        sales_t = _window(sales_idx, *common_args)
        returns_t = _window(returns_idx, *common_args)
        damage_t = _window(damage_idx, *common_args)
        office_t = _window(office_idx, *common_args)
        verification_t = _window(verification_idx, *common_args)
        grn_t = _window(grn_idx, *common_args)
        rts_t = _window(rts_idx, *common_args)

        sales_q, sales_items = _sum_and_list(sales_t)
        returns_q, returns_items = _sum_and_list(returns_t)
        damage_q, damage_items = _sum_and_list(damage_t)
        office_q, office_items = _sum_and_list(office_t)
        verification_q, verification_items = _sum_and_list(verification_t)
        grn_q, grn_items = _sum_and_list(grn_t)
        rts_q, rts_items = _sum_and_list(rts_t)

        anchor_qty = float(snap["pos_quantity"])
        expected = (
            anchor_qty
            + grn_q + returns_q + verification_q
            - sales_q - rts_q - damage_q - office_q
        )
        variance = float(sc.actual_qty or 0) - expected
        value = variance * cost

        sc.real_expected_qty = Decimal(str(round(expected, 3)))
        sc.real_variance = Decimal(str(round(variance, 3)))
        sc.real_value = Decimal(str(round(value, 2)))
        sc.real_freeze_at = now
        sc.real_freeze_source = source
        sc.real_txn_breakdown = {
            "totals": {
                "grn": grn_q, "sales": sales_q, "returns": returns_q,
                "damage": damage_q, "office": office_q, "rts": rts_q,
                "verification": verification_q,
            },
            "grn": grn_items,
            "sales": sales_items,
            "returns": returns_items,
            "damage": damage_items,
            "office": office_items,
            "rts": rts_items,
            "verification": verification_items,
            "anchor_qty": anchor_qty,
            "anchor_date": str(snap["snapshot_date"]),
            "anchor_at": anchor_ts.isoformat(sep=" "),
            "count_at": count_ts.isoformat(sep=" "),
            "cost_used": cost,
        }
        sc.pos_qty_at_count = snap["pos_quantity"]
        sc.pos_snapshot_at_count_id = snap["id"]
        results.append((sc.id, prev, {
            "expected": sc.real_expected_qty,
            "variance": sc.real_variance,
            "value": sc.real_value,
            "source": source,
        }))

    StockCount.objects.bulk_update(
        counts,
        ["real_expected_qty", "real_variance", "real_value",
         "real_freeze_at", "real_freeze_source", "real_txn_breakdown",
         "pos_qty_at_count", "pos_snapshot_at_count"],
        batch_size=500,
    )
    return results
