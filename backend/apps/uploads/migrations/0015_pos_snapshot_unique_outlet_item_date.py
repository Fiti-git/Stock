"""
Make PosSnapshot truly unique per (outlet, item, snapshot_date).

The previous `unique_together = ("upload_batch", "item")` only prevented
duplicates *within a single upload*, so a second same-day upload silently
inserted a parallel set of rows. Every report that aggregated pos_snapshots
(Daily Upload Report, Stock Variance, Negative POS, Shrinkage, dashboards)
inflated by the number of uploads per day — outlet 4 on 2026-05-19 had 4
uploads → every item appeared 4× → totals 4× too high.

Plan:
  1. Delete the duplicate rows, keeping the latest (max id) per
     (outlet, item, snapshot_date). ~122k rows of ~924k.
  2. Drop the old unique_together and add the new one.

Step 1 must precede step 2 — adding the unique constraint on duplicate
data would fail.

Going forward, apps.uploads.views uses
`bulk_create(unique_fields=["outlet","item","snapshot_date"], update_conflicts=True)`
so the second upload of a day upserts onto the same row instead of inserting
a duplicate.

Reverse: we cannot resurrect deleted rows. Migration is one-way safe — the
deleted rows were always wrong data, never user input.
"""

from django.db import migrations


DEDUP_SQL = """
DELETE FROM pos_snapshots ps
USING (
    SELECT id
      FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                     PARTITION BY outlet_id, item_id, snapshot_date
                     ORDER BY id DESC
                 ) AS rn
            FROM pos_snapshots
      ) ranked
     WHERE ranked.rn > 1
) victims
WHERE ps.id = victims.id;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("uploads", "0014_drop_pos_ecom_storefront"),
    ]

    operations = [
        # 1. Deduplicate. ORDER BY id DESC keeps the most recently inserted
        #    row per (outlet, item, date) — i.e. the latest upload wins,
        #    which matches the intuition that a re-upload overrides the
        #    earlier one.
        migrations.RunSQL(
            sql=DEDUP_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        # 2. Swap the unique_together. Django drops the old (upload_batch,
        #    item) unique index and creates the new (outlet, item,
        #    snapshot_date) one. Step 1 guarantees no conflicts.
        migrations.AlterUniqueTogether(
            name="possnapshot",
            unique_together={("outlet", "item", "snapshot_date")},
        ),
    ]
