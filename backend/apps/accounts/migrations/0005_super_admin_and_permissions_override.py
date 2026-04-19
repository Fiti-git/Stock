from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_loginevent"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("store_user", "Store User"),
                    ("manager", "Store Manager"),
                    ("staff", "Staff"),
                    ("admin", "Admin"),
                    ("super_admin", "Super Admin"),
                    ("ServiceProvider", "Service Provider"),
                ],
                default="staff",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="permissions_override",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
