from django.db import migrations


def migrate_barcodes(apps, schema_editor):
    Item = apps.get_model('items', 'Item')
    ItemBarcode = apps.get_model('items', 'ItemBarcode')

    items_with_barcodes = Item.objects.filter(barcode__isnull=False).exclude(barcode='')

    for item in items_with_barcodes:
        ItemBarcode.objects.get_or_create(
            item=item,
            outlet=item.outlet,
            barcode=item.barcode,
            defaults={
                'is_primary': True,
                'assigned_by': item.barcode_assigned_by,
            },
        )


def reverse_migrate(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0005_itembarcode'),
    ]

    operations = [
        migrations.RunPython(migrate_barcodes, reverse_migrate),
    ]
