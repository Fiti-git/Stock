from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("items", "0011_category_master"),
        ("uploads", "0007_supplier_master"),
    ]

    operations = [
        migrations.CreateModel(
            name="MasterProduct",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("master_code", models.CharField(max_length=50, unique=True)),
                ("name", models.CharField(max_length=300)),
                ("brand", models.CharField(blank=True, default="", max_length=200)),
                ("pack_size", models.CharField(blank=True, default="", max_length=50)),
                (
                    "unit",
                    models.CharField(
                        choices=[
                            ("EA", "Each"),
                            ("KG", "Kilogram"),
                            ("G", "Gram"),
                            ("L", "Litre"),
                            ("ML", "Millilitre"),
                            ("PK", "Pack"),
                        ],
                        default="EA",
                        max_length=4,
                    ),
                ),
                ("min_order_qty", models.PositiveIntegerField(default=1)),
                ("pack_multiple", models.PositiveIntegerField(default=1)),
                ("target_days_of_cover", models.PositiveIntegerField(default=14)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "category",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="master_products",
                        to="items.category",
                    ),
                ),
                (
                    "default_supplier",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="master_products",
                        to="uploads.supplier",
                    ),
                ),
            ],
            options={
                "db_table": "org_master_products",
                "ordering": ["master_code"],
            },
        ),
    ]
