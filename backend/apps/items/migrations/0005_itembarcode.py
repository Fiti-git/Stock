from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('outlets', '0001_initial'),
        ('items', '0004_item_rack_number_shelf'),
    ]

    operations = [
        migrations.CreateModel(
            name='ItemBarcode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('barcode', models.CharField(max_length=100)),
                ('is_primary', models.BooleanField(default=False)),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='barcodes', to='items.item')),
                ('outlet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='item_barcodes', to='outlets.outlet')),
                ('assigned_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'item_barcodes',
                'ordering': ['-is_primary', 'assigned_at'],
                'unique_together': {('outlet', 'barcode')},
            },
        ),
    ]
