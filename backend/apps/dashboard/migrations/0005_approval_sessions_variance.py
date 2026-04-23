from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("items", "0001_initial"),
        ("outlets", "0001_initial"),
        ("dashboard", "0004_stockcount_device_uuid"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CountSession",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("count_date", models.DateField()),
                ("status", models.CharField(choices=[("open", "Open"), ("closed", "Closed")], default="open", max_length=10)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="count_sessions", to="outlets.outlet")),
                ("started_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="started_count_sessions", to=settings.AUTH_USER_MODEL)),
                ("closed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="closed_count_sessions", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "count_sessions",
                "ordering": ["-started_at"],
            },
        ),
        migrations.AddIndex(
            model_name="countsession",
            index=models.Index(fields=["outlet", "count_date"], name="count_sess_outlet_date_idx"),
        ),
        migrations.AddIndex(
            model_name="countsession",
            index=models.Index(fields=["status"], name="count_sess_status_idx"),
        ),
        migrations.AddConstraint(
            model_name="countsession",
            constraint=models.UniqueConstraint(
                fields=["outlet", "count_date"],
                condition=models.Q(status="open"),
                name="uniq_open_session_per_outlet_date",
            ),
        ),

        migrations.AddField(
            model_name="stockcount",
            name="session",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="counts", to="dashboard.countsession"),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="approval_status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("submitted", "Submitted"), ("approved", "Approved"), ("rejected", "Rejected")],
                default="approved",  # grandfather existing rows as approved
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="approved_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_counts", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="rejection_reason",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="stockcount",
            name="flagged_outlier",
            field=models.BooleanField(default=False),
        ),
        # Change the default for new rows to "submitted" (grandfathering done above)
        migrations.AlterField(
            model_name="stockcount",
            name="approval_status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("submitted", "Submitted"), ("approved", "Approved"), ("rejected", "Rejected")],
                default="submitted",
                max_length=12,
            ),
        ),
        migrations.AddIndex(
            model_name="stockcount",
            index=models.Index(fields=["outlet", "count_date"], name="stock_count_outlet_date_idx"),
        ),
        migrations.AddIndex(
            model_name="stockcount",
            index=models.Index(fields=["approval_status"], name="stock_count_approval_idx"),
        ),
        migrations.AddIndex(
            model_name="stockcount",
            index=models.Index(fields=["session"], name="stock_count_session_idx"),
        ),

        migrations.CreateModel(
            name="VarianceRecord",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("count_date", models.DateField()),
                ("pos_qty", models.DecimalField(decimal_places=3, max_digits=12)),
                ("counted_qty", models.DecimalField(decimal_places=3, max_digits=12)),
                ("variance_qty", models.DecimalField(decimal_places=3, max_digits=12)),
                ("variance_value", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("status", models.CharField(
                    choices=[
                        ("pending", "Pending"),
                        ("investigating", "Investigating"),
                        ("explained", "Explained"),
                        ("adjusted", "Adjusted"),
                        ("written_off", "Written off"),
                        ("closed", "Closed"),
                    ],
                    default="pending",
                    max_length=16,
                )),
                ("resolution_note", models.CharField(blank=True, default="", max_length=1000)),
                ("adjustment_qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="variances", to="dashboard.countsession")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="variance_records", to="outlets.outlet")),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="variance_records", to="items.item")),
                ("resolved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="resolved_variances", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "variance_records",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="variancerecord",
            index=models.Index(fields=["outlet", "count_date"], name="variance_outlet_date_idx"),
        ),
        migrations.AddIndex(
            model_name="variancerecord",
            index=models.Index(fields=["status"], name="variance_status_idx"),
        ),
        migrations.AddIndex(
            model_name="variancerecord",
            index=models.Index(fields=["session"], name="variance_session_idx"),
        ),
        migrations.AddConstraint(
            model_name="variancerecord",
            constraint=models.UniqueConstraint(fields=["session", "item"], name="uniq_variance_per_session_item"),
        ),
    ]
