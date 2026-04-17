from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_mobiledevice"),
    ]

    operations = [
        migrations.CreateModel(
            name="LoginEvent",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("username_attempted", models.CharField(blank=True, default="", max_length=150)),
                ("success", models.BooleanField(default=False)),
                ("failure_reason", models.CharField(blank=True, default="", max_length=200)),
                ("ip_address", models.CharField(blank=True, default="", max_length=64)),
                ("user_agent", models.CharField(blank=True, default="", max_length=500)),
                ("device_uuid", models.CharField(blank=True, default="", max_length=64)),
                ("platform", models.CharField(blank=True, default="", max_length=20)),
                ("app_version", models.CharField(blank=True, default="", max_length=30)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="login_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "login_events",
                "ordering": ["-created_at"],
            },
        ),
    ]
