from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('store_user', 'Store User'),
                    ('manager', 'Store Manager'),
                    ('staff', 'Staff'),
                    ('admin', 'Admin'),
                    ('ServiceProvider', 'Service Provider'),
                ],
                default='staff',
                max_length=30,
            ),
        ),
    ]
