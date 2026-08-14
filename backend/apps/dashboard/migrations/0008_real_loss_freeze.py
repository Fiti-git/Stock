from datetime import timedelta
import bisect

from django.db import migrations, models
from django.utils import timezone


def backfill_real_loss(apps, schema_editor):
    """
    Best-effort backfill: for every StockCount with a frozen anchor
    (pos_qty_at_count + pos_snapshot_at_count), compute expected_qty
    using CURRENT txn data (post-migration snapshot).

    Bulk-fetches all txn line tables in one pass, indexes them by
    (outlet, item), then per-count bisects the delta window.

    Rows without a frozen anchor stay NULL; they'll show "—" in the
    report until a rerun freezes them.
    """
    StockCount = apps.get_model("dashboard", "StockCount")
    Item = apps.get_model("items", "Item")
    PosSnapshot = apps.get_model("uploads", "PosSnapshot")
    SalesLine = apps.get_model("uploads", "SalesLine")
    SalesReturnLine = apps.get_model("uploads", "SalesReturnLine")
    DamageLine = apps.get_model("uploads", "DamageLine")
    OfficeLine = apps.get_model("uploads", "OfficeLine")
    VerificationLine = apps.get_model("uploads", "VerificationLine")
    GrnLine = apps.get_model("uploads", "GrnLine")
    RtsLine = apps.get_model("uploads", "RtsLine")

    counts_qs = (
        StockCount.objects
        .filter(pos_qty_at_count__isnull=False, real_expected_qty__isnull=True)
        .exclude(approval_status="rejected")
        .select_related("pos_snapshot_at_count")
    )
    if not counts_qs.exists():
        return

    # Load all counts into memory (per-outlet chunks to keep memory bounded).
    from collections import defaultdict
    counts_by_outlet = defaultdict(list)
    for c in counts_qs.only(
        "id", "outlet_id", "item_id", "count_date",
        "actual_qty", "pos_qty_at_count", "pos_snapshot_at_count_id",
    ).iterator(chunk_size=1000):
        counts_by_outlet[c.outlet_id].append(c)

    # Resolve item_code per (outlet, item_id) for txn joins.
    item_ids = {c.item_id for lst in counts_by_outlet.values() for c in lst}
    item_code_map = {
        it.id: it.item_code
        for it in Item.objects.filter(id__in=item_ids).only("id", "item_code")
    }
    item_cost_map = {
        it.id: float(it.cost_price or 0)
        for it in Item.objects.filter(id__in=item_ids).only("id", "cost_price")
    }
    # Anchor date lookup via FK.
    snap_ids = {c.pos_snapshot_at_count_id for lst in counts_by_outlet.values() for c in lst if c.pos_snapshot_at_count_id}
    snap_date_map = {
        s.id: s.snapshot_date
        for s in PosSnapshot.objects.filter(id__in=snap_ids).only("id", "snapshot_date")
    }
    # Latest snapshot cost per (outlet, item) — same basis as the report.
    latest_cost_map = {}
    outlet_ids = list(counts_by_outlet.keys())
    for r in (
        PosSnapshot.objects
        .filter(outlet_id__in=outlet_ids, item_id__in=item_ids)
        .order_by("outlet_id", "item_id", "-snapshot_date")
        .values("outlet_id", "item_id", "cost_price")
    ):
        pair = (r["outlet_id"], r["item_id"])
        if pair in latest_cost_map:
            continue
        if r["cost_price"] is not None:
            latest_cost_map[pair] = float(r["cost_price"])

    # Process one outlet at a time to keep per-outlet txn index bounded.
    updates = []
    for oid, counts in counts_by_outlet.items():
        # Codes present in this outlet's counts.
        outlet_item_ids = {c.item_id for c in counts}
        outlet_codes = {item_code_map.get(iid) for iid in outlet_item_ids if item_code_map.get(iid)}
        if not outlet_codes:
            continue
        # Date range we need txns for.
        earliest_anchor = min(
            (snap_date_map.get(c.pos_snapshot_at_count_id) or c.count_date)
            for c in counts
        )
        latest_count = max(c.count_date for c in counts)

        def _index(qs, has_free=False):
            """(outlet, item_code, txn_date) → total qty aggregation, indexed by (item_id) → sorted [(date, qty), ...]."""
            from django.db.models import Sum
            if has_free:
                rows = qs.values("item_code", "txn_date").annotate(
                    _sum_qty=Sum("qty"), _sum_free=Sum("free_qty"),
                )
                acc = {}
                for r in rows:
                    key = (r["item_code"], r["txn_date"])
                    acc[key] = acc.get(key, 0.0) + float(r["_sum_qty"] or 0) + float(r["_sum_free"] or 0)
            else:
                rows = qs.values("item_code", "txn_date").annotate(_sum=Sum("qty"))
                acc = {(r["item_code"], r["txn_date"]): float(r["_sum"] or 0) for r in rows}
            # Reindex by item_id via item_code_map reverse lookup.
            reverse_code = {code: iid for iid, code in item_code_map.items() if iid in outlet_item_ids}
            by_item = {}
            for (code, d), v in acc.items():
                iid = reverse_code.get(code)
                if iid is None:
                    continue
                by_item.setdefault(iid, []).append((d, v))
            for iid in by_item:
                by_item[iid].sort()
            return by_item

        common_filter = dict(
            outlet_id=oid,
            item_code__in=outlet_codes,
            txn_date__gte=earliest_anchor,
            txn_date__lte=latest_count,
        )
        sales_idx = _index(SalesLine.objects.filter(**common_filter))
        returns_idx = _index(SalesReturnLine.objects.filter(**common_filter))
        damage_idx = _index(DamageLine.objects.filter(**common_filter))
        office_idx = _index(OfficeLine.objects.filter(**common_filter))
        verification_idx = _index(VerificationLine.objects.filter(**common_filter))
        grn_idx = _index(GrnLine.objects.filter(**common_filter), has_free=True)
        rts_idx = _index(RtsLine.objects.filter(**common_filter), has_free=True)

        def _sum_window(idx, iid, day_from, day_to):
            arr = idx.get(iid)
            if not arr:
                return 0.0
            dates_only = [d for d, _ in arr]
            lo = bisect.bisect_left(dates_only, day_from)
            hi = bisect.bisect_right(dates_only, day_to)
            return sum(v for _, v in arr[lo:hi])

        for c in counts:
            anchor_qty = float(c.pos_qty_at_count) if c.pos_qty_at_count is not None else None
            anchor_date = snap_date_map.get(c.pos_snapshot_at_count_id) if c.pos_snapshot_at_count_id else None
            if anchor_qty is None or anchor_date is None:
                continue
            day_from = anchor_date + timedelta(days=1)
            day_to = c.count_date
            s = _sum_window(sales_idx, c.item_id, day_from, day_to)
            r = _sum_window(returns_idx, c.item_id, day_from, day_to)
            d_ = _sum_window(damage_idx, c.item_id, day_from, day_to)
            o = _sum_window(office_idx, c.item_id, day_from, day_to)
            v = _sum_window(verification_idx, c.item_id, day_from, day_to)
            g = _sum_window(grn_idx, c.item_id, day_from, day_to)
            rts = _sum_window(rts_idx, c.item_id, day_from, day_to)
            expected = anchor_qty + g + r + v - s - rts - d_ - o
            variance = float(c.actual_qty or 0) - expected
            cost = latest_cost_map.get((c.outlet_id, c.item_id), item_cost_map.get(c.item_id, 0.0))
            value = variance * cost
            c.real_expected_qty = expected
            c.real_variance = variance
            c.real_value = value
            c.real_freeze_at = timezone.now()
            c.real_freeze_source = "backfill"
            c.real_txn_breakdown = {
                "grn": g, "sales": s, "returns": r, "damage": d_,
                "office": o, "rts": rts, "verification": v,
            }
            updates.append(c)
            if len(updates) >= 500:
                StockCount.objects.bulk_update(
                    updates,
                    [
                        "real_expected_qty", "real_variance", "real_value",
                        "real_freeze_at", "real_freeze_source", "real_txn_breakdown",
                    ],
                    batch_size=500,
                )
                updates.clear()
    if updates:
        StockCount.objects.bulk_update(
            updates,
            [
                "real_expected_qty", "real_variance", "real_value",
                "real_freeze_at", "real_freeze_source", "real_txn_breakdown",
            ],
            batch_size=500,
        )


