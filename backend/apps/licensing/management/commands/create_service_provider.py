from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create a ServiceProvider superuser for license management.'

    def add_arguments(self, parser):
        parser.add_argument('--username', default='serviceprovider')
        parser.add_argument('--password', required=True)

    def handle(self, *args, **options):
        User = get_user_model()
        username = options['username']
        password = options['password']

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'role': 'ServiceProvider',
                'is_staff': True,
                'is_superuser': True,
            },
        )

        if created:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Created user "{username}".'))
        else:
            self.stdout.write(f'User "{username}" already exists.')
