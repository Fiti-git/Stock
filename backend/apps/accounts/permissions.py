from rest_framework.permissions import BasePermission
from .models import User


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.ADMIN


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.MANAGER,
            User.Role.ADMIN,
        )


class IsStoreUser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.STORE_USER,
            User.Role.MANAGER,
            User.Role.ADMIN,
        )


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.STAFF,
            User.Role.MANAGER,
            User.Role.ADMIN,
        )


class CanCount(BasePermission):
    """Allows anyone with an outlet assignment to submit/view stock counts."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            User.Role.STORE_USER,
            User.Role.STAFF,
            User.Role.MANAGER,
            User.Role.ADMIN,
        )