def unbackfill(apps, schema_editor):
    StockCount = apps.get_model("dashboard", "StockCount")
    StockCount.objects.update(
        real_expected_qty=None, real_variance=None, real_value=None,
        real_freeze_at=None, real_freeze_source="", real_txn_breakdown=None,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("dashboard", "0007_stockcount_pos_qty_at_count"),
        ("uploads", "0001_initial"),
        ("accounts", "0001_initial"),
        ("items", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="stockcount",
            name="real_expected_qty",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="real_variance",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="real_value",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=16, null=True),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="real_freeze_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="real_freeze_source",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="real_txn_breakdown",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="RealLossRerunHistory",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ran_at", models.DateTimeField(auto_now_add=True)),
                ("source", models.CharField(max_length=16)),
                ("prev_expected", models.DecimalField(decimal_places=3, max_digits=14, null=True)),
                ("prev_variance", models.DecimalField(decimal_places=3, max_digits=14, null=True)),
                ("prev_value", models.DecimalField(decimal_places=2, max_digits=16, null=True)),
                ("new_expected", models.DecimalField(decimal_places=3, max_digits=14, null=True)),
                ("new_variance", models.DecimalField(decimal_places=3, max_digits=14, null=True)),
                ("new_value", models.DecimalField(decimal_places=2, max_digits=16, null=True)),
                ("count", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="real_loss_reruns", to="dashboard.stockcount")),
                ("ran_by", models.ForeignKey(null=True, on_delete=models.deletion.SET_NULL, related_name="real_loss_reruns", to="accounts.user")),
            ],
            options={
                "db_table": "real_loss_rerun_history",
                "ordering": ["-ran_at"],
                "indexes": [models.Index(fields=["count", "-ran_at"], name="real_loss_r_count_i_2fdd6c_idx")],
            },
        ),
        migrations.RunPython(backfill_real_loss, unbackfill),
    ]
