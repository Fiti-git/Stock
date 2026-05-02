"""
Phase 0 — stock movement ledger schema.

Purely additive. Creates three new tables:
  - stock_movements   (append-only ledger)
  - stock_balances    (rebuildable cache of current on-hand)
  - stock_reservations (soft holds for ecom checkout)

Existing tables are NOT touched. The signals that feed this ledger are
gated behind settings.INVENTORY_LEDGER_ENABLED and default to OFF so the
live system is unaffected by this migration.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("outlets", "0001_initial"),
        ("items", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="StockMovement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("qty", models.DecimalField(decimal_places=3, max_digits=14)),
                ("movement_type", models.CharField(max_length=20, choices=[
                    ("opening_balance", "Opening Balance"),
                    ("grn", "GRN (Receipt)"),
                    ("sale", "Sale"),
                    ("sales_return", "Sales Return"),
                    ("damage", "Damage / Wastage"),
                    ("office_use", "Office Use"),
                    ("rts", "Return to Supplier"),
                    ("transfer_out", "Transfer Out"),
                    ("transfer_in", "Transfer In"),
                    ("count_adjust", "Count Adjustment"),
                    ("manual_adjust", "Manual Adjustment"),
                ])),
                ("source_table", models.CharField(max_length=40, db_index=True)),
                ("source_id", models.BigIntegerField()),
                ("source_doc", models.CharField(blank=True, default="", max_length=80)),
                ("unit_cost", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("batch_id", models.CharField(blank=True, default="", max_length=60)),
                ("expiry_date", models.DateField(blank=True, null=True)),
                ("moved_at", models.DateTimeField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("notes", models.CharField(blank=True, default="", max_length=500)),
                ("created_by", models.ForeignKey(blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="stock_movements", to=settings.AUTH_USER_MODEL)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name="stock_movements", to="items.item")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name="stock_movements", to="outlets.outlet")),
            ],
            options={
                "db_table": "stock_movements",
                "ordering": ["-moved_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="stockmovement",
            index=models.Index(fields=["outlet", "item", "moved_at"], name="stock_mv_o_i_m_idx"),
        ),
        migrations.AddIndex(
            model_name="stockmovement",
            index=models.Index(fields=["outlet", "moved_at"], name="stock_mv_o_m_idx"),
        ),
        migrations.AddIndex(
            model_name="stockmovement",
            index=models.Index(fields=["movement_type"], name="stock_mv_type_idx"),
        ),
        migrations.AddConstraint(
            model_name="stockmovement",
            constraint=models.UniqueConstraint(
                fields=["source_table", "source_id", "movement_type"],
                name="uniq_movement_source",
            ),
        ),
        migrations.CreateModel(
            name="StockBalance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("on_hand", models.DecimalField(decimal_places=3, default=0, max_digits=14)),
                ("last_movement_at", models.DateTimeField(blank=True, null=True)),
                ("last_movement_id", models.BigIntegerField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="stock_balances", to="items.item")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="stock_balances", to="outlets.outlet")),
            ],
            options={"db_table": "stock_balances"},
        ),
        migrations.AddConstraint(
            model_name="stockbalance",
            constraint=models.UniqueConstraint(fields=["outlet", "item"], name="uniq_balance_outlet_item"),
        ),
        migrations.AddIndex(
            model_name="stockbalance",
            index=models.Index(fields=["outlet", "item"], name="stock_bal_o_i_idx"),
        ),
        migrations.CreateModel(
            name="StockReservation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("qty", models.DecimalField(decimal_places=3, max_digits=14)),
                ("status", models.CharField(default="active", max_length=12, choices=[
                    ("active", "Active"), ("consumed", "Consumed"),
                    ("expired", "Expired"), ("released", "Released"),
                ])),
                ("owner_table", models.CharField(blank=True, default="", max_length=40)),
                ("owner_id", models.BigIntegerField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="stock_reservations", to="items.item")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="stock_reservations", to="outlets.outlet")),
            ],
            options={"db_table": "stock_reservations"},
        ),
        migrations.AddIndex(
            model_name="stockreservation",
            index=models.Index(fields=["outlet", "item", "status"], name="stock_resv_o_i_s_idx"),
        ),
        migrations.AddIndex(
            model_name="stockreservation",
            index=models.Index(fields=["status", "expires_at"], name="stock_resv_s_e_idx"),
        ),
        migrations.AddIndex(
            model_name="stockreservation",
            index=models.Index(fields=["owner_table", "owner_id"], name="stock_resv_owner_idx"),
        ),
    ]
