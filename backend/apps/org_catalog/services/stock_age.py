"""
FIFO stock-age computation shared between the nightly management command and
the on-demand `/stock-age/recompute/` API endpoint.

Lots (inbound) come from:
  - GrnLine                          (qty + free_qty)
  - VerificationLine with qty > 0    (verification found extra stock)
  - SalesReturnLine                  (customer returned goods, dated at return)

Consumption (outbound, FIFO oldest-first) comes from:
  - SalesLine, DamageLine, OfficeLine, RtsLine
  - VerificationLine with qty < 0    (verification shortage)

A consumption row older than all known lots is treated as a "pre-history"
gap and skipped — it means the opening balance isn't in the dataset.

After the FIFO walk, derived on-hand is reconciled against the most recent
PosSnapshot:
  delta = pos_qty - derived_on_hand
  delta > 0 -> add `unknown_age_qty = delta` (dated at the earliest snapshot)
  delta < 0 -> clamp (consume youngest lots first) so totals match POS.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.items.models import Item
from apps.org_catalog.models import (
    DemandSnapshot,
    ItemMasterLink,
    MasterProduct,
    StockAgeSnapshot,
)
from apps.uploads.models import (
    DamageLine,
    DamageUploadBatch,
    GrnLine,
    GrnUploadBatch,
    OfficeLine,
    OfficeUploadBatch,
    PosSnapshot,
    RtsLine,
    RtsUploadBatch,
    SalesLine,
    SalesReturnLine,
    SalesReturnUploadBatch,
    SalesUploadBatch,
    VerificationLine,
    VerificationUploadBatch,
)


APPROVED = ("auto", "approved")


@dataclass
class Lot:
    date: date
    qty: float
    cost: float
    source: str  # "grn" / "verify+" / "return"


@dataclass
class Bucket:
    lots: list[Lot] = field(default_factory=list)
    consumptions: list[tuple[date, float]] = field(default_factory=list)


def _q(d) -> float:
    """Decimal/None -> float with zero default."""
    if d is None:
        return 0.0
    return float(d)


def _approved_batch_ids(model) -> list[int]:
    return list(
        model.objects.filter(
            status=model.Status.SUCCESS,
            approval_status__in=APPROVED,
        ).values_list("id", flat=True)
    )


def _collect_lots_and_consumptions(
    outlet_id: int | None,
    item_code: str | None,
) -> dict[tuple[int, str], Bucket]:
    """Single pass over all relevant upload lines, grouped by (outlet, item_code)."""
    buckets: dict[tuple[int, str], Bucket] = defaultdict(Bucket)

    grn_batch_ids = _approved_batch_ids(GrnUploadBatch)
    ver_batch_ids = _approved_batch_ids(VerificationUploadBatch)
    sret_batch_ids = _approved_batch_ids(SalesReturnUploadBatch)
    sales_batch_ids = _approved_batch_ids(SalesUploadBatch)
    dmg_batch_ids = _approved_batch_ids(DamageUploadBatch)
    off_batch_ids = _approved_batch_ids(OfficeUploadBatch)
    rts_batch_ids = _approved_batch_ids(RtsUploadBatch)

    def narrow(qs):
        if outlet_id is not None:
            qs = qs.filter(outlet_id=outlet_id)
        if item_code:
            qs = qs.filter(item_code=item_code)
        return qs

    # Inbound — GRN
    for r in narrow(GrnLine.objects.filter(batch_id__in=grn_batch_ids)).values(
        "outlet_id", "item_code", "txn_date", "qty", "free_qty", "cost_price"
    ).iterator(chunk_size=5000):
        qty = _q(r["qty"]) + _q(r["free_qty"])
        if qty <= 0:
            continue
        buckets[(r["outlet_id"], r["item_code"])].lots.append(
            Lot(r["txn_date"], qty, _q(r["cost_price"]), "grn")
        )

    # Inbound — Verification positive
    for r in narrow(VerificationLine.objects.filter(batch_id__in=ver_batch_ids)).values(
        "outlet_id", "item_code", "txn_date", "qty", "cost_price"
    ).iterator(chunk_size=5000):
        qty = _q(r["qty"])
        if qty <= 0:
            continue
        buckets[(r["outlet_id"], r["item_code"])].lots.append(
            Lot(r["txn_date"], qty, _q(r["cost_price"]), "verify+")
        )

    # Inbound — Sales Returns
    for r in narrow(SalesReturnLine.objects.filter(batch_id__in=sret_batch_ids)).values(
        "outlet_id", "item_code", "txn_date", "qty", "cost_price"
    ).iterator(chunk_size=5000):
        qty = _q(r["qty"])
        if qty <= 0:
            continue
        buckets[(r["outlet_id"], r["item_code"])].lots.append(
            Lot(r["txn_date"], qty, _q(r["cost_price"]), "return")
        )

    # Outbound — Sales
    for r in narrow(SalesLine.objects.filter(batch_id__in=sales_batch_ids)).values(
        "outlet_id", "item_code", "txn_date", "qty"
    ).iterator(chunk_size=5000):
        qty = _q(r["qty"])
        if qty <= 0:
            continue
        buckets[(r["outlet_id"], r["item_code"])].consumptions.append((r["txn_date"], qty))

    # Outbound — Damage / Office / RTS
    for model, batch_ids in (
        (DamageLine, dmg_batch_ids),
        (OfficeLine, off_batch_ids),
        (RtsLine, rts_batch_ids),
    ):
        for r in narrow(model.objects.filter(batch_id__in=batch_ids)).values(
            "outlet_id", "item_code", "txn_date", "qty"
        ).iterator(chunk_size=5000):
            qty = _q(r["qty"])
            if qty <= 0:
                continue
            buckets[(r["outlet_id"], r["item_code"])].consumptions.append((r["txn_date"], qty))

    # Outbound — Verification negative (shortages)
    for r in narrow(VerificationLine.objects.filter(batch_id__in=ver_batch_ids)).values(
        "outlet_id", "item_code", "txn_date", "qty"
    ).iterator(chunk_size=5000):
        qty = _q(r["qty"])
        if qty >= 0:
            continue
        buckets[(r["outlet_id"], r["item_code"])].consumptions.append(
            (r["txn_date"], abs(qty))
        )

    return buckets


def _walk_fifo(bucket: Bucket) -> list[Lot]:
    """Return lots with `qty` reduced to remaining after FIFO consumption."""
    lots = sorted(bucket.lots, key=lambda l: l.date)
    # Mutable copy so we can decrement qty as we consume.
    remaining = [Lot(l.date, l.qty, l.cost, l.source) for l in lots]

    for cdate, cqty in sorted(bucket.consumptions, key=lambda c: c[0]):
        need = cqty
        for lot in remaining:
            if need <= 0:
                break
            if lot.qty <= 0:
                continue
            if lot.date > cdate:
                # No lot old enough — rest of this consumption is pre-history.
                need = 0
                break
            take = min(lot.qty, need)
            lot.qty -= take
            need -= take
        # Whatever `need` still remains after the loop is pre-history; drop it.

    return [l for l in remaining if l.qty > 1e-9]


def _reconcile_against_pos(
    remaining: list[Lot],
    pos_qty: float | None,
    earliest_pos_date: date | None,
) -> tuple[list[Lot], float, date | None]:
    """
    Align derived on-hand with the authoritative PosSnapshot qty.
    Returns (remaining_lots_clamped, unknown_age_qty, unknown_age_earliest_date).
    """
    if pos_qty is None:
        return remaining, 0.0, None

    derived = sum(l.qty for l in remaining)
    delta = pos_qty - derived

    if abs(delta) < 1e-6:
        return remaining, 0.0, None

    if delta > 0:
        # POS has more than we can explain from lots → unknown-age bucket.
        return remaining, delta, earliest_pos_date

    # delta < 0 : we over-counted. Clamp youngest lots first.
    need = -delta
    for lot in sorted(remaining, key=lambda l: l.date, reverse=True):
        if need <= 0:
            break
        take = min(lot.qty, need)
        lot.qty -= take
        need -= take
    return [l for l in remaining if l.qty > 1e-9], 0.0, None


def _aggregate(lots: list[Lot], unknown_qty: float, today: date) -> dict:
    on_hand = sum(l.qty for l in lots) + unknown_qty
    if on_hand <= 0:
        return {
            "on_hand_qty": 0.0,
            "oldest_lot_date": None,
            "oldest_lot_age_days": 0,
            "weighted_avg_age_days": 0.0,
            "bucket_0_30": 0.0,
            "bucket_31_60": 0.0,
            "bucket_61_90": 0.0,
            "bucket_90_plus": 0.0,
            "on_hand_value": 0.0,
        }

    oldest = min((l.date for l in lots), default=None)
    oldest_age = (today - oldest).days if oldest else 0

    b0, b1, b2, b3 = 0.0, 0.0, 0.0, 0.0
    age_qty_sum = 0.0
    value = 0.0
    for l in lots:
        age = (today - l.date).days
        age_qty_sum += age * l.qty
        value += l.cost * l.qty
        if age <= 30:
            b0 += l.qty
        elif age <= 60:
            b1 += l.qty
        elif age <= 90:
            b2 += l.qty
        else:
            b3 += l.qty
    # Unknown-age qty is counted in the oldest bucket so it is never hidden.
    b3 += unknown_qty

    lot_qty_total = sum(l.qty for l in lots)
    if lot_qty_total > 0:
        weighted_avg = age_qty_sum / lot_qty_total
    else:
        weighted_avg = 0.0

    return {
        "on_hand_qty": on_hand,
        "oldest_lot_date": oldest,
        "oldest_lot_age_days": oldest_age,
        "weighted_avg_age_days": weighted_avg,
        "bucket_0_30": b0,
        "bucket_31_60": b1,
        "bucket_61_90": b2,
        "bucket_90_plus": b3,
        "on_hand_value": value,
    }


def rebuild_stock_age(
    outlet_id: int | None = None,
    item_code: str | None = None,
) -> int:
    """
    Rebuild StockAgeSnapshot rows. Scope:
      - both None      -> full rebuild (truncate + insert)
      - outlet_id set  -> only that outlet (delete+insert for matching keys)
      - item_code set  -> only rows with that item_code
    Returns the number of StockAgeSnapshot rows written.
    """
    today = timezone.localdate()

    # (outlet_id, item_code) -> item_id lookup. Filter to scope for speed.
    item_qs = Item.objects.all()
    if outlet_id is not None:
        item_qs = item_qs.filter(outlet_id=outlet_id)
    item_key = {
        (o, code): (iid, s)
        for iid, o, code, s in item_qs.values_list(
            "id", "outlet_id", "item_code", "status"
        )
    }

    links = dict(
        ItemMasterLink.objects.values_list("item_id", "master_product_id")
    )

    buckets = _collect_lots_and_consumptions(outlet_id, item_code)

    # Latest POS snapshot per (outlet, item) + earliest snapshot date.
    pos_latest: dict[tuple[int, int], tuple[float, date]] = {}
    pos_earliest: dict[tuple[int, int], date] = {}

    pos_qs = PosSnapshot.objects.all()
    if outlet_id is not None:
        pos_qs = pos_qs.filter(outlet_id=outlet_id)
    for r in pos_qs.values("outlet_id", "item_id", "snapshot_date", "pos_quantity").iterator(chunk_size=5000):
        key = (r["outlet_id"], r["item_id"])
        d = r["snapshot_date"]
        q = _q(r["pos_quantity"])
        cur = pos_latest.get(key)
        if cur is None or d > cur[1]:
            pos_latest[key] = (q, d)
        eprev = pos_earliest.get(key)
        if eprev is None or d < eprev:
            pos_earliest[key] = d

    rows: list[StockAgeSnapshot] = []

    # Union the keys from both buckets (movement history) AND POS snapshots so
    # items that only ever appeared as a POS row (no GRN yet) still get a line.
    movement_keys = set(buckets.keys())
    pos_code_keys = set()
    # Map (outlet_id, item_id) -> item_code using item_key inverted.
    inv_item = {v[0]: (k[0], k[1]) for k, v in item_key.items()}
    for (oid, iid) in pos_latest.keys():
        mapped = inv_item.get(iid)
        if mapped:
            pos_code_keys.add(mapped)

    all_keys = movement_keys | pos_code_keys
    if item_code:
        all_keys = {k for k in all_keys if k[1] == item_code}

    for (oid, code) in all_keys:
        item_meta = item_key.get((oid, code))
        if not item_meta:
            # Movement for an item_code that doesn't map to an Item row in this
            # outlet (orphan/pending). Skip — the feature is per Item.
            continue
        item_id, item_status = item_meta
        master_id = links.get(item_id)

        bucket = buckets.get((oid, code), Bucket())
        remaining = _walk_fifo(bucket)

        pos_row = pos_latest.get((oid, item_id))
        pos_qty = pos_row[0] if pos_row else None
        pos_date = pos_row[1] if pos_row else None
        earliest = pos_earliest.get((oid, item_id))

        remaining, unknown_qty, unknown_from = _reconcile_against_pos(
            remaining, pos_qty, earliest
        )

        stats = _aggregate(remaining, unknown_qty, today)
        if stats["on_hand_qty"] <= 0 and unknown_qty <= 0:
            continue  # nothing to show for this pair

        # If the only thing we have is unknown_qty, use earliest POS date.
        oldest_date = stats["oldest_lot_date"] or unknown_from
        oldest_age = stats["oldest_lot_age_days"] or (
            (today - unknown_from).days if unknown_from else 0
        )

        rows.append(StockAgeSnapshot(
            outlet_id=oid,
            item_id=item_id,
            master_product_id=master_id,
            on_hand_qty=stats["on_hand_qty"],
            oldest_lot_date=oldest_date,
            oldest_lot_age_days=oldest_age,
            weighted_avg_age_days=stats["weighted_avg_age_days"],
            bucket_0_30=stats["bucket_0_30"],
            bucket_31_60=stats["bucket_31_60"],
            bucket_61_90=stats["bucket_61_90"],
            bucket_90_plus=stats["bucket_90_plus"],
            unknown_age_qty=unknown_qty,
            latest_pos_qty=pos_qty,
            latest_pos_date=pos_date,
            on_hand_value=stats["on_hand_value"],
        ))

    # Scope-aware replace: delete only what matches the filter, then insert.
    del_qs = StockAgeSnapshot.objects.all()
    if outlet_id is not None:
        del_qs = del_qs.filter(outlet_id=outlet_id)
    if item_code:
        item_ids = [
            v[0] for k, v in item_key.items() if k[1] == item_code
        ]
        del_qs = del_qs.filter(item_id__in=item_ids)

    with transaction.atomic():
        del_qs.delete()
        StockAgeSnapshot.objects.bulk_create(rows, batch_size=1000)

    return len(rows)
