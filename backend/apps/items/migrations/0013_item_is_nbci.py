from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0012_alter_category_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="is_nbci",
            field=models.BooleanField(default=False),
        ),
    ]
