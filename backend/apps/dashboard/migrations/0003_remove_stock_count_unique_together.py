from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("dashboard", "0002_stockcount_unique_together"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="stockcount",
            unique_together=set(),
        ),
    ]
