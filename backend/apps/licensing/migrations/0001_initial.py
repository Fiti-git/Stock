from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='LicenseConfiguration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('instance_id', models.UUIDField(unique=True)),
                ('instance_secret_encrypted', models.BinaryField()),
                ('license_server_url', models.URLField()),
                ('license_public_key_pem', models.TextField()),
                ('configured_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('configured_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'License Configuration',
            },
        ),
        migrations.CreateModel(
            name='CachedLicense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('jwt_token', models.TextField()),
                ('decoded_payload', models.JSONField(default=dict)),
                ('fetched_at', models.DateTimeField(auto_now=True)),
                ('expires_at', models.DateTimeField()),
            ],
            options={
                'verbose_name': 'Cached License',
            },
        ),
        migrations.CreateModel(
            name='LicenseConfigAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('CREATE', 'Create'), ('UPDATE', 'Update'), ('TEST_CONNECTION', 'Test Connection')], max_length=20)),
                ('fields_changed', models.JSONField(default=list)),
                ('ip_address', models.GenericIPAddressField(null=True)),
                ('user_agent', models.TextField(blank=True, default='')),
                ('success', models.BooleanField(default=True)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-timestamp'],
            },
        ),
    ]
