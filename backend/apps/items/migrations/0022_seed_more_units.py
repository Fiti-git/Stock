"""Seed additional units of measure used by the multi-unit POS path.

Idempotent — uses update_or_create. Adds EA, G, ML, PK, BOX (DOZ already
covered by 0020 under the legacy "DOZEN" code; we also add "DOZ" alias).
"""
from django.db import migrations


SEED = [
    # (code, name, is_weight, precision)
    ("EA", "Each", False, 0),
    ("G", "Gram", True, 0),
    ("ML", "Millilitre", True, 0),
    ("PK", "Pack", False, 0),
    ("BOX", "Box", False, 0),
    ("DOZ", "Dozen", False, 0),
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
        ("items", "0021_item_multiunit_fields"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
