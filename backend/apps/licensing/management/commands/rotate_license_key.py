from django.core.management.base import BaseCommand

from cryptography.fernet import Fernet

from apps.licensing.models import LicenseConfiguration
from apps.licensing.encryption import decrypt_secret, encrypt_secret


class Command(BaseCommand):
    help = 'Rotate LICENSE_ENCRYPTION_KEY: decrypt with current key, print new key, re-encrypt.'

    def handle(self, *args, **options):
        config = LicenseConfiguration.objects.first()
        if not config:
            self.stdout.write(self.style.WARNING('No LicenseConfiguration found. Nothing to rotate.'))
            return

        plaintext = config.get_secret()
        self.stdout.write(f'Decrypted secret successfully (length={len(plaintext)}).')

        new_key = Fernet.generate_key().decode()
        self.stdout.write(self.style.SUCCESS(f'\nNew LICENSE_ENCRYPTION_KEY: {new_key}'))
        self.stdout.write('\nSteps:')
        self.stdout.write('  1. Set LICENSE_ENCRYPTION_KEY={new_key} in .env')
        self.stdout.write('  2. Restart the application')
        self.stdout.write('  3. Run: python manage.py rotate_license_key_apply')
        self.stdout.write(f'\nPlain secret to re-encrypt (keep safe): {plaintext[:8]}...')

        confirm = input('\nRe-encrypt now with the NEW key? (requires new key in .env already) [y/N]: ')
        if confirm.lower() == 'y':
            config.set_secret(plaintext)
            config.save()
            self.stdout.write(self.style.SUCCESS('Re-encrypted successfully with current LICENSE_ENCRYPTION_KEY.'))
        else:
            self.stdout.write('Aborted. Follow the manual steps above.')
