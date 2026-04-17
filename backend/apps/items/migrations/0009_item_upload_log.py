from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0008_itembarcode_device_uuid"),
        ("uploads", "0002_uploadlog_approval_and_delete"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="upload_log",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="created_items",
                to="uploads.uploadlog",
            ),
        ),
    ]
