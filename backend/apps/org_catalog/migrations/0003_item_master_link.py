from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("org_catalog", "0002_alter_masterproduct_id"),
        ("items", "0011_category_master"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ItemMasterLink",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("linked_at", models.DateTimeField(auto_now_add=True)),
                ("confidence", models.FloatField(blank=True, null=True)),
                (
                    "item",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="master_link",
                        to="items.item",
                    ),
                ),
                (
                    "master_product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="item_links",
                        to="org_catalog.masterproduct",
                    ),
                ),
                (
                    "linked_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "org_item_master_links",
                "ordering": ["-linked_at"],
            },
        ),
    ]
