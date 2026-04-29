# Generated for Phase 2 Agent 6 — Multi-Unit + Weighed Items.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0018_itembatch_batchmovement_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='UnitOfMeasure',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=20, unique=True)),
                ('name', models.CharField(max_length=80)),
                ('is_weight', models.BooleanField(default=False)),
                ('precision', models.IntegerField(default=0)),
            ],
            options={
                'db_table': 'units_of_measure',
                'ordering': ['code'],
            },
        ),
        migrations.AddField(
            model_name='item',
            name='base_unit',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='items.unitofmeasure',
            ),
        ),
        migrations.AddField(
            model_name='item',
            name='is_weighed',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='item',
            name='weighed_barcode_prefix',
            field=models.CharField(blank=True, default='', max_length=10),
        ),
        migrations.CreateModel(
            name='ItemPackUnit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('conversion_factor', models.DecimalField(decimal_places=4, max_digits=14)),
                ('sell_price', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('barcode', models.CharField(blank=True, default='', max_length=80)),
                ('is_default', models.BooleanField(default=False)),
                ('item', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='pack_units',
                    to='items.item',
                )),
                ('unit', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='+',
                    to='items.unitofmeasure',
                )),
            ],
            options={
                'db_table': 'item_pack_units',
            },
        ),
        migrations.AddConstraint(
            model_name='itempackunit',
            constraint=models.UniqueConstraint(
                fields=('item', 'unit'), name='uniq_item_pack_unit'
            ),
        ),
        migrations.AddIndex(
            model_name='itempackunit',
            index=models.Index(fields=['item'], name='item_pack_u_item_id_idx'),
        ),
        migrations.AddIndex(
            model_name='itempackunit',
            index=models.Index(fields=['barcode'], name='item_pack_u_barcode_idx'),
        ),
    ]
