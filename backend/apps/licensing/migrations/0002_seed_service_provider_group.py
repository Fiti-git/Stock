from django.db import migrations


def seed_service_provider(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.get_or_create(name='ServiceProvider')


def remove_service_provider(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name='ServiceProvider').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('licensing', '0001_initial'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(seed_service_provider, remove_service_provider),
    ]
