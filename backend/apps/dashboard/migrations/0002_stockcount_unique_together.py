from django.db import migrations


def deduplicate_stock_counts(apps, schema_editor):
    """
    Before adding unique_together(outlet, item, count_date), remove duplicate
    StockCount rows. For each duplicate group, keep the most recently counted
    record (highest id as tie-breaker) and delete the rest.
    """
    StockCount = apps.get_model("dashboard", "StockCount")

    # Find all (outlet, item, count_date) groups that have more than one row
    seen = {}
    for sc in StockCount.objects.order_by("outlet_id", "item_id", "count_date", "-counted_at", "-id"):
        key = (sc.outlet_id, sc.item_id, sc.count_date)
        if key in seen:
            # This is a duplicate — delete it
            StockCount.objects.filter(pk=sc.pk).delete()
        else:
            seen[key] = sc.pk


class Migration(migrations.Migration):

    dependencies = [
        ("dashboard", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(deduplicate_stock_counts, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(
            name="stockcount",
            unique_together={("outlet", "item", "count_date")},
        ),
    ]
