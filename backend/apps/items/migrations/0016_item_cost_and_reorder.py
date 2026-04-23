from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0015_item_price_history"),
    ]

    operations = [
        migrations.AddField(model_name="item", name="cost_price",
                            field=models.DecimalField(decimal_places=2, default=0, max_digits=14)),
        migrations.AddField(model_name="item", name="reorder_level",
                            field=models.DecimalField(decimal_places=3, default=0, max_digits=14)),
    ]
