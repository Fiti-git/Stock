"""Seed the basic UnitOfMeasure rows used by the POS multi-unit feature."""
from django.db import migrations


SEED = [
    # (code, name, is_weight, precision)
    ("PCS", "Piece", False, 0),
    ("KG", "Kilogram", True, 3),
    ("G", "Gram", True, 0),
    ("L", "Litre", True, 3),
    ("ML", "Millilitre", True, 0),
    ("DOZEN", "Dozen", False, 0),
]


def seed(apps, schema_editor):
    Unit = apps.get_model("items", "UnitOfMeasure")
    for code, name, is_weight, precision in SEED:
        Unit.objects.update_or_create(
            code=code,
            defaults={"name": name, "is_weight": is_weight, "precision": precision},
        )


def unseed(apps, schema_editor):
    Unit = apps.get_model("items", "UnitOfMeasure")
    Unit.objects.filter(code__in=[c for c, *_ in SEED]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0019_units_pack_units_weighed"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
