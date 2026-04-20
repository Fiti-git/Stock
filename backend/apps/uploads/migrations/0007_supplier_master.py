from django.db import migrations, models


def backfill_suppliers(apps, schema_editor):
    """
    Seed the Supplier table from supplier_codes already present in GRN and
    RTS lines. We can't know names or contact details — those fields stay
    blank until an admin fills them in on the Suppliers page.
    """
    Supplier = apps.get_model("uploads", "Supplier")
    GrnLine = apps.get_model("uploads", "GrnLine")
    RtsLine = apps.get_model("uploads", "RtsLine")

    codes = set()
    for row in GrnLine.objects.exclude(supplier_code="").values_list("supplier_code", flat=True).distinct():
        if row:
            codes.add(row.strip().upper())
    for row in RtsLine.objects.exclude(supplier_code="").values_list("supplier_code", flat=True).distinct():
        if row:
            codes.add(row.strip().upper())

    existing = set(Supplier.objects.values_list("code", flat=True))
    new = codes - existing
    Supplier.objects.bulk_create(
        [Supplier(code=c) for c in sorted(new)],
        batch_size=500,
    )


def unbackfill(apps, schema_editor):
    # Reversing is safe — only clears rows created by the forwards migration
    # (rows with all fields blank except code). Conservative implementation:
    # drop everything. The backfill is idempotent, so re-running the
    # migration recreates them.
    Supplier = apps.get_model("uploads", "Supplier")
    Supplier.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("uploads", "0006_sales_and_returns_tables"),
    ]

    operations = [
        migrations.CreateModel(
            name="Supplier",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("code", models.CharField(db_index=True, max_length=40, unique=True)),
                ("name", models.CharField(blank=True, max_length=200)),
                ("contact_phone", models.CharField(blank=True, max_length=40)),
                ("contact_email", models.CharField(blank=True, max_length=255)),
                ("address", models.CharField(blank=True, max_length=500)),
                ("tax_reg_no", models.CharField(blank=True, max_length=60)),
                ("payment_terms", models.CharField(blank=True, max_length=100)),
                ("notes", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "suppliers",
                "ordering": ["code"],
            },
        ),
        migrations.RunPython(backfill_suppliers, unbackfill),
    ]
