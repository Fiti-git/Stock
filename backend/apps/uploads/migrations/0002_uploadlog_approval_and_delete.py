import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("uploads", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add DELETED to UploadLog.status choices
        migrations.AlterField(
            model_name="uploadlog",
            name="status",
            field=models.CharField(
                choices=[
                    ("success", "Success"),
                    ("failed", "Failed"),
                    ("deleted", "Deleted"),
                ],
                default="success",
                max_length=10,
            ),
        ),

        # Add changed_items_count
        migrations.AddField(
            model_name="uploadlog",
            name="changed_items_count",
            field=models.IntegerField(default=0),
        ),

        # Add approval_status
        migrations.AddField(
            model_name="uploadlog",
            name="approval_status",
            field=models.CharField(
                choices=[
                    ("auto", "Auto (same-day)"),
                    ("pending", "Pending Approval"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="auto",
                max_length=10,
            ),
        ),

        # Add approved_by FK
        migrations.AddField(
            model_name="uploadlog",
            name="approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="approved_uploads",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # Add approved_at
        migrations.AddField(
            model_name="uploadlog",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),

        # Add stored_file
        migrations.AddField(
            model_name="uploadlog",
            name="stored_file",
            field=models.FileField(blank=True, null=True, upload_to="pending_uploads/"),
        ),
    ]
