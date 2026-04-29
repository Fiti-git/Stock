from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from apps.uploads.models import AuditLog
from .models import User, LoginEvent
from .permissions import IsAdmin, IsSuperAdmin
from .permission_registry import (
    registry_as_dicts,
    effective_permissions_for,
    systems_for_user,
)
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    PermissionsOverrideSerializer,
)


def _client_ip(request):
    """Best-effort client IP, honoring X-Forwarded-For."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return (request.META.get("REMOTE_ADDR") or "")[:64]


class LoggingTokenObtainPairView(TokenObtainPairView):
    """
    Wraps SimpleJWT's token obtain endpoint to record a LoginEvent row for
    both successful and failed attempts, capturing client IP, User-Agent and
    optional mobile-device headers.
    """

    def post(self, request, *args, **kwargs):
        username = (request.data.get("username") or "")[:150]
        common = {
            "username_attempted": username,
            "ip_address": _client_ip(request),
            "user_agent": (request.META.get("HTTP_USER_AGENT") or "")[:500],
            "device_uuid": (request.META.get("HTTP_X_DEVICE_UUID") or "")[:64],
            "platform": (request.META.get("HTTP_X_DEVICE_PLATFORM") or "")[:20],
            "app_version": (request.META.get("HTTP_X_APP_VERSION") or "")[:30],
        }
        try:
            response = super().post(request, *args, **kwargs)
        except Exception as exc:  # auth failure, invalid payload, etc.
            user_obj = User.objects.filter(username__iexact=username).first() if username else None
            LoginEvent.objects.create(
                user=user_obj,
                success=False,
                failure_reason=str(exc)[:200],
                **common,
            )
            raise

        user_obj = User.objects.filter(username__iexact=username).first() if username else None
        LoginEvent.objects.create(
            user=user_obj,
            success=response.status_code == 200,
            failure_reason="" if response.status_code == 200 else f"HTTP {response.status_code}",
            **common,
        )
        return response


class LoginEventListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        from datetime import datetime
        qs = LoginEvent.objects.select_related("user").order_by("-created_at")

        username = (request.query_params.get("user") or "").strip()
        if username:
            qs = qs.filter(username_attempted__icontains=username)

        ip = (request.query_params.get("ip") or "").strip()
        if ip:
            qs = qs.filter(ip_address__icontains=ip)

        success = request.query_params.get("success")
        if success in ("true", "1"):
            qs = qs.filter(success=True)
        elif success in ("false", "0"):
            qs = qs.filter(success=False)

        try:
            from_date = datetime.strptime(request.query_params.get("from_date", ""), "%Y-%m-%d").date()
            qs = qs.filter(created_at__date__gte=from_date)
        except ValueError:
            pass
        try:
            to_date = datetime.strptime(request.query_params.get("to_date", ""), "%Y-%m-%d").date()
            qs = qs.filter(created_at__date__lte=to_date)
        except ValueError:
            pass

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1
        page_size = 50
        total = qs.count()
        offset = (page - 1) * page_size
        rows = qs[offset: offset + page_size]

        results = [
            {
                "id": e.id,
                "created_at": e.created_at.isoformat(),
                "user_id": e.user_id,
                "username": e.user.username if e.user else e.username_attempted,
                "username_attempted": e.username_attempted,
                "success": e.success,
                "failure_reason": e.failure_reason,
                "ip_address": e.ip_address,
                "user_agent": e.user_agent,
                "device_uuid": e.device_uuid,
                "platform": e.platform,
                "app_version": e.app_version,
            }
            for e in rows
        ]

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "results": results,
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        users = User.objects.select_related("outlet").order_by("username")
        return Response(UserSerializer(users, many=True).data)

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.save()
        AuditLog.objects.create(
            user=request.user,
            action="user_created",
            entity_type="user",
            entity_id=str(user.id),
            details={"username": user.username, "role": user.role, "outlet_id": user.outlet_id},
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAdmin]

    def get_object(self, pk):
        try:
            return User.objects.select_related("outlet").get(pk=pk)
        except User.DoesNotExist:
            return None

    def get(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSerializer(user).data)

    def patch(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        was_active = user.is_active
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        updated = serializer.save()
        changes = {k: str(v) for k, v in request.data.items() if k != "password"}
        action = "user_deactivated" if was_active and not updated.is_active else \
                 "user_activated" if not was_active and updated.is_active else "user_updated"
        AuditLog.objects.create(
            user=request.user,
            action=action,
            entity_type="user",
            entity_id=str(updated.id),
            details={"username": updated.username, "changes": changes},
        )
        return Response(UserSerializer(updated).data)

    def delete(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if user == request.user:
            return Response({"detail": "Cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.objects.create(
            user=request.user,
            action="user_deleted",
            entity_type="user",
            entity_id=str(user.id),
            details={"username": user.username, "role": user.role},
        )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SetManagerPinView(APIView):
    """
    POST /api/auth/users/<id>/set-manager-pin/ — set or rotate a user's
    numeric manager PIN. Body: {"pin": "1234"} (4–6 digits).

    Authorization: admin/super_admin can set anyone's PIN; any user can set
    their own. PIN itself is never logged.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            target = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        is_admin = request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN)
        if not (is_admin or request.user.id == target.id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        pin = str(request.data.get("pin") or "").strip()
        if not pin.isdigit() or not (4 <= len(pin) <= 6):
            return Response(
                {"detail": "PIN must be 4–6 digits."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target.set_manager_pin(pin)
        AuditLog.objects.create(
            user=request.user,
            action="accounts.manager_pin_set",
            entity_type="user",
            entity_id=str(target.id),
            details={"username": target.username, "self": request.user.id == target.id},
        )
        return Response({"ok": True})


class PermissionRegistryView(APIView):
    """GET the catalog of permission codes (Super Admin only)."""
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        return Response({"permissions": registry_as_dicts()})


class UserPermissionsDetailView(APIView):
    """
    GET  /auth/user-permissions/<id>/  — return the user's effective + override.
    PATCH /auth/user-permissions/<id>/ — update the override.
        body: {"permissions_override": null | [code, ...]}
    Super Admin only.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "permissions_override": user.permissions_override,
            "effective_permissions": effective_permissions_for(user),
            "systems": systems_for_user(user),
        })

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Never allow editing another Super Admin's permissions (they always
        # have everything and would be confusing to toggle).
        if user.role == User.Role.SUPER_ADMIN:
            return Response(
                {"detail": "Super Admins always have all permissions; override not editable."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PermissionsOverrideSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_override = serializer.validated_data["permissions_override"]
        user.permissions_override = new_override
        user.save(update_fields=["permissions_override"])

        AuditLog.objects.create(
            user=request.user,
            action="user_permissions_updated",
            entity_type="user",
            entity_id=str(user.id),
            details={
                "username": user.username,
                "override": new_override,
            },
        )

        return Response({
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "permissions_override": user.permissions_override,
            "effective_permissions": effective_permissions_for(user),
            "systems": systems_for_user(user),
        })
