from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0001_initial"),
        ("items", "0001_initial"),
        ("outlets", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Shift",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("opened_at", models.DateTimeField(auto_now_add=True)),
                ("opening_cash", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("counted_cash", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("closing_note", models.CharField(blank=True, default="", max_length=500)),
                ("status", models.CharField(choices=[("open", "Open"), ("closed", "Closed")], default="open", max_length=10)),
                ("device_uuid", models.CharField(blank=True, default="", max_length=64)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="shifts", to="outlets.outlet")),
                ("opened_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="opened_shifts", to=settings.AUTH_USER_MODEL)),
                ("closed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="closed_shifts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "pos_shifts", "ordering": ["-opened_at"]},
        ),
        migrations.AddIndex(
            model_name="shift",
            index=models.Index(fields=["outlet", "status"], name="pos_shift_outlet_status_idx"),
        ),
        migrations.AddIndex(
            model_name="shift",
            index=models.Index(fields=["opened_by", "status"], name="pos_shift_user_status_idx"),
        ),
        migrations.AddConstraint(
            model_name="shift",
            constraint=models.UniqueConstraint(
                fields=["outlet", "opened_by"],
                condition=models.Q(status="open"),
                name="uniq_open_shift_per_user_outlet",
            ),
        ),

        migrations.CreateModel(
            name="Bill",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("sale", "Sale"), ("return", "Return")], default="sale", max_length=10)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("closed", "Closed"), ("void", "Void"), ("returned", "Fully Returned")], default="draft", max_length=10)),
                ("bill_no", models.CharField(max_length=30, unique=True)),
                ("customer_name", models.CharField(blank=True, default="", max_length=120)),
                ("customer_phone", models.CharField(blank=True, default="", max_length=40)),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("bill_discount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("tax_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("grand_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("paid_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("change_due", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("void_reason", models.CharField(blank=True, default="", max_length=500)),
                ("voided_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("cashier", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="bills", to=settings.AUTH_USER_MODEL)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="bills", to="outlets.outlet")),
                ("shift", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="bills", to="pos.shift")),
                ("returns_bill", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="return_bills", to="pos.bill")),
                ("voided_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="voided_bills", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "pos_bills", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="bill", index=models.Index(fields=["outlet", "created_at"], name="pos_bill_outlet_date_idx")),
        migrations.AddIndex(model_name="bill", index=models.Index(fields=["outlet", "status"], name="pos_bill_outlet_status_idx")),
        migrations.AddIndex(model_name="bill", index=models.Index(fields=["shift"], name="pos_bill_shift_idx")),
        migrations.AddIndex(model_name="bill", index=models.Index(fields=["cashier", "created_at"], name="pos_bill_cashier_date_idx")),

        migrations.CreateModel(
            name="BillLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_code", models.CharField(max_length=50)),
                ("item_name", models.CharField(max_length=300)),
                ("qty", models.DecimalField(decimal_places=3, max_digits=12)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=14)),
                ("line_discount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("tax_rate_pct", models.DecimalField(decimal_places=3, default=0, max_digits=6)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("line_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("note", models.CharField(blank=True, default="", max_length=200)),
                ("bill", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="pos.bill")),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="pos_lines", to="items.item")),
            ],
            options={"db_table": "pos_bill_lines"},
        ),
        migrations.AddIndex(model_name="billline", index=models.Index(fields=["bill"], name="pos_line_bill_idx")),
        migrations.AddIndex(model_name="billline", index=models.Index(fields=["item"], name="pos_line_item_idx")),

        migrations.CreateModel(
            name="Payment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tender", models.CharField(choices=[("cash", "Cash"), ("card", "Card"), ("lankaqr", "LankaQR"), ("bank", "Bank Transfer"), ("credit", "Store Credit"), ("other", "Other")], max_length=15)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("reference", models.CharField(blank=True, default="", max_length=120)),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("bill", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="payments", to="pos.bill")),
            ],
            options={"db_table": "pos_payments"},
        ),
        migrations.AddIndex(model_name="payment", index=models.Index(fields=["bill"], name="pos_pay_bill_idx")),
        migrations.AddIndex(model_name="payment", index=models.Index(fields=["tender"], name="pos_pay_tender_idx")),
    ]
