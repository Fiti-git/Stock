# Phase 2 Agent 6 — pack-unit snapshot on bill lines.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0008_billline_batches_consumed'),
    ]

    operations = [
        migrations.AddField(
            model_name='billline',
            name='pack_unit_snapshot',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
