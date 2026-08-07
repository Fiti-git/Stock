from django.db import migrations, models


def backfill_frozen_pos(apps, schema_editor):
    """
    Best-effort backfill: for every existing StockCount without a frozen
    POS qty, pick the latest PosSnapshot for (outlet, item) with
    snapshot_date <= count_date. Not perfect — if the snapshot on a past
    date has been re-uploaded since the count, we can only recover the
    CURRENT value, not the value that was live at count time. That's the
    price of not having captured it originally.

    Runs a single pass grouped by (outlet, item) to avoid N queries.
    """
    StockCount = apps.get_model("dashboard", "StockCount")
    PosSnapshot = apps.get_model("uploads", "PosSnapshot")

    total = StockCount.objects.filter(pos_qty_at_count__isnull=True).count()
    if not total:
        return

    # Pull all counts needing backfill, ordered so we can group.
    counts = (
        StockCount.objects.filter(pos_qty_at_count__isnull=True)
        .order_by("outlet_id", "item_id", "count_date")
        .only("id", "outlet_id", "item_id", "count_date")
    )
    # Per (outlet, item), fetch all snapshots ascending once and bisect.
    import bisect
    from itertools import groupby
    updates = []
    for (outlet_id, item_id), group in groupby(
        counts, key=lambda c: (c.outlet_id, c.item_id),
    ):
        group = list(group)
        snap_rows = list(
            PosSnapshot.objects
            .filter(outlet_id=outlet_id, item_id=item_id)
            .order_by("snapshot_date")
            .values("id", "snapshot_date", "pos_quantity")
        )
        if not snap_rows:
            continue
        dates = [s["snapshot_date"] for s in snap_rows]
        for c in group:
            idx = bisect.bisect_right(dates, c.count_date) - 1
            if idx < 0:
                continue
            snap = snap_rows[idx]
            c.pos_qty_at_count = snap["pos_quantity"]
            c.pos_snapshot_at_count_id = snap["id"]
            updates.append(c)
            if len(updates) >= 1000:
                StockCount.objects.bulk_update(
                    updates,
                    ["pos_qty_at_count", "pos_snapshot_at_count"],
                    batch_size=1000,
                )
                updates.clear()
    if updates:
        StockCount.objects.bulk_update(
            updates,
            ["pos_qty_at_count", "pos_snapshot_at_count"],
            batch_size=1000,
        )


def unbackfill(apps, schema_editor):
    StockCount = apps.get_model("dashboard", "StockCount")
    StockCount.objects.update(pos_qty_at_count=None, pos_snapshot_at_count=None)


class Migration(migrations.Migration):

    dependencies = [
        ("dashboard", "0006_rename_count_sess_outlet_date_idx_count_sessi_outlet__42b2d8_idx_and_more"),
        ("uploads", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="stockcount",
            name="pos_qty_at_count",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="pos_snapshot_at_count",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="+",
                to="uploads.possnapshot",
            ),
        ),
        migrations.RunPython(backfill_frozen_pos, unbackfill),
    ]
