from functools import wraps

from django.http import JsonResponse


def requires_feature(feature_code):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            license_data = getattr(request, 'license', None)
            if license_data is None:
                return view_func(request, *args, **kwargs)

            features = license_data.get('features', [])
            if feature_code not in features:
                return JsonResponse(
                    {'detail': 'Feature not enabled', 'feature': feature_code},
                    status=403,
                )
            return view_func(request, *args, **kwargs)
        return _wrapped
    return decorator
