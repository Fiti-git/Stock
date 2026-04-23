from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("items", "0014_item_inventory_fields_and_stock_movement"),
        ("outlets", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ItemPriceHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("old_sell", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("new_sell", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("old_cost", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("new_cost", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("source", models.CharField(blank=True, default="manual", max_length=40)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="price_history", to="items.item")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="price_history", to="outlets.outlet")),
                ("changed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="price_changes", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "item_price_history", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="itempricehistory", index=models.Index(fields=["item", "-created_at"], name="ph_item_idx")),
        migrations.AddIndex(model_name="itempricehistory", index=models.Index(fields=["outlet", "-created_at"], name="ph_outlet_idx")),
    ]
