from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0009_item_upload_log"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingitem",
            name="upload_log",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="created_pending_items",
                to="uploads.uploadlog",
            ),
        ),
    ]
