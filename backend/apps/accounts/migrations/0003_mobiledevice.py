from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_alter_user_role_max_length"),
        ("outlets", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="MobileDevice",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("device_uuid", models.CharField(max_length=64, unique=True)),
                ("platform", models.CharField(blank=True, default="", max_length=20)),
                ("app_version", models.CharField(blank=True, default="", max_length=30)),
                ("first_seen_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen_at", models.DateTimeField(auto_now=True)),
                ("total_counts", models.IntegerField(default=0)),
                ("total_assigns", models.IntegerField(default=0)),
                (
                    "last_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="mobile_devices",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "last_outlet",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="mobile_devices",
                        to="outlets.outlet",
                    ),
                ),
            ],
            options={
                "db_table": "mobile_devices",
                "ordering": ["-last_seen_at"],
            },
        ),
    ]
