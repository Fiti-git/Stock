from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("items", "0013_item_is_nbci"),
        ("outlets", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name="item", name="on_hand", field=models.DecimalField(decimal_places=3, default=0, max_digits=14)),
        migrations.AddField(model_name="item", name="tax_rate_pct", field=models.DecimalField(decimal_places=3, default=0, max_digits=6)),
        migrations.AddField(model_name="item", name="sell_price", field=models.DecimalField(decimal_places=2, default=0, max_digits=14)),

        migrations.CreateModel(
            name="StockMovement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(
                    choices=[
                        ("opening", "Opening Balance"),
                        ("sale", "POS Sale"),
                        ("void", "Bill Void"),
                        ("return", "Customer Return"),
                        ("grn", "Goods Received"),
                        ("damage", "Damage / Wastage"),
                        ("adjustment", "Manual Adjustment"),
                        ("variance", "Variance Correction"),
                        ("transfer_in", "Transfer In"),
                        ("transfer_out", "Transfer Out"),
                    ], max_length=20)),
                ("qty_change", models.DecimalField(decimal_places=3, max_digits=14)),
                ("balance_after", models.DecimalField(decimal_places=3, max_digits=14)),
                ("unit_cost", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("ref_type", models.CharField(blank=True, default="", max_length=40)),
                ("ref_id", models.CharField(blank=True, default="", max_length=40)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stock_movements", to="outlets.outlet")),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stock_movements", to="items.item")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="stock_movements", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "stock_movements", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="stockmovement", index=models.Index(fields=["outlet", "item", "-created_at"], name="stmov_outlet_item_idx")),
        migrations.AddIndex(model_name="stockmovement", index=models.Index(fields=["kind", "-created_at"], name="stmov_kind_idx")),
        migrations.AddIndex(model_name="stockmovement", index=models.Index(fields=["ref_type", "ref_id"], name="stmov_ref_idx")),
    ]
