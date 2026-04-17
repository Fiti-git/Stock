from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.licensing.models import LicenseConfiguration, CachedLicense, LicenseConfigAuditLog
from apps.licensing.serializers import (
    LicenseConfigSerializer,
    LicenseConfigWriteSerializer,
    LicenseTestSerializer,
    LicenseAuditLogSerializer,
    LicenseStatusSerializer,
)
from apps.licensing.client import test_connection, verify_license, get_cached_or_refresh


def _is_service_provider(user):
    return user.groups.filter(name='ServiceProvider').exists() or user.is_superuser


def _get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')


def _log_audit(request, action, fields_changed=None, success=True):
    LicenseConfigAuditLog.objects.create(
        action=action,
        actor=request.user,
        fields_changed=fields_changed or [],
        ip_address=_get_client_ip(request),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        success=success,
    )


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def license_config(request):
    if not _is_service_provider(request.user):
        return Response({'detail': 'ServiceProvider role required.'}, status=403)

    if request.method == 'GET':
        config = LicenseConfiguration.objects.first()
        if not config:
            return Response({'configured': False})
        return Response(LicenseConfigSerializer(config).data)

    # PUT — create or update
    serializer = LicenseConfigWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    config = LicenseConfiguration.objects.first()
    is_create = config is None

    if is_create:
        if not data.get('instance_secret') or data['instance_secret'] == '********':
            return Response(
                {'detail': 'instance_secret is required for initial setup.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        config = LicenseConfiguration(
            instance_id=data['instance_id'],
            license_server_url=data['license_server_url'],
            license_public_key_pem=data['license_public_key_pem'],
            configured_by=request.user,
        )
        config.set_secret(data['instance_secret'])
        config.save()
        _log_audit(request, 'CREATE', ['instance_id', 'license_server_url', 'license_public_key_pem', 'instance_secret'])
    else:
        changed = []
        if data['instance_id'] != config.instance_id:
            config.instance_id = data['instance_id']
            changed.append('instance_id')
        if data['license_server_url'] != config.license_server_url:
            config.license_server_url = data['license_server_url']
            changed.append('license_server_url')
        if data['license_public_key_pem'] != config.license_public_key_pem:
            config.license_public_key_pem = data['license_public_key_pem']
            changed.append('license_public_key_pem')

        secret = data.get('instance_secret', '')
        if secret and secret != '********':
            config.set_secret(secret)
            changed.append('instance_secret')

        config.save()
        _log_audit(request, 'UPDATE', changed)

    return Response(LicenseConfigSerializer(config).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def license_config_test(request):
    if not _is_service_provider(request.user):
        return Response({'detail': 'ServiceProvider role required.'}, status=403)

    serializer = LicenseTestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    config = LicenseConfiguration.objects.first()

    instance_id = str(data.get('instance_id') or (config.instance_id if config else ''))
    instance_secret = data.get('instance_secret', '')
    server_url = data.get('license_server_url') or (config.license_server_url if config else '')
    public_key = data.get('license_public_key_pem') or (config.license_public_key_pem if config else '')

    if instance_secret in ('', '********') and config:
        instance_secret = config.get_secret()

    if not all([instance_id, instance_secret, server_url, public_key]):
        return Response(
            {'detail': 'All fields required for test (or existing config must be saved).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = test_connection(instance_id, instance_secret, server_url, public_key)
        _log_audit(request, 'TEST_CONNECTION', success=result['success'])
        return Response(result)
    except Exception as e:
        _log_audit(request, 'TEST_CONNECTION', success=False)
        return Response({'success': False, 'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def license_config_audit(request):
    if not _is_service_provider(request.user):
        return Response({'detail': 'ServiceProvider role required.'}, status=403)

    logs = LicenseConfigAuditLog.objects.all()[:50]
    return Response(LicenseAuditLogSerializer(logs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def license_status(request):
    config = LicenseConfiguration.objects.first()
    if not config:
        return Response({
            'configured': False,
            'state': 'unconfigured',
            'features': [],
            'subscription_status': None,
            'ends_at': None,
            'grace_until': None,
            'client_name': None,
        })

    payload = get_cached_or_refresh()
    if payload is None:
        return Response({
            'configured': True,
            'state': 'unknown',
            'features': [],
            'subscription_status': None,
            'ends_at': None,
            'grace_until': None,
            'client_name': None,
        })

    return Response({
        'configured': True,
        'state': payload.get('state', 'active'),
        'features': payload.get('features', []),
        'subscription_status': payload.get('subscription_status'),
        'ends_at': payload.get('ends_at'),
        'grace_until': payload.get('grace_until'),
        'client_name': payload.get('client_name'),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def license_refresh(request):
    """Force refresh the cached license from the License Server."""
    if not _is_service_provider(request.user):
        return Response({'detail': 'ServiceProvider role required.'}, status=403)

    config = LicenseConfiguration.objects.first()
    if not config:
        return Response({'detail': 'License not configured.'}, status=400)

    try:
        payload = verify_license(config)
        return Response({
            'success': True,
            'state': payload.get('state'),
            'features': payload.get('features', []),
        })
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=502)
