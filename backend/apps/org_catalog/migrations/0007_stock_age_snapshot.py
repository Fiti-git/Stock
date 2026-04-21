from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("org_catalog", "0006_remove_demandsnapshot_org_demand_unique_master_outlet_and_more"),
        ("outlets", "0003_outlet_file_location_name"),
        ("items", "0012_alter_category_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="StockAgeSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("on_hand_qty", models.FloatField(default=0)),
                ("oldest_lot_date", models.DateField(blank=True, null=True)),
                ("oldest_lot_age_days", models.IntegerField(default=0)),
                ("weighted_avg_age_days", models.FloatField(default=0)),
                ("bucket_0_30", models.FloatField(default=0)),
                ("bucket_31_60", models.FloatField(default=0)),
                ("bucket_61_90", models.FloatField(default=0)),
                ("bucket_90_plus", models.FloatField(default=0)),
                ("unknown_age_qty", models.FloatField(default=0)),
                ("latest_pos_qty", models.FloatField(blank=True, null=True)),
                ("latest_pos_date", models.DateField(blank=True, null=True)),
                ("on_hand_value", models.FloatField(default=0)),
                ("computed_at", models.DateTimeField(auto_now=True)),
                (
                    "outlet",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="stock_age_snapshots",
                        to="outlets.outlet",
                    ),
                ),
                (
                    "item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="stock_age_snapshots",
                        to="items.item",
                    ),
                ),
                (
                    "master_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="stock_age_snapshots",
                        to="org_catalog.masterproduct",
                    ),
                ),
            ],
            options={
                "db_table": "stock_age_snapshots",
                "unique_together": {("outlet", "item")},
            },
        ),
        migrations.AddIndex(
            model_name="stockagesnapshot",
            index=models.Index(fields=["outlet", "item"], name="stock_age_outlet_item_idx"),
        ),
        migrations.AddIndex(
            model_name="stockagesnapshot",
            index=models.Index(fields=["oldest_lot_age_days"], name="stock_age_oldest_idx"),
        ),
        migrations.AddIndex(
            model_name="stockagesnapshot",
            index=models.Index(fields=["computed_at"], name="stock_age_computed_idx"),
        ),
    ]
