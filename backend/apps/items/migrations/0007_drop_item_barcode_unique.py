from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0006_migrate_barcodes_to_itembarcode"),
    ]

    operations = [
        migrations.AlterField(
            model_name="item",
            name="barcode",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
