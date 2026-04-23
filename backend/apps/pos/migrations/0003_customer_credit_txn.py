from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0002_customer_and_loyalty"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomerCreditTxn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("kind", models.CharField(choices=[
                    ("topup", "Top-up"), ("redeem", "Redeem on Bill"),
                    ("refund", "Refund to Credit"), ("adjust", "Manual Adjustment"),
                    ("reversal", "Reversal (void)"),
                ], max_length=12)),
                ("balance_after", models.DecimalField(decimal_places=2, max_digits=14)),
                ("ref_type", models.CharField(blank=True, default="", max_length=40)),
                ("ref_id", models.CharField(blank=True, default="", max_length=40)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="credit_txns", to="pos.customer")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="customer_credit_txns", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "pos_customer_credit_txns", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="customercredittxn", index=models.Index(fields=["customer", "-created_at"], name="cct_customer_idx")),
        migrations.AddIndex(model_name="customercredittxn", index=models.Index(fields=["kind"], name="cct_kind_idx")),
        migrations.AddIndex(model_name="customercredittxn", index=models.Index(fields=["ref_type", "ref_id"], name="cct_ref_idx")),
    ]
