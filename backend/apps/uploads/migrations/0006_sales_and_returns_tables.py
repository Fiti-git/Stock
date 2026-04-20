from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def _batch_fields(upload_to: str, amt_digits: int = 14):
    return [
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
        ("date_from", models.DateField()),
        ("date_to", models.DateField()),
        ("uploaded_at", models.DateTimeField(auto_now_add=True)),
        ("status", models.CharField(choices=[("success", "Success"), ("failed", "Failed"), ("deleted", "Deleted")], default="success", max_length=10)),
        ("total_rows", models.IntegerField(default=0)),
        ("total_amount", models.DecimalField(decimal_places=2, default=0, max_digits=amt_digits)),
        ("filename", models.CharField(blank=True, max_length=255)),
        ("approval_status", models.CharField(choices=[("auto", "Auto"), ("pending", "Pending Approval"), ("approved", "Approved"), ("rejected", "Rejected")], default="auto", max_length=10)),
        ("approved_at", models.DateTimeField(blank=True, null=True)),
        ("stored_file", models.FileField(blank=True, null=True, upload_to=upload_to)),
    ]


class Migration(migrations.Migration):

    dependencies = [
        ("outlets", "0001_initial"),
        ("accounts", "0005_super_admin_and_permissions_override"),
        ("uploads", "0005_grn_and_rts_tables"),
    ]

    operations = [
        # --- Sales ---
        migrations.CreateModel(
            name="SalesUploadBatch",
            fields=[
                *_batch_fields("pending_sales/", amt_digits=16),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sales_batches", to="outlets.outlet")),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sales_batches", to=settings.AUTH_USER_MODEL)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_sales_batches", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "sales_upload_batches", "ordering": ["-uploaded_at"]},
        ),
        migrations.AddIndex(model_name="salesuploadbatch", index=models.Index(fields=["outlet", "date_from", "date_to"], name="sales_batch_outlet_dates_idx")),
        migrations.AddIndex(model_name="salesuploadbatch", index=models.Index(fields=["approval_status"], name="sales_batch_approval_idx")),
        migrations.CreateModel(
            name="SalesLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("invoice_no", models.CharField(max_length=40)),
                ("txn_date", models.DateField()),
                ("txn_time", models.CharField(blank=True, max_length=20)),
                ("item_code", models.CharField(max_length=40)),
                ("description", models.CharField(blank=True, max_length=255)),
                ("cust_code", models.CharField(blank=True, max_length=40)),
                ("cost_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("unit_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("discount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("cashier", models.CharField(blank=True, max_length=80)),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="uploads.salesuploadbatch")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sales_lines", to="outlets.outlet")),
            ],
            options={"db_table": "sales_lines"},
        ),
        migrations.AddIndex(model_name="salesline", index=models.Index(fields=["outlet", "txn_date"], name="sales_line_outlet_date_idx")),
        migrations.AddIndex(model_name="salesline", index=models.Index(fields=["outlet", "invoice_no"], name="sales_line_outlet_inv_idx")),
        migrations.AddIndex(model_name="salesline", index=models.Index(fields=["item_code"], name="sales_line_item_code_idx")),

        # --- Sales Returns ---
        migrations.CreateModel(
            name="SalesReturnUploadBatch",
            fields=[
                *_batch_fields("pending_sales_returns/"),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sales_return_batches", to="outlets.outlet")),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sales_return_batches", to=settings.AUTH_USER_MODEL)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_sales_return_batches", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "sales_return_upload_batches", "ordering": ["-uploaded_at"]},
        ),
        migrations.AddIndex(model_name="salesreturnuploadbatch", index=models.Index(fields=["outlet", "date_from", "date_to"], name="sret_batch_outlet_dates_idx")),
        migrations.AddIndex(model_name="salesreturnuploadbatch", index=models.Index(fields=["approval_status"], name="sret_batch_approval_idx")),
        migrations.CreateModel(
            name="SalesReturnLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("invoice_no", models.CharField(max_length=40)),
                ("txn_date", models.DateField()),
                ("txn_time", models.CharField(blank=True, max_length=20)),
                ("item_code", models.CharField(max_length=40)),
                ("barcode", models.CharField(blank=True, max_length=40)),
                ("description", models.CharField(blank=True, max_length=255)),
                ("member", models.CharField(blank=True, max_length=60)),
                ("qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("cost_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("gross_value", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("remarks", models.CharField(blank=True, max_length=255)),
                ("user_name", models.CharField(blank=True, max_length=80)),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="uploads.salesreturnuploadbatch")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sales_return_lines", to="outlets.outlet")),
            ],
            options={"db_table": "sales_return_lines"},
        ),
        migrations.AddIndex(model_name="salesreturnline", index=models.Index(fields=["outlet", "txn_date"], name="sret_line_outlet_date_idx")),
        migrations.AddIndex(model_name="salesreturnline", index=models.Index(fields=["outlet", "invoice_no"], name="sret_line_outlet_inv_idx")),
        migrations.AddIndex(model_name="salesreturnline", index=models.Index(fields=["item_code"], name="sret_line_item_code_idx")),
    ]
