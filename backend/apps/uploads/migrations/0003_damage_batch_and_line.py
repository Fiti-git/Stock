from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("outlets", "0001_initial"),
        ("accounts", "0005_super_admin_and_permissions_override"),
        ("uploads", "0002_uploadlog_approval_and_delete"),
    ]

    operations = [
        migrations.CreateModel(
            name="DamageUploadBatch",
            fields=[
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
                ("stored_file", models.FileField(blank=True, null=True, upload_to="pending_damage/")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="damage_batches", to="outlets.outlet")),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="damage_batches", to=settings.AUTH_USER_MODEL)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_damage_batches", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "damage_upload_batches",
                "ordering": ["-uploaded_at"],
            },
        ),
        migrations.AddIndex(
            model_name="damageuploadbatch",
            index=models.Index(fields=["outlet", "date_from", "date_to"], name="damg_batch_outlet_dates_idx"),
        ),
        migrations.AddIndex(
            model_name="damageuploadbatch",
            index=models.Index(fields=["approval_status"], name="damg_batch_approval_idx"),
        ),
        migrations.CreateModel(
            name="DamageLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("doc_no", models.CharField(max_length=40)),
                ("txn_date", models.DateField()),
                ("item_code", models.CharField(max_length=40)),
                ("description", models.CharField(blank=True, max_length=255)),
                ("pack_size", models.CharField(blank=True, max_length=20)),
                ("cost_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("selling_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("user_name", models.CharField(blank=True, max_length=80)),
                ("txn_time", models.CharField(blank=True, max_length=20)),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="uploads.damageuploadbatch")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="damage_lines", to="outlets.outlet")),
            ],
            options={
                "db_table": "damage_lines",
            },
        ),
        migrations.AddIndex(
            model_name="damageline",
            index=models.Index(fields=["outlet", "txn_date"], name="damg_line_outlet_date_idx"),
        ),
        migrations.AddIndex(
            model_name="damageline",
            index=models.Index(fields=["outlet", "doc_no"], name="damg_line_outlet_doc_idx"),
        ),
        migrations.AddIndex(
            model_name="damageline",
            index=models.Index(fields=["item_code"], name="damg_line_item_code_idx"),
        ),
    ]
