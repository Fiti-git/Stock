from django.db import migrations


SQL_UP = r"""
DO $$
BEGIN
    -- Drop any duplicate rows that would block the unique index.
    -- Keeps the oldest id, deletes the rest.
    DELETE FROM pos_snapshots a
    USING pos_snapshots b
    WHERE a.id > b.id
      AND a.outlet_id = b.outlet_id
      AND a.item_id = b.item_id
      AND a.snapshot_date = b.snapshot_date;

    -- Create the unique index ON CONFLICT needs, if it isn't already there.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'pos_snapshots'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%(outlet_id, item_id, snapshot_date)%'
    ) THEN
        CREATE UNIQUE INDEX pos_snapshots_outlet_item_date_uniq
        ON pos_snapshots (outlet_id, item_id, snapshot_date);
    END IF;
END$$;
"""

SQL_DOWN = r"""
DROP INDEX IF EXISTS pos_snapshots_outlet_item_date_uniq;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("uploads", "0010_rename_pos_snap_outlet_date_idx_pos_snapsho_outlet__6a7517_idx_and_more"),
    ]

    operations = [
        migrations.RunSQL(SQL_UP, SQL_DOWN),
    ]
