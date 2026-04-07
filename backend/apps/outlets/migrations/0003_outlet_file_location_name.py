from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("outlets", "0002_outlet_short_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="outlet",
            name="file_location_name",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Name as it appears in the POS XLS file header (e.g. AMPITIYA). Used for upload matching.",
                max_length=200,
            ),
        ),
    ]
