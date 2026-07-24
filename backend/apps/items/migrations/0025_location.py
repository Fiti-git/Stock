from django.db import migrations, models


PRESETS = [
    ("Rack",       "🗄️", 10),
    ("Store Room", "🏪", 20),
    ("Returns",    "↩️", 30),
    ("Display",    "🖥️", 40),
    ("Warehouse",  "🏭", 50),
    ("Damage",     "⚠️", 60),
]


def seed_presets(apps, schema_editor):
    Location = apps.get_model("items", "Location")
    for name, icon, order in PRESETS:
        Location.objects.get_or_create(
            name=name,
            defaults={"icon": icon, "sort_order": order, "is_active": True},
        )


def unseed_presets(apps, schema_editor):
    Location = apps.get_model("items", "Location")
    Location.objects.filter(name__in=[p[0] for p in PRESETS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0024_item_is_daily_count"),
    ]

    operations = [
        migrations.CreateModel(
            name="Location",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80, unique=True)),
                ("icon", models.CharField(blank=True, default="", max_length=8)),
                ("sort_order", models.IntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "locations",
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.RunPython(seed_presets, unseed_presets),
    ]
