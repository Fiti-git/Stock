import logging

from django.http import JsonResponse

from apps.licensing.models import LicenseConfiguration, CachedLicense
from apps.licensing.client import get_cached_or_refresh

logger = logging.getLogger(__name__)

EXEMPT_PATHS = (
    '/api/license/',
    '/api/auth/',
    '/health/',
    '/admin/',
)


class LicenseMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        if any(path.startswith(p) for p in EXEMPT_PATHS):
            request.license = None
            request.license_state = 'active'
            return self.get_response(request)

        config = LicenseConfiguration.objects.first()
        if not config:
            return JsonResponse(
                {'detail': 'License not configured', 'setup_required': True},
                status=503,
            )

        payload = get_cached_or_refresh()

        if payload is None:
            request.license = None
            request.license_state = 'active'
            return self.get_response(request)

        request.license = payload
        state = payload.get('state', 'active')
        request.license_state = state

        if state == 'locked':
            return JsonResponse(
                {'detail': 'License expired. Contact your service provider.'},
                status=402,
            )

        if state == 'readonly' and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if not any(path.startswith(p) for p in EXEMPT_PATHS):
                return JsonResponse(
                    {'detail': 'Subscription unpaid. System is in read-only mode.'},
                    status=402,
                )

        return self.get_response(request)
