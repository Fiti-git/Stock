from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def _batch_fields(upload_to: str):
    return [
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
        ("date_from", models.DateField()),
        ("date_to", models.DateField()),
        ("uploaded_at", models.DateTimeField(auto_now_add=True)),
        ("status", models.CharField(choices=[("success", "Success"), ("failed", "Failed"), ("deleted", "Deleted")], default="success", max_length=10)),
        ("total_rows", models.IntegerField(default=0)),
        ("total_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
        ("filename", models.CharField(blank=True, max_length=255)),
        ("approval_status", models.CharField(choices=[("auto", "Auto"), ("pending", "Pending Approval"), ("approved", "Approved"), ("rejected", "Rejected")], default="auto", max_length=10)),
        ("approved_at", models.DateTimeField(blank=True, null=True)),
        ("stored_file", models.FileField(blank=True, null=True, upload_to=upload_to)),
    ]


def _line_fields():
    return [
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
        ("do_no", models.CharField(max_length=40)),
        ("supplier_code", models.CharField(blank=True, max_length=40)),
        ("invoice_no", models.CharField(blank=True, max_length=40)),
        ("txn_date", models.DateField()),
        ("txn_time", models.CharField(blank=True, max_length=20)),
        ("item_code", models.CharField(max_length=40)),
        ("description", models.CharField(blank=True, max_length=255)),
        ("pack_size", models.CharField(blank=True, max_length=20)),
        ("cost_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        ("selling_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        ("packs", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
        ("qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
        ("free_qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
        ("disc_pct", models.DecimalField(decimal_places=3, default=0, max_digits=8)),
        ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
        ("user_name", models.CharField(blank=True, max_length=80)),
        ("tax_pct", models.DecimalField(decimal_places=3, default=0, max_digits=8)),
        ("tax_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
        ("tax_reg", models.CharField(blank=True, max_length=40)),
    ]


class Migration(migrations.Migration):

    dependencies = [
        ("outlets", "0001_initial"),
        ("accounts", "0005_super_admin_and_permissions_override"),
        ("uploads", "0004_office_and_verification_tables"),
    ]

    operations = [
        # --- GRN ---
        migrations.CreateModel(
            name="GrnUploadBatch",
            fields=[
                *_batch_fields("pending_grn/"),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="grn_batches", to="outlets.outlet")),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="grn_batches", to=settings.AUTH_USER_MODEL)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_grn_batches", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "grn_upload_batches", "ordering": ["-uploaded_at"]},
        ),
        migrations.AddIndex(model_name="grnuploadbatch", index=models.Index(fields=["outlet", "date_from", "date_to"], name="grn_batch_outlet_dates_idx")),
        migrations.AddIndex(model_name="grnuploadbatch", index=models.Index(fields=["approval_status"], name="grn_batch_approval_idx")),
        migrations.CreateModel(
            name="GrnLine",
            fields=[
                *_line_fields(),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="uploads.grnuploadbatch")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="grn_lines", to="outlets.outlet")),
            ],
            options={"db_table": "grn_lines"},
        ),
        migrations.AddIndex(model_name="grnline", index=models.Index(fields=["outlet", "txn_date"], name="grn_line_outlet_date_idx")),
        migrations.AddIndex(model_name="grnline", index=models.Index(fields=["outlet", "do_no"], name="grn_line_outlet_do_idx")),
        migrations.AddIndex(model_name="grnline", index=models.Index(fields=["item_code"], name="grn_line_item_code_idx")),
        migrations.AddIndex(model_name="grnline", index=models.Index(fields=["supplier_code"], name="grn_line_supplier_idx")),

        # --- RTS ---
        migrations.CreateModel(
            name="RtsUploadBatch",
            fields=[
                *_batch_fields("pending_rts/"),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rts_batches", to="outlets.outlet")),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="rts_batches", to=settings.AUTH_USER_MODEL)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_rts_batches", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "rts_upload_batches", "ordering": ["-uploaded_at"]},
        ),
        migrations.AddIndex(model_name="rtsuploadbatch", index=models.Index(fields=["outlet", "date_from", "date_to"], name="rts_batch_outlet_dates_idx")),
        migrations.AddIndex(model_name="rtsuploadbatch", index=models.Index(fields=["approval_status"], name="rts_batch_approval_idx")),
        migrations.CreateModel(
            name="RtsLine",
            fields=[
                *_line_fields(),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="uploads.rtsuploadbatch")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rts_lines", to="outlets.outlet")),
            ],
            options={"db_table": "rts_lines"},
        ),
        migrations.AddIndex(model_name="rtsline", index=models.Index(fields=["outlet", "txn_date"], name="rts_line_outlet_date_idx")),
        migrations.AddIndex(model_name="rtsline", index=models.Index(fields=["outlet", "do_no"], name="rts_line_outlet_do_idx")),
        migrations.AddIndex(model_name="rtsline", index=models.Index(fields=["item_code"], name="rts_line_item_code_idx")),
        migrations.AddIndex(model_name="rtsline", index=models.Index(fields=["supplier_code"], name="rts_line_supplier_idx")),
    ]
