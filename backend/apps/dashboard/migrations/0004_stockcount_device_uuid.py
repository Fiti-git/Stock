from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dashboard", "0003_remove_stock_count_unique_together"),
    ]

    operations = [
        migrations.AddField(
            model_name="stockcount",
            name="device_uuid",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
