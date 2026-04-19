from rest_framework.permissions import BasePermission
from .models import User
from .permission_registry import user_has_permission


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == User.Role.SUPER_ADMIN
        )


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.ADMIN,
            User.Role.SUPER_ADMIN,
        )


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.MANAGER,
            User.Role.ADMIN,
            User.Role.SUPER_ADMIN,
        )


class IsStoreUser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.STORE_USER,
            User.Role.MANAGER,
            User.Role.ADMIN,
            User.Role.SUPER_ADMIN,
        )


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.STAFF,
            User.Role.MANAGER,
            User.Role.ADMIN,
            User.Role.SUPER_ADMIN,
        )


class CanCount(BasePermission):
    """Allows anyone with an outlet assignment to submit/view stock counts."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.STORE_USER,
            User.Role.STAFF,
            User.Role.MANAGER,
            User.Role.ADMIN,
            User.Role.SUPER_ADMIN,
        )


class HasPermissionCode(BasePermission):
    """
    DRF permission class that checks a fine-grained code from the permission
    registry. Usage on a view:

        class MyView(APIView):
            permission_classes = [HasPermissionCode]
            required_permission = "items.delete"
    """
    def has_permission(self, request, view):
        code = getattr(view, "required_permission", None)
        if not code:
            return False
        return user_has_permission(request.user, code)
