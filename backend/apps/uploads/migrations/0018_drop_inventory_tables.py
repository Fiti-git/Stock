"""
Drop the orphaned tables left behind by the removed `apps.inventory` app.

`apps.inventory` was Phase-0 scaffolding for an ecom checkout flow that was
subsequently reverted along with the POS/ecom/storefront split. The models
(StockBalance, StockReservation) were never wired to any UI or ledger, and
the signals stayed gated by INVENTORY_LEDGER_ENABLED=False. On prod the
tables carried 0 balance rows and 3 dead reservation rows from a May 2026
ecom experiment.

Why this lives in `uploads`: the inventory app is being deleted along with
its migration tree — same pattern as 0014/0016/0017.

Safe to run more than once — DROP TABLE uses IF EXISTS and the
django_migrations purge is a no-op once the rows are gone.
"""

from django.db import migrations


TABLES_TO_DROP = [
    "stock_reservations",
    "stock_balances",
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

    DELETE FROM django_migrations WHERE app = 'inventory';
    """


class Migration(migrations.Migration):
    dependencies = [
        ("uploads", "0017_drop_licensing_tables"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_drop_sql(),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
