from django.db import migrations, models
import django.db.models.deletion


def backfill_categories(apps, schema_editor):
    """
    Seed the Category table from distinct non-empty Item.category strings
    already in the database, then link each Item to the matching row.
    Existing Item.category free-text is preserved untouched.
    """
    Item = apps.get_model("items", "Item")
    Category = apps.get_model("items", "Category")

    names = (
        Item.objects.exclude(category__isnull=True)
        .exclude(category__exact="")
        .values_list("category", flat=True)
        .distinct()
    )
    existing = set(Category.objects.values_list("name", flat=True))
    to_create = [
        Category(name=n.strip(), sort_order=idx)
        for idx, n in enumerate(sorted({n.strip() for n in names if n.strip()}))
        if n.strip() not in existing
    ]
    if to_create:
        Category.objects.bulk_create(to_create)

    by_name = {c.name: c.id for c in Category.objects.all()}
    # Update items in batches via raw update per distinct name — cheap and index-friendly.
    for name, cat_id in by_name.items():
        Item.objects.filter(category=name, category_ref__isnull=True).update(
            category_ref_id=cat_id
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0010_pendingitem_upload_log"),
    ]

    operations = [
        migrations.CreateModel(
            name="Category",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200, unique=True)),
                ("description", models.CharField(blank=True, default="", max_length=500)),
                ("sort_order", models.IntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "item_categories",
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.AddField(
            model_name="item",
            name="category_ref",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="items",
                to="items.category",
            ),
        ),
        migrations.RunPython(backfill_categories, noop_reverse),
    ]
