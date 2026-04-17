from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0007_drop_item_barcode_unique"),
    ]

    operations = [
        migrations.AddField(
            model_name="itembarcode",
            name="device_uuid",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
