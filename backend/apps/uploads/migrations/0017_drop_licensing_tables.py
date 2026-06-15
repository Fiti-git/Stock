"""
Drop the orphaned tables left behind by the removed `apps.licensing` app.

Why this lives in `uploads`: the licensing app was deleted along with its
migration tree, so we hang the cleanup off a surviving app — same pattern as
`0014_drop_pos_ecom_storefront` and `0016_drop_transfers_tables`.

Safe to run more than once — DROP TABLE uses IF EXISTS and the
django_migrations purge is a no-op once the rows are gone.
"""

from django.db import migrations


TABLES_TO_DROP = [
    "licensing_cachedlicense",
    "licensing_licenseconfigauditlog",
    "licensing_licenseconfiguration",
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

    DELETE FROM django_migrations WHERE app = 'licensing';
    """


class Migration(migrations.Migration):
    dependencies = [
        ("uploads", "0016_drop_transfers_tables"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_drop_sql(),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
