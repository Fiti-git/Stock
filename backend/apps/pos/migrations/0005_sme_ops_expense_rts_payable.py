from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0016_item_cost_and_reorder"),
        ("outlets", "0001_initial"),
        ("pos", "0004_promotion"),
        ("uploads", "0007_supplier_master"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name="billline", name="unit_cost",
                            field=models.DecimalField(decimal_places=2, default=0, max_digits=14)),

        migrations.CreateModel(
            name="Expense",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("petty", "Petty cash"), ("utility", "Utility"), ("salary", "Salary / wage"), ("rent", "Rent"), ("other", "Other")], default="petty", max_length=10)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("note", models.CharField(blank=True, default="", max_length=300)),
                ("paid_to", models.CharField(blank=True, default="", max_length=120)),
                ("receipt_ref", models.CharField(blank=True, default="", max_length=80)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="expenses", to="outlets.outlet")),
                ("shift", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="expenses", to="pos.shift")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="expenses", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "pos_expenses", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="expense", index=models.Index(fields=["outlet", "-created_at"], name="exp_outlet_idx")),
        migrations.AddIndex(model_name="expense", index=models.Index(fields=["shift"], name="exp_shift_idx")),
        migrations.AddIndex(model_name="expense", index=models.Index(fields=["kind"], name="exp_kind_idx")),

        migrations.CreateModel(
            name="PurchaseReturn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("supplier_name", models.CharField(blank=True, default="", max_length=200)),
                ("supplier_code", models.CharField(blank=True, default="", max_length=40)),
                ("ref_no", models.CharField(max_length=40, unique=True)),
                ("original_invoice_no", models.CharField(blank=True, default="", max_length=60)),
                ("returned_on", models.DateField()),
                ("total_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("status", models.CharField(choices=[("posted", "Posted"), ("void", "Void")], default="posted", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchase_returns", to="outlets.outlet")),
                ("supplier", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="purchase_returns", to="uploads.supplier")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="purchase_returns", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "pos_purchase_returns", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="purchasereturn", index=models.Index(fields=["outlet", "-created_at"], name="pr_outlet_idx")),
        migrations.AddIndex(model_name="purchasereturn", index=models.Index(fields=["supplier"], name="pr_supplier_idx")),
        migrations.AddIndex(model_name="purchasereturn", index=models.Index(fields=["status"], name="pr_status_idx")),

        migrations.CreateModel(
            name="PurchaseReturnLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_code", models.CharField(max_length=50)),
                ("item_name", models.CharField(max_length=300)),
                ("qty", models.DecimalField(decimal_places=3, max_digits=12)),
                ("unit_cost", models.DecimalField(decimal_places=2, max_digits=14)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=14)),
                ("ret", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="pos.purchasereturn")),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchase_return_lines", to="items.item")),
            ],
            options={"db_table": "pos_purchase_return_lines"},
        ),
        migrations.AddIndex(model_name="purchasereturnline", index=models.Index(fields=["ret"], name="prl_ret_idx")),
        migrations.AddIndex(model_name="purchasereturnline", index=models.Index(fields=["item"], name="prl_item_idx")),

        migrations.CreateModel(
            name="SupplierPaymentTxn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("grn", "Goods Received"), ("rts", "Return to Supplier"), ("payment", "Payment Made"), ("adjustment", "Adjustment"), ("opening", "Opening Balance")], max_length=12)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("balance_after", models.DecimalField(decimal_places=2, max_digits=14)),
                ("ref_type", models.CharField(blank=True, default="", max_length=40)),
                ("ref_id", models.CharField(blank=True, default="", max_length=40)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("supplier", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="payment_txns", to="uploads.supplier")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="supplier_payment_txns", to="outlets.outlet")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="supplier_payment_txns", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "pos_supplier_payment_txns", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="supplierpaymenttxn", index=models.Index(fields=["supplier", "-created_at"], name="spt_supplier_idx")),
        migrations.AddIndex(model_name="supplierpaymenttxn", index=models.Index(fields=["outlet", "-created_at"], name="spt_outlet_idx")),
        migrations.AddIndex(model_name="supplierpaymenttxn", index=models.Index(fields=["kind"], name="spt_kind_idx")),
    ]
