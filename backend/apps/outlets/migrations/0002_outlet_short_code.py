from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("outlets", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="outlet",
            name="short_code",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
