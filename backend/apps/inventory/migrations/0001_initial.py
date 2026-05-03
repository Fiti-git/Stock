"""
Phase 0 — auxiliary tables for the unified-commerce migration. Purely
additive. Two new tables FK'd to existing outlets / items.

The append-only stock ledger itself is NOT created here — apps.items already
owns `stock_movements` (model items.StockMovement, written by
apps.items.inventory.apply_movement()). This migration only adds the
rebuildable balance cache and the ecom reservation table.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("outlets", "0001_initial"),
        ("items", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="StockBalance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("on_hand", models.DecimalField(decimal_places=3, default=0, max_digits=14)),
                ("last_movement_at", models.DateTimeField(blank=True, null=True)),
                ("last_movement_id", models.BigIntegerField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="inventory_balances", to="items.item")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="inventory_balances", to="outlets.outlet")),
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
                    related_name="inventory_reservations", to="items.item")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="inventory_reservations", to="outlets.outlet")),
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
