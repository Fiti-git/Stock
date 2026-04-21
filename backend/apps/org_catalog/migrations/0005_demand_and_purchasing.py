from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("org_catalog", "0004_alter_itemmasterlink_id"),
        ("outlets", "0003_outlet_file_location_name"),
        ("uploads", "0007_supplier_master"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DemandSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("avg_daily_qty_7d", models.FloatField(default=0)),
                ("avg_daily_qty_30d", models.FloatField(default=0)),
                ("avg_daily_qty_90d", models.FloatField(default=0)),
                ("total_qty_30d", models.FloatField(default=0)),
                ("last_sale_date", models.DateField(blank=True, null=True)),
                ("on_hand_qty", models.FloatField(blank=True, null=True)),
                ("computed_at", models.DateTimeField(auto_now=True)),
                (
                    "master_product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="demand_snapshots",
                        to="org_catalog.masterproduct",
                    ),
                ),
                (
                    "outlet",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="demand_snapshots",
                        to="outlets.outlet",
                    ),
                ),
            ],
            options={
                "db_table": "org_demand_snapshots",
            },
        ),
        migrations.AddConstraint(
            model_name="demandsnapshot",
            constraint=models.UniqueConstraint(
                fields=("master_product", "outlet"),
                name="org_demand_unique_master_outlet",
            ),
        ),
        migrations.AddIndex(
            model_name="demandsnapshot",
            index=models.Index(fields=["master_product", "outlet"], name="idx_demand_master_outlet"),
        ),
        migrations.AddIndex(
            model_name="demandsnapshot",
            index=models.Index(fields=["computed_at"], name="idx_demand_computed_at"),
        ),

        migrations.CreateModel(
            name="PurchasePlan",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=200)),
                (
                    "mode",
                    models.CharField(
                        choices=[
                            ("consolidated", "Consolidated per supplier"),
                            ("per_outlet", "Per outlet"),
                        ],
                        default="consolidated",
                        max_length=20,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("approved", "Approved"),
                            ("sent", "Sent"),
                            ("received", "Received"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "supplier",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="purchase_plans",
                        to="uploads.supplier",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="purchase_plans",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="approved_purchase_plans",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "org_purchase_plans",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PurchasePlanLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("suggested_qty", models.FloatField(default=0)),
                ("final_qty", models.FloatField(default=0)),
                ("unit_cost", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("allocation", models.JSONField(blank=True, default=dict)),
                ("notes", models.CharField(blank=True, default="", max_length=300)),
                (
                    "plan",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="org_catalog.purchaseplan",
                    ),
                ),
                (
                    "master_product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="org_catalog.masterproduct",
                    ),
                ),
                (
                    "outlet",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="outlets.outlet",
                    ),
                ),
            ],
            options={
                "db_table": "org_purchase_plan_lines",
                "ordering": ["master_product_id", "outlet_id"],
            },
        ),
    ]
