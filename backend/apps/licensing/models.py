from django.conf import settings
from django.db import models

from apps.licensing.encryption import encrypt_secret, decrypt_secret


class LicenseConfiguration(models.Model):
    instance_id = models.UUIDField(unique=True)
    instance_secret_encrypted = models.BinaryField()
    license_server_url = models.URLField()
    license_public_key_pem = models.TextField()
    configured_at = models.DateTimeField(auto_now_add=True)
    configured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'License Configuration'
        # Pinned to the existing prod table name (Django default for the
        # original app_label "licensing"). Phase 2 may move this app under
        # services/identity/ — pinning prevents Django from auto-renaming.
        db_table = 'licensing_licenseconfiguration'

    def save(self, *args, **kwargs):
        if not self.pk and LicenseConfiguration.objects.exists():
            raise ValueError('Only one LicenseConfiguration row is allowed.')
        super().save(*args, **kwargs)

    def set_secret(self, plaintext: str):
        self.instance_secret_encrypted = encrypt_secret(plaintext)

    def get_secret(self) -> str:
        return decrypt_secret(bytes(self.instance_secret_encrypted))

    def __repr__(self):
        return '<LicenseConfiguration [secret hidden]>'

    def __str__(self):
        return f'License Config ({self.instance_id})'


class CachedLicense(models.Model):
    jwt_token = models.TextField()
    decoded_payload = models.JSONField(default=dict)
    fetched_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField()

    class Meta:
        verbose_name = 'Cached License'
        # Pinned to existing prod table — see LicenseConfiguration above.
        db_table = 'licensing_cachedlicense'

    def save(self, *args, **kwargs):
        if not self.pk and CachedLicense.objects.exists():
            raise ValueError('Only one CachedLicense row is allowed.')
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Cached License (expires {self.expires_at})'


class LicenseConfigAuditLog(models.Model):
    ACTION_CHOICES = [
        ('CREATE', 'Create'),
        ('UPDATE', 'Update'),
        ('TEST_CONNECTION', 'Test Connection'),
    ]

    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    fields_changed = models.JSONField(default=list)
    ip_address = models.GenericIPAddressField(null=True)
    user_agent = models.TextField(blank=True, default='')
    success = models.BooleanField(default=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        # Pinned to existing prod table — see LicenseConfiguration above.
        db_table = 'licensing_licenseconfigauditlog'

    def __str__(self):
        return f'{self.action} by {self.actor} at {self.timestamp}'
