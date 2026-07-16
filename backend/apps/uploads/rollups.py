"""
Monthly rollup builder for pos_snapshots → pos_snapshots_monthly.

Design goals:
  1. Idempotent — running twice for the same month is a no-op (upsert on
     the unique (outlet, item, year_month) constraint).
  2. Scoped — rebuild only a rolling window (default: current + last month)
     because older months are frozen unless the app explicitly re-uploads
     historical POS data. A manual re-run via management command can widen
     the window when needed.
  3. Single-pass — one SQL statement per month builds every outlet-item
     row using window functions + aggregates. No Python loop over 50k items.

Aggregation rules (see PosSnapshotMonthly model docstring for context):
  - End-of-month values (end_pos_quantity, end_cost_price, end_selling_price)
    come from the row where snapshot_date is the max within the month for
    that (outlet, item).
  - Aggregates (avg/min/max_pos_quantity, snapshot_days_recorded,
    first/last_upload_at) span every daily snapshot in the month.
  - Count / variance aggregates join stock_counts and variance_records
    scoped to the same month.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from django.db import connection, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def month_floor(d: date) -> date:
    """First day of the month containing d."""
    return d.replace(day=1)


def next_month(d: date) -> date:
    """First day of the month AFTER the one containing d."""
    if d.month == 12:
        return d.replace(year=d.year + 1, month=1, day=1)
    return d.replace(month=d.month + 1, day=1)


def months_in_window(start_month: date, months_back: int) -> list[date]:
    """
    Return [start_month, start_month - 1mo, ..., start_month - (months_back-1)mo]
    with each element being the first day of that month.
    """
    start = month_floor(start_month)
    out = [start]
    for _ in range(months_back - 1):
        prev = start.replace(day=1) - timedelta(days=1)
        start = month_floor(prev)
        out.append(start)
    return out


@dataclass
class RollupResult:
    year_month: date
    upserted_rows: int
    elapsed_ms: int


# Single SQL that rebuilds every (outlet, item) row for one month via UPSERT.
# Parameters: :month_start (first day of month), :month_end_excl (first day of NEXT month)
_UPSERT_SQL = """
WITH month_snapshots AS (
    SELECT
        outlet_id,
        item_id,
        snapshot_date,
        pos_quantity,
        cost_price,
        selling_price,
        uploaded_at,
        ROW_NUMBER() OVER (
            PARTITION BY outlet_id, item_id
            ORDER BY snapshot_date DESC, uploaded_at DESC
        ) AS rn_end
    FROM pos_snapshots
    WHERE snapshot_date >= %(month_start)s
      AND snapshot_date <  %(month_end_excl)s
),
snapshot_agg AS (
    SELECT
        outlet_id,
        item_id,
        COUNT(DISTINCT snapshot_date)        AS days_recorded,
        MAX(snapshot_date)                   AS month_end_date,
        AVG(pos_quantity)                    AS avg_qty,
        MIN(pos_quantity)                    AS min_qty,
        MAX(pos_quantity)                    AS max_qty,
        MIN(uploaded_at)                     AS first_upload_at,
        MAX(uploaded_at)                     AS last_upload_at
    FROM month_snapshots
    GROUP BY outlet_id, item_id
),
snapshot_end AS (
    -- End-of-month snapshot row per (outlet, item)
    SELECT
        outlet_id,
        item_id,
        pos_quantity   AS end_pos_quantity,
        cost_price     AS end_cost_price,
        selling_price  AS end_selling_price
    FROM month_snapshots
    WHERE rn_end = 1
),
count_agg AS (
    SELECT
        outlet_id,
        item_id,
        SUM(actual_qty)                       AS total_counted_qty,
        COUNT(DISTINCT count_date)            AS count_days
    FROM stock_counts
    WHERE count_date >= %(month_start)s
      AND count_date <  %(month_end_excl)s
      AND approval_status IN ('submitted', 'approved')
    GROUP BY outlet_id, item_id
),
variance_agg AS (
    SELECT
        outlet_id,
        item_id,
        SUM(variance_qty)   AS total_variance_qty,
        SUM(variance_value) AS total_variance_value
    FROM variance_records
    WHERE count_date >= %(month_start)s
      AND count_date <  %(month_end_excl)s
    GROUP BY outlet_id, item_id
)
INSERT INTO pos_snapshots_monthly (
    outlet_id, item_id, year_month,
    snapshot_days_recorded, month_end_date,
    end_pos_quantity, end_cost_price, end_selling_price,
    avg_pos_quantity, min_pos_quantity, max_pos_quantity,
    total_counted_qty, count_sessions_count,
    total_variance_qty, total_variance_value,
    first_upload_at, last_upload_at,
    rebuilt_at
)
SELECT
    sa.outlet_id,
    sa.item_id,
    %(month_start)s                       AS year_month,
    sa.days_recorded,
    sa.month_end_date,
    se.end_pos_quantity, se.end_cost_price, se.end_selling_price,
    sa.avg_qty, sa.min_qty, sa.max_qty,
    COALESCE(ca.total_counted_qty, 0)     AS total_counted_qty,
    COALESCE(ca.count_days, 0)            AS count_sessions_count,
    va.total_variance_qty,
    va.total_variance_value,
    sa.first_upload_at, sa.last_upload_at,
    NOW()                                 AS rebuilt_at
