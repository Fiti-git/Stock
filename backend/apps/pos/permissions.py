from rest_framework.permissions import BasePermission
from apps.accounts.permission_registry import user_has_permission


class _HasCode(BasePermission):
    code = ""
    def has_permission(self, request, view):
        return request.user.is_authenticated and user_has_permission(request.user, self.code)


class CanSell(_HasCode):
    code = "pos.sell"


class CanOpenShift(_HasCode):
    code = "pos.shift_open"


class CanCloseShift(_HasCode):
    code = "pos.shift_close"


class CanVoidBill(_HasCode):
    code = "pos.void"


class CanViewPosReports(_HasCode):
    code = "pos.reports"
