"""Phase 2 Agent 6 — BillLine.unit_kind / pack_size_at_sale snapshot."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0009_billline_pack_unit_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="billline",
            name="unit_kind",
            field=models.CharField(default="base", max_length=8),
        ),
        migrations.AddField(
            model_name="billline",
            name="pack_size_at_sale",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=12),
        ),
    ]
