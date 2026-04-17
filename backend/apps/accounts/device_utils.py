"""
Helpers for tracking mobile-device activity.

Every mobile-app request carries an `X-Device-UUID` header (generated once on
first launch and stored in AsyncStorage). These helpers register/update the
MobileDevice row and increment activity counters.
"""
from django.utils import timezone
from .models import MobileDevice


def get_device_uuid(request):
    """Return the device UUID from request headers/body, or empty string."""
    uuid = request.META.get("HTTP_X_DEVICE_UUID", "").strip()
    if uuid:
        return uuid
    # Fallback to body for clients that can't set headers
    return (request.data.get("device_uuid") if hasattr(request, "data") else "") or ""


def touch_device(request, *, action=None):
    """
    Register or update the MobileDevice row for this request.

    `action` is one of: None, "count", "assign" — increments the matching
    counter when provided. Returns the MobileDevice instance or None when no
    UUID is present (e.g. web clients).
    """
    device_uuid = get_device_uuid(request)
    if not device_uuid:
        return None

    platform = request.META.get("HTTP_X_DEVICE_PLATFORM", "").strip()[:20]
    app_version = request.META.get("HTTP_X_APP_VERSION", "").strip()[:30]
    user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
    outlet = getattr(user, "outlet", None) if user else None

    device, _ = MobileDevice.objects.get_or_create(
        device_uuid=device_uuid,
        defaults={
            "platform": platform,
            "app_version": app_version,
            "last_user": user,
            "last_outlet": outlet,
        },
    )

    updates = {"last_seen_at": timezone.now()}
    if platform and device.platform != platform:
        updates["platform"] = platform
    if app_version and device.app_version != app_version:
        updates["app_version"] = app_version
    if user and device.last_user_id != user.id:
        updates["last_user"] = user
    if outlet and device.last_outlet_id != outlet.id:
        updates["last_outlet"] = outlet

    if action == "count":
        updates["total_counts"] = device.total_counts + 1
    elif action == "assign":
        updates["total_assigns"] = device.total_assigns + 1

    MobileDevice.objects.filter(pk=device.pk).update(**updates)
    for k, v in updates.items():
        setattr(device, k, v)
    return device
