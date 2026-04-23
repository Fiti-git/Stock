from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0015_item_price_history"),
        ("outlets", "0001_initial"),
        ("pos", "0003_customer_credit_txn"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Promotion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("code", models.CharField(blank=True, default="", max_length=40)),
                ("kind", models.CharField(choices=[("percent", "% off"), ("amount", "LKR off")], max_length=10)),
                ("value", models.DecimalField(decimal_places=2, max_digits=14)),
                ("scope", models.CharField(choices=[("item", "Single item"), ("category", "Category"), ("bill", "Whole bill")], default="bill", max_length=10)),
                ("category", models.CharField(blank=True, default="", max_length=200)),
                ("min_bill_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("starts_at", models.DateTimeField()),
                ("ends_at", models.DateTimeField()),
                ("max_usage", models.IntegerField(default=0)),
                ("usage_count", models.IntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="promotions", to="outlets.outlet")),
                ("item", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="promotions", to="items.item")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_promotions", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "pos_promotions", "ordering": ["-starts_at"]},
        ),
        migrations.AddIndex(model_name="promotion", index=models.Index(fields=["outlet", "is_active", "starts_at", "ends_at"], name="promo_active_idx")),
        migrations.AddIndex(model_name="promotion", index=models.Index(fields=["item"], name="promo_item_idx")),
        migrations.AddIndex(model_name="promotion", index=models.Index(fields=["category"], name="promo_category_idx")),
    ]
