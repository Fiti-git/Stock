from datetime import date
from django.db import migrations, models


def backfill_current_state(apps, schema_editor):
    """
    Seed one history row per active item reflecting the current is_daily_count
    value with effective_from = 1970-01-01. This makes historical queries
    treat the current state as "always was" — safe assumption since we have
    no earlier record. All toggles from today onward are captured with real
    dates.
    """
    Item = apps.get_model("items", "Item")
    History = apps.get_model("items", "ItemDailyCountHistory")
    epoch = date(1970, 1, 1)
    to_create = [
        History(item_id=item_id, was_daily_count=flag, effective_from=epoch)
        for item_id, flag in Item.objects.values_list("id", "is_daily_count")
    ]
    History.objects.bulk_create(to_create, batch_size=1000)


def unseed(apps, schema_editor):
    History = apps.get_model("items", "ItemDailyCountHistory")
    History.objects.filter(effective_from=date(1970, 1, 1)).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0025_location"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ItemDailyCountHistory",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("was_daily_count", models.BooleanField()),
                ("effective_from", models.DateField(db_index=True)),
                ("note", models.CharField(blank=True, default="", max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("changed_by", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="+", to="accounts.user")),
                ("item", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="daily_count_history", to="items.item")),
            ],
            options={
                "db_table": "item_daily_count_history",
                "ordering": ["-effective_from", "-created_at"],
                "indexes": [models.Index(fields=["item", "-effective_from"], name="item_daily__item_id_e2b3e2_idx")],
            },
        ),
        migrations.RunPython(backfill_current_state, unseed),
    ]
