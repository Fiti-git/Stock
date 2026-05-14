from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("outlets", "0001_initial"),
        ("accounts", "0001_initial"),
        ("uploads", "0012_pos_snapshot_upload_batch"),
    ]

    operations = [
        migrations.CreateModel(
            name="UploadedSheet",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("pipeline", models.CharField(max_length=20, choices=[
                    ("pos", "POS Snapshot"),
                    ("damage", "Damage / Wastage"),
                    ("office", "Office Use"),
                    ("verification", "Verification"),
                    ("grn", "GRN"),
                    ("rts", "Return to Supplier"),
                    ("sales", "Sales"),
                    ("sales_returns", "Sales Returns"),
                ])),
                ("batch_id", models.IntegerField(help_text="PK of the pipeline-specific batch/log row")),
                ("business_date", models.DateField(help_text="snapshot_date for POS, date_from for range pipelines")),
                ("business_date_to", models.DateField(blank=True, null=True, help_text="date_to for range pipelines")),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                ("filename", models.CharField(blank=True, max_length=255)),
                ("row_count", models.IntegerField(default=0)),
                ("approval_status", models.CharField(default="auto", max_length=10, choices=[
                    ("auto", "Auto-approved"),
                    ("pending", "Pending Approval"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ])),
                ("approval_reason", models.CharField(blank=True, max_length=80)),
                ("columns", models.JSONField(default=list)),
                ("rows", models.JSONField(default=list)),
                ("outlet", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="uploaded_sheets", to="outlets.outlet")),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=models.deletion.SET_NULL, related_name="uploaded_sheets", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "uploaded_sheets",
                "ordering": ["-uploaded_at"],
            },
        ),
        migrations.AddIndex(model_name="uploadedsheet", index=models.Index(fields=["pipeline", "batch_id"], name="up_sheet_pipe_batch_idx")),
        migrations.AddIndex(model_name="uploadedsheet", index=models.Index(fields=["outlet", "-uploaded_at"], name="up_sheet_outlet_at_idx")),
        migrations.AddIndex(model_name="uploadedsheet", index=models.Index(fields=["approval_status"], name="up_sheet_approval_idx")),
        migrations.AddIndex(model_name="uploadedsheet", index=models.Index(fields=["business_date"], name="up_sheet_bizdate_idx")),
    ]
