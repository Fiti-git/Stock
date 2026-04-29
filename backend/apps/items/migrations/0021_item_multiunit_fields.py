"""Phase 2 Agent 6 — additional Item fields for multi-unit & weighed sale."""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0020_seed_units_of_measure"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="plu_code",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
        migrations.AddField(
            model_name="item",
            name="pack_unit",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="items.unitofmeasure",
            ),
        ),
        migrations.AddField(
            model_name="item",
            name="pack_size",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="item",
            name="pack_sell_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
    ]
