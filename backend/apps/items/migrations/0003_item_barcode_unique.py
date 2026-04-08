from django.db import migrations, models


def cleanup_items(apps, schema_editor):
    """
    Before adding unique=True on barcode and enforcing uppercase categories:

    1. Uppercase all existing category values (so "Biscuits" → "BISCUITS").
    2. Deduplicate barcodes — for items sharing the same barcode, keep the one
       whose barcode was assigned earliest (barcode_assigned_at); null out the
       rest so they re-enter the pending queue naturally.
    """
    Item = apps.get_model("items", "Item")

    # --- Step 1: Uppercase categories ---
    for item in Item.objects.exclude(category="").only("id", "category"):
        upper = item.category.strip().upper()
        if upper != item.category:
            Item.objects.filter(pk=item.pk).update(category=upper)

    # --- Step 2: Deduplicate barcodes ---
    # Collect all non-null barcodes that appear more than once
    from django.db.models import Count
    duplicate_barcodes = (
        Item.objects.exclude(barcode__isnull=True)
        .exclude(barcode="")
        .values("barcode")
        .annotate(cnt=Count("id"))
        .filter(cnt__gt=1)
        .values_list("barcode", flat=True)
    )

    for barcode in duplicate_barcodes:
        # Keep the item whose barcode was assigned earliest; null out the rest.
        # Items without barcode_assigned_at go last (treated as most recent problem).
        items_with_barcode = list(
            Item.objects.filter(barcode=barcode)
            .order_by("barcode_assigned_at", "id")  # NULLs sort last in most DBs
        )
        # First item keeps its barcode; all others lose it
        for duplicate in items_with_barcode[1:]:
            Item.objects.filter(pk=duplicate.pk).update(barcode=None)


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0002_item_outlet_scoped_pendingitem_changes"),
    ]

    operations = [
        migrations.RunPython(cleanup_items, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="item",
            name="barcode",
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
    ]
