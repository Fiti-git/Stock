"""
Migration to:
1. Make Item outlet-scoped (outlet FK + unique_together(outlet, item_code))
2. Add change_type, changed_fields, item FK to PendingItem

Data migration step: assigns all existing items to the first outlet in the DB
(Gohagoda in the pilot setup).
"""
import django.db.models.deletion
from django.db import migrations, models


def assign_items_to_first_outlet(apps, schema_editor):
    Item = apps.get_model("items", "Item")
    Outlet = apps.get_model("outlets", "Outlet")
    outlet = Outlet.objects.order_by("id").first()
    if outlet:
        Item.objects.filter(outlet__isnull=True).update(outlet=outlet)


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0001_initial"),
        ("outlets", "0002_outlet_short_code"),
    ]

    operations = [
        # ── 1. Add outlet as nullable FK first ──────────────────────────────
        migrations.AddField(
            model_name="item",
            name="outlet",
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="items",
                to="outlets.outlet",
            ),
        ),

        # ── 2. Data migration: assign all existing items to the first outlet ─
        migrations.RunPython(
            assign_items_to_first_outlet,
            reverse_code=migrations.RunPython.noop,
        ),

        # ── 3. Make outlet non-nullable ──────────────────────────────────────
        migrations.AlterField(
            model_name="item",
            name="outlet",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="items",
                to="outlets.outlet",
            ),
        ),

        # ── 4. Remove old global unique on item_code ─────────────────────────
        migrations.AlterField(
            model_name="item",
            name="item_code",
            field=models.CharField(max_length=50),
        ),

        # ── 5. Add unique_together (outlet, item_code) ────────────────────────
        migrations.AlterUniqueTogether(
            name="item",
            unique_together={("outlet", "item_code")},
        ),

        # ── 6. PendingItem: add change_type ───────────────────────────────────
        migrations.AddField(
            model_name="pendingitem",
            name="change_type",
            field=models.CharField(
                choices=[("new_code", "New Item Code"), ("data_changed", "Data Changed")],
                default="new_code",
                max_length=20,
            ),
        ),

        # ── 7. PendingItem: add changed_fields JSONField ──────────────────────
        migrations.AddField(
            model_name="pendingitem",
            name="changed_fields",
            field=models.JSONField(blank=True, default=dict),
        ),

        # ── 8. PendingItem: add FK to existing Item ───────────────────────────
        migrations.AddField(
            model_name="pendingitem",
            name="item",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="change_requests",
                to="items.item",
            ),
        ),
    ]
