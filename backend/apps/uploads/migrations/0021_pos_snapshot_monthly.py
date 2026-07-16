"""
Add pos_snapshots_monthly — the (outlet, item, year_month) rollup fact
table that long-range reports read instead of scanning raw daily
snapshots.

Only the CreateModel + indexes + unique constraint are shipped here.
Django's makemigrations wanted to bundle several unrelated RenameIndex
and AlterField(id) operations against pos_snapshots and uploaded_sheets
— those are cosmetic drift (Django's index naming scheme changed
between versions, plus AutoField→BigAutoField). AlterField on the id
column of 2.37M-row pos_snapshots would rewrite the whole table and
lock it for many seconds. Not worth the risk when this migration's
job is just to create a brand new empty table.

If we ever want to sync those index/PK cosmetics later, do it in a
dedicated migration with proper timing.
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0024_item_is_daily_count"),
        ("outlets", "0004_receipt_and_lankaqr_fields"),
        ("uploads", "0020_perf_indexes"),
    ]

    operations = [
        migrations.CreateModel(
            name="PosSnapshotMonthly",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year_month", models.DateField()),
                ("snapshot_days_recorded", models.IntegerField(default=0)),
                ("month_end_date", models.DateField(blank=True, null=True)),
                ("end_pos_quantity", models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True)),
                ("end_cost_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("end_selling_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("avg_pos_quantity", models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True)),
                ("min_pos_quantity", models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True)),
                ("max_pos_quantity", models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True)),
                ("total_counted_qty", models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True)),
                ("count_sessions_count", models.IntegerField(default=0)),
                ("total_variance_qty", models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True)),
                ("total_variance_value", models.DecimalField(blank=True, decimal_places=2, max_digits=16, null=True)),
                ("first_upload_at", models.DateTimeField(blank=True, null=True)),
                ("last_upload_at", models.DateTimeField(blank=True, null=True)),
                ("rebuilt_at", models.DateTimeField(auto_now=True)),
                (
                    "item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pos_monthly_snapshots",
                        to="items.item",
                    ),
                ),
                (
                    "outlet",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pos_monthly_snapshots",
                        to="outlets.outlet",
                    ),
                ),
            ],
            options={
                "db_table": "pos_snapshots_monthly",
            },
        ),
        migrations.AddIndex(
            model_name="possnapshotmonthly",
            index=models.Index(fields=["outlet", "year_month"], name="pos_snapsho_outlet__324e53_idx"),
        ),
        migrations.AddIndex(
            model_name="possnapshotmonthly",
            index=models.Index(fields=["item", "year_month"], name="pos_snapsho_item_id_e06317_idx"),
        ),
        migrations.AddIndex(
            model_name="possnapshotmonthly",
            index=models.Index(fields=["year_month"], name="pos_snapsho_year_mo_9ac9f2_idx"),
        ),
        migrations.AddConstraint(
            model_name="possnapshotmonthly",
            constraint=models.UniqueConstraint(
                fields=("outlet", "item", "year_month"),
                name="pos_monthly_outlet_item_month_uniq",
            ),
        ),
    ]
