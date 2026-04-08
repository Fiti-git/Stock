from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0003_item_barcode_unique'),
    ]

    operations = [
        migrations.AddField(
            model_name='item',
            name='rack_number',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='item',
            name='shelf',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
    ]
