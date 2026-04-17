from rest_framework import serializers

from apps.licensing.models import LicenseConfiguration, LicenseConfigAuditLog


class LicenseConfigSerializer(serializers.ModelSerializer):
    instance_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    instance_secret_display = serializers.SerializerMethodField()
    configured_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LicenseConfiguration
        fields = [
            'id', 'instance_id', 'instance_secret', 'instance_secret_display',
            'license_server_url', 'license_public_key_pem',
            'configured_at', 'configured_by', 'configured_by_name', 'updated_at',
        ]
        read_only_fields = ['id', 'configured_at', 'configured_by', 'updated_at']

    def get_instance_secret_display(self, obj):
        return '********'

    def get_configured_by_name(self, obj):
        return obj.configured_by.username if obj.configured_by else None


class LicenseConfigWriteSerializer(serializers.Serializer):
    instance_id = serializers.UUIDField()
    instance_secret = serializers.CharField(required=False, allow_blank=True)
    license_server_url = serializers.URLField()
    license_public_key_pem = serializers.CharField()


class LicenseTestSerializer(serializers.Serializer):
    instance_id = serializers.UUIDField(required=False)
    instance_secret = serializers.CharField(required=False, allow_blank=True)
    license_server_url = serializers.URLField(required=False)
    license_public_key_pem = serializers.CharField(required=False)


class LicenseAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = LicenseConfigAuditLog
        fields = [
            'id', 'action', 'actor', 'actor_name', 'fields_changed',
            'ip_address', 'success', 'timestamp',
        ]

    def get_actor_name(self, obj):
        return obj.actor.username if obj.actor else None


class LicenseStatusSerializer(serializers.Serializer):
    configured = serializers.BooleanField()
    state = serializers.CharField()
    features = serializers.ListField(child=serializers.CharField())
    subscription_status = serializers.CharField(allow_null=True)
    ends_at = serializers.CharField(allow_null=True)
    grace_until = serializers.CharField(allow_null=True)
    client_name = serializers.CharField(allow_null=True)
