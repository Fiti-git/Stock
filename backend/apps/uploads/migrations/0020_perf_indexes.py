"""
Backfill six critical performance indexes uncovered by a 2026-07-16 deep-dive
after prod CPU pinned at 100% on a Variance dashboard load.

Diagnosis (from pg_stat_user_tables + EXPLAIN ANALYZE):
  - items: 3.3M seq scans, 69 BILLION rows read — no (outlet_id, item_code)
    composite. Every POS upload's "look up existing items by code" and every
    catalog query full-scanned 50k rows.
  - stock_counts: 976k seq scans, 3.8B rows read — no (outlet_id, item_id,
    count_date) index. The variances() view's correlated subqueries filtered
    10k rows per loop, per output row.
  - item_barcodes: 340k seq scans, 11.8B rows read — no (outlet_id, barcode)
    or (item_id) index. Every mobile scan full-scanned 42k rows.
  - pending_items: 144k seq scans, 6.4B rows read — no (first_seen_outlet_id,
    status) or (item_code) index.

The FK backfill (0019) added referential integrity but Postgres does NOT
auto-create supporting indexes on the child side — you have to add them
explicitly. This migration does that plus the extra composite indexes
that match the hot query patterns.

Each index goes in its own RunSQL operation because CREATE INDEX
CONCURRENTLY must be issued outside any transaction — even Django's
implicit per-operation transaction that wraps a multi-statement RunSQL.
`atomic = False` on the Migration class combined with one operation per
statement gives every CONCURRENTLY its own connection state.

Idempotent: IF NOT EXISTS on every CREATE, IF EXISTS on every DROP.

Estimated build time on prod (per index): 5-30 seconds. Total: 1-3 min.
Zero user-facing impact during the build.
"""

from django.db import migrations


INDEXES_TO_ADD = [
    # (name, table, columns_body)
    ("items_outlet_code_idx",              "items",         "(outlet_id, item_code)"),
    ("stock_counts_outlet_item_date_idx",  "stock_counts",  "(outlet_id, item_id, count_date DESC)"),
    ("item_barcodes_outlet_barcode_idx",   "item_barcodes", "(outlet_id, barcode)"),
    ("item_barcodes_item_idx",             "item_barcodes", "(item_id)"),
    ("pending_items_outlet_status_idx",    "pending_items", "(first_seen_outlet_id, status)"),
    ("pending_items_code_outlet_type_idx", "pending_items", "(item_code, first_seen_outlet_id, change_type)"),
]


def _one_op(name, table, cols):
    return migrations.RunSQL(
        sql=f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON public.{table} {cols};",
        reverse_sql=f"DROP INDEX CONCURRENTLY IF EXISTS public.{name};",
    )


class Migration(migrations.Migration):
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction.
    atomic = False

    dependencies = [
        ("uploads", "0019_backfill_missing_fks"),
    ]

    operations = [_one_op(name, table, cols) for name, table, cols in INDEXES_TO_ADD]
