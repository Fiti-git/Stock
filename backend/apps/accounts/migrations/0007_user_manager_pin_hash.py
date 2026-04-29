# Generated for Phase 1 Agent 4 — Manager PIN Override
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_alter_loginevent_id_alter_mobiledevice_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='manager_pin_hash',
            field=models.CharField(blank=True, default='', max_length=128),
        ),
    ]
