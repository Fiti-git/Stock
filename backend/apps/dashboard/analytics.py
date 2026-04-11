"""
Shrinkage analytics helpers.

Shrinkage = POS quantity − physical count quantity (positive = stock missing/lost).
"""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum

from apps.uploads.models import PosSnapshot
from .models import StockCount


def _iso_week_label(d: date) -> str:
    """Return 'YYYY-Www' label for the ISO week containing date d."""
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def _month_label(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def compute_shrinkage(outlet, from_date: date, to_date: date, period: str, category: str = None):
    """
    Compute shrinkage per period for the given outlet and date range.

    Multiple location counts for the same item+date are summed before
    computing shrinkage so that multi-location counts don't inflate figures.

    Shrinkage = pos_qty − total_actual_qty (positive = stock missing/lost).

    Returns a list of period dicts and an overall summary.
    """
    counts_qs = StockCount.objects.filter(
        outlet=outlet,
        count_date__gte=from_date,
        count_date__lte=to_date,
    )

    if category:
        counts_qs = counts_qs.filter(item__category=category)

    # Aggregate multiple location entries: sum actual_qty per (item, count_date)
    aggregated = list(
        counts_qs
        .values("item_id", "count_date")
        .annotate(total_qty=Sum("actual_qty"))
    )

    if not aggregated:
        all_labels = _generate_period_labels(from_date, to_date, period)
        periods = [
            {
                "label": label,
                "total_shrinkage_qty": 0.0,
                "total_shrinkage_value": 0.0,
                "items_counted": 0,
                "top_items": [],
            }
            for label in all_labels
        ]
        return periods, {"total_shrinkage_qty": 0.0, "total_shrinkage_value": 0.0, "worst_category": None}

    # Pre-fetch item metadata
    from apps.items.models import Item
    item_ids = list({row["item_id"] for row in aggregated})
    if category:
        item_map = {item.id: item for item in Item.objects.filter(id__in=item_ids, category=category)}
    else:
        item_map = {item.id: item for item in Item.objects.filter(id__in=item_ids)}

    # Pre-fetch all relevant snapshots in one query
    snapshots_qs = PosSnapshot.objects.filter(
        outlet=outlet,
        item_id__in=item_ids,
        snapshot_date__lte=to_date,
    ).order_by("item_id", "snapshot_date")

    # Build lookup: item_id -> sorted list of (snapshot_date, pos_qty, cost_price)
    snap_by_item: dict[int, list] = defaultdict(list)
    for snap in snapshots_qs:
        snap_by_item[snap.item_id].append((snap.snapshot_date, snap.pos_quantity, snap.cost_price))

    def get_pos_for_count(item_id: int, count_date: date):
        snaps = snap_by_item.get(item_id, [])
        best = None
        for sd, qty, cost in snaps:
            if sd <= count_date:
                best = (qty, cost)
            elif sd > count_date:
                break
        return best  # (pos_qty, cost_price) or None

    # Group aggregated counts by period
    period_counts: dict[str, list] = defaultdict(list)
    for row in aggregated:
        label = _iso_week_label(row["count_date"]) if period == "weekly" else _month_label(row["count_date"])
        period_counts[label].append(row)

    all_labels = _generate_period_labels(from_date, to_date, period)

    periods = []
    total_shrinkage_qty = Decimal("0")
    total_shrinkage_value = Decimal("0")
    category_shrinkage: dict[str, Decimal] = defaultdict(Decimal)

    for label in all_labels:
        rows_in_period = period_counts.get(label, [])
        period_shrinkage_qty = Decimal("0")
        period_shrinkage_value = Decimal("0")
        item_shrinkage: dict[int, dict] = {}

        for row in rows_in_period:
            item_id = row["item_id"]
            item = item_map.get(item_id)
            if item is None:
                continue
            snap = get_pos_for_count(item_id, row["count_date"])
            if snap is None:
                continue
            pos_qty, cost_price = snap
            total_counted = row["total_qty"]
            shrink_qty = pos_qty - total_counted
            cost = cost_price if cost_price else Decimal("0")
            shrink_value = shrink_qty * cost

            period_shrinkage_qty += shrink_qty
            period_shrinkage_value += shrink_value
            total_shrinkage_qty += shrink_qty
            total_shrinkage_value += shrink_value
            category_shrinkage[item.category or "Uncategorised"] += shrink_value

            if item_id not in item_shrinkage or shrink_qty > item_shrinkage[item_id]["shrinkage_qty"]:
                item_shrinkage[item_id] = {
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "category": item.category or "Uncategorised",
                    "shrinkage_qty": float(shrink_qty),
                    "shrinkage_value": float(shrink_value),
                }

        top_items = sorted(
            item_shrinkage.values(),
            key=lambda x: x["shrinkage_qty"],
            reverse=True,
        )[:10]

        periods.append(
            {
                "label": label,
                "total_shrinkage_qty": float(period_shrinkage_qty),
                "total_shrinkage_value": float(period_shrinkage_value),
                "items_counted": len(rows_in_period),
                "top_items": top_items,
            }
        )

    worst_category = (
        max(category_shrinkage, key=lambda k: category_shrinkage[k])
        if category_shrinkage
        else None
    )

    summary = {
        "total_shrinkage_qty": float(total_shrinkage_qty),
        "total_shrinkage_value": float(total_shrinkage_value),
        "worst_category": worst_category,
    }

    return periods, summary


def _generate_period_labels(from_date: date, to_date: date, period: str) -> list[str]:
    """Generate all period labels between from_date and to_date (inclusive)."""
    labels = []
    seen = set()
    current = from_date
    while current <= to_date:
        label = _iso_week_label(current) if period == "weekly" else _month_label(current)
        if label not in seen:
            seen.add(label)
            labels.append(label)
        current += timedelta(days=1)
    return labels
