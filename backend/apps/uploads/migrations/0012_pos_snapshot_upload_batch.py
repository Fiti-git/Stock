"""
Multi-upload POS snapshots: link each PosSnapshot to its UploadLog batch so
multiple uploads can coexist on the same calendar date. Replaces the
(outlet, item, snapshot_date) uniqueness with (upload_batch, item).

Backfill: each existing row is mapped to the latest non-deleted UploadLog
for the same (outlet, snapshot_date). Rows with no matching log get a
synthetic UploadLog so nothing is orphaned.

SQL is idempotent — safe against prod DB drift.
"""
from django.db import migrations, models


SQL_UP = r"""
DO $$
DECLARE
    _missing INT;
BEGIN
    -- 1. Add column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'pos_snapshots'
          AND column_name = 'upload_batch_id'
    ) THEN
        ALTER TABLE pos_snapshots ADD COLUMN upload_batch_id BIGINT NULL;
    END IF;

    -- 2. Backfill: latest non-deleted UploadLog for each (outlet, snapshot_date)
    UPDATE pos_snapshots ps
       SET upload_batch_id = ul.id
      FROM (
        SELECT DISTINCT ON (outlet_id, snapshot_date)
               id, outlet_id, snapshot_date
          FROM upload_logs
         WHERE status <> 'deleted'
         ORDER BY outlet_id, snapshot_date, uploaded_at DESC
      ) ul
     WHERE ps.upload_batch_id IS NULL
       AND ps.outlet_id = ul.outlet_id
       AND ps.snapshot_date = ul.snapshot_date;

    -- 3. Synthetic UploadLog for any leftover (orphan snapshots with no batch)
    SELECT COUNT(*) INTO _missing
      FROM pos_snapshots WHERE upload_batch_id IS NULL;

    IF _missing > 0 THEN
        WITH orphans AS (
            SELECT DISTINCT outlet_id, snapshot_date
              FROM pos_snapshots
             WHERE upload_batch_id IS NULL
        ),
        inserted AS (
            INSERT INTO upload_logs
                (outlet_id, snapshot_date, uploaded_at, status,
                 total_rows, matched_rows, new_items_count, changed_items_count,
                 filename, approval_status)
            SELECT o.outlet_id,
                   o.snapshot_date,
                   COALESCE(
                       (SELECT MIN(uploaded_at) FROM pos_snapshots p
                         WHERE p.outlet_id = o.outlet_id
                           AND p.snapshot_date = o.snapshot_date),
                       NOW()
                   ),
                   'success',
                   0, 0, 0, 0,
                   '(synthetic-backfill)',
                   'auto'
              FROM orphans o
            RETURNING id, outlet_id, snapshot_date
        )
        UPDATE pos_snapshots ps
           SET upload_batch_id = i.id
          FROM inserted i
         WHERE ps.upload_batch_id IS NULL
           AND ps.outlet_id = i.outlet_id
           AND ps.snapshot_date = i.snapshot_date;
    END IF;

    -- 4. Add FK constraint if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND table_name = 'pos_snapshots'
          AND constraint_name = 'pos_snapshots_upload_batch_id_fkey'
    ) THEN
        ALTER TABLE pos_snapshots
        ADD CONSTRAINT pos_snapshots_upload_batch_id_fkey
        FOREIGN KEY (upload_batch_id) REFERENCES upload_logs(id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED;
    END IF;

    -- 5. Drop the old (outlet_id, item_id, snapshot_date) unique index/constraint
    --    Catch both possible names (auto-named and the one from 0011).
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'pos_snapshots'
          AND indexname = 'pos_snapshots_outlet_item_date_uniq'
    ) THEN
        DROP INDEX pos_snapshots_outlet_item_date_uniq;
    END IF;

    -- Drop any auto-created unique constraint on the same triple
    PERFORM 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'pos_snapshots' AND c.contype = 'u';
    -- (no-op probe; specific name handled below if present)

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND table_name = 'pos_snapshots'
          AND constraint_name = 'pos_snapshots_outlet_id_item_id_snapshot_date_uniq'
    ) THEN
        ALTER TABLE pos_snapshots
        DROP CONSTRAINT pos_snapshots_outlet_id_item_id_snapshot_date_uniq;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND table_name = 'pos_snapshots'
          AND constraint_name = 'uploads_possnapshot_outlet_id_item_id_snapshot_date_uniq'
    ) THEN
        ALTER TABLE pos_snapshots
        DROP CONSTRAINT uploads_possnapshot_outlet_id_item_id_snapshot_date_uniq;
    END IF;

    -- 6. Create the new unique index on (upload_batch_id, item_id) if missing
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'pos_snapshots'
          AND indexname = 'pos_snapshots_batch_item_uniq'
    ) THEN
        CREATE UNIQUE INDEX pos_snapshots_batch_item_uniq
        ON pos_snapshots (upload_batch_id, item_id);
    END IF;

    -- 7. Hot-path index for "latest snapshot for (outlet, item) at time T"
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'pos_snapshots'
          AND indexname = 'pos_snap_outlet_item_uploaded_idx'
    ) THEN
        CREATE INDEX pos_snap_outlet_item_uploaded_idx
        ON pos_snapshots (outlet_id, item_id, uploaded_at DESC);
    END IF;
END$$;
"""

SQL_DOWN = r"""
DROP INDEX IF EXISTS pos_snap_outlet_item_uploaded_idx;
DROP INDEX IF EXISTS pos_snapshots_batch_item_uniq;
ALTER TABLE pos_snapshots DROP CONSTRAINT IF EXISTS pos_snapshots_upload_batch_id_fkey;
ALTER TABLE pos_snapshots DROP COLUMN IF EXISTS upload_batch_id;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("uploads", "0011_ensure_pos_snapshot_unique"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(SQL_UP, SQL_DOWN),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="possnapshot",
                    name="upload_batch",
                    field=models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.CASCADE,
                        related_name="snapshots",
                        to="uploads.uploadlog",
                    ),
                ),
                migrations.AlterUniqueTogether(
                    name="possnapshot",
                    unique_together={("upload_batch", "item")},
                ),
                migrations.AddIndex(
                    model_name="possnapshot",
                    index=models.Index(
                        fields=["outlet", "item", "-uploaded_at"],
                        name="pos_snap_outlet_item_uploaded_idx",
                    ),
                ),
            ],
        ),
    ]