FROM snapshot_agg sa
JOIN snapshot_end se USING (outlet_id, item_id)
LEFT JOIN count_agg    ca USING (outlet_id, item_id)
LEFT JOIN variance_agg va USING (outlet_id, item_id)
ON CONFLICT (outlet_id, item_id, year_month) DO UPDATE SET
    snapshot_days_recorded = EXCLUDED.snapshot_days_recorded,
    month_end_date         = EXCLUDED.month_end_date,
    end_pos_quantity       = EXCLUDED.end_pos_quantity,
    end_cost_price         = EXCLUDED.end_cost_price,
    end_selling_price      = EXCLUDED.end_selling_price,
    avg_pos_quantity       = EXCLUDED.avg_pos_quantity,
    min_pos_quantity       = EXCLUDED.min_pos_quantity,
    max_pos_quantity       = EXCLUDED.max_pos_quantity,
    total_counted_qty      = EXCLUDED.total_counted_qty,
    count_sessions_count   = EXCLUDED.count_sessions_count,
    total_variance_qty     = EXCLUDED.total_variance_qty,
    total_variance_value   = EXCLUDED.total_variance_value,
    first_upload_at        = EXCLUDED.first_upload_at,
    last_upload_at         = EXCLUDED.last_upload_at,
    rebuilt_at             = EXCLUDED.rebuilt_at
;
"""


def rebuild_month(month_start: date) -> RollupResult:
    """Rebuild the monthly rollup for a single (first-of-month) date."""
    started = timezone.now()
    month_start = month_floor(month_start)
    month_end_excl = next_month(month_start)

    with transaction.atomic(), connection.cursor() as cur:
        cur.execute(
            _UPSERT_SQL,
            {"month_start": month_start, "month_end_excl": month_end_excl},
        )
        upserted = cur.rowcount

    elapsed = int((timezone.now() - started).total_seconds() * 1000)
    logger.info(
        "pos_snapshot_monthly rebuild: month=%s rows=%s elapsed_ms=%s",
        month_start, upserted, elapsed,
    )
    return RollupResult(year_month=month_start, upserted_rows=upserted, elapsed_ms=elapsed)


def rebuild_recent(months_back: int = 2) -> list[RollupResult]:
    """
    Nightly-safe entry point: rebuild the last N months (current + previous
    by default). Older months are frozen unless someone explicitly re-uploads
    historical data — in which case, run the management command with a
    wider --months-back.
    """
    today = timezone.localdate()
    results = []
    for m in months_in_window(today, months_back):
        results.append(rebuild_month(m))
    return results


def rebuild_range(start_month: date, end_month: date) -> list[RollupResult]:
    """
    Backfill helper: rebuild every month from start_month (inclusive) to
    end_month (inclusive). Both should be first-of-month dates or will be
    floored.
    """
    start = month_floor(start_month)
    end = month_floor(end_month)
    if end < start:
        return []

    results = []
    cur = start
    while cur <= end:
        results.append(rebuild_month(cur))
        cur = next_month(cur)
    return results
