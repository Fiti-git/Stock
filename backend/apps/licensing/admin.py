from django.contrib import admin
from apps.licensing.models import LicenseConfiguration, CachedLicense, LicenseConfigAuditLog


@admin.register(LicenseConfiguration)
class LicenseConfigurationAdmin(admin.ModelAdmin):
    list_display = ['instance_id', 'license_server_url', 'configured_at', 'configured_by']
    readonly_fields = ['instance_secret_encrypted', 'configured_at', 'updated_at']


@admin.register(CachedLicense)
class CachedLicenseAdmin(admin.ModelAdmin):
    list_display = ['fetched_at', 'expires_at']
    readonly_fields = ['jwt_token', 'decoded_payload', 'fetched_at', 'expires_at']


@admin.register(LicenseConfigAuditLog)
class LicenseConfigAuditLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'actor', 'success', 'ip_address', 'timestamp']
    list_filter = ['action', 'success']
    readonly_fields = ['action', 'actor', 'fields_changed', 'ip_address', 'user_agent', 'success', 'timestamp']
