"""
Drop the orphan tables left behind by the removed `apps.transfers` Django app.

Tables were empty in prod (0 rows across stock_transfers, stock_transfer_lines,
stock_transfer_events) and the feature was never used past a handful of clicks.

Lives in `apps.uploads` for the same reason as 0014_drop_pos_ecom_storefront —
the source app (and its migration tree) is gone, so we hang the cleanup off a
surviving app. Idempotent: DROP TABLE IF EXISTS CASCADE works on fresh dev
installs that never had these tables.
"""

from django.db import migrations


TABLES_TO_DROP = [
    "stock_transfer_events",
    "stock_transfer_lines",
    "stock_transfers",
]


def _drop_sql():
    inner = "\n        ".join(
        f"EXECUTE 'DROP TABLE IF EXISTS public.{t} CASCADE';"
        for t in TABLES_TO_DROP
    )
    return f"""
    DO $$
    BEGIN
        {inner}
    END$$;

    DELETE FROM django_migrations WHERE app = 'transfers';
    """


class Migration(migrations.Migration):
    dependencies = [
        ("uploads", "0015_pos_snapshot_unique_outlet_item_date"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_drop_sql(),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
