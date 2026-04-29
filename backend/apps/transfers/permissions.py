"""
Role-based gate helpers for StockTransfer transitions.

Rules (admin/super_admin always allowed):
  - dispatch  → user must be manager+ at the source outlet
  - receive   → user must be manager+ at the destination outlet
  - cancel    → either source or dest user before dispatch;
                only manager+ after dispatch
  - close     → either source or dest manager+
"""

ADMIN_ROLES = {"admin", "super_admin"}
MANAGER_ROLES = {"manager", "admin", "super_admin"}


def _is_admin(user):
    return bool(user and user.is_authenticated and user.role in ADMIN_ROLES)


def _is_manager(user):
    return bool(user and user.is_authenticated and user.role in MANAGER_ROLES)


def _at_outlet(user, outlet_id):
    return bool(user and user.is_authenticated and user.outlet_id == outlet_id)


def can_view(user, transfer):
    if not user or not user.is_authenticated:
        return False
    if _is_admin(user):
        return True
    return _at_outlet(user, transfer.source_outlet_id) or _at_outlet(user, transfer.dest_outlet_id)


def can_create_or_edit_draft(user, transfer):
    """Either source or destination side may shape a draft."""
    if _is_admin(user):
        return True
    return _at_outlet(user, transfer.source_outlet_id) or _at_outlet(user, transfer.dest_outlet_id)


def can_request(user, transfer):
    return can_create_or_edit_draft(user, transfer)


def can_dispatch(user, transfer):
    if _is_admin(user):
        return True
    return _is_manager(user) and _at_outlet(user, transfer.source_outlet_id)


def can_receive(user, transfer):
    if _is_admin(user):
        return True
    return _is_manager(user) and _at_outlet(user, transfer.dest_outlet_id)


def can_cancel(user, transfer):
    if _is_admin(user):
        return True
    on_either = (_at_outlet(user, transfer.source_outlet_id)
                 or _at_outlet(user, transfer.dest_outlet_id))
    if not on_either:
        return False
    if transfer.status in ("dispatched",):
        return _is_manager(user)
    return True


def can_close(user, transfer):
    if _is_admin(user):
        return True
    if not _is_manager(user):
        return False
    return (_at_outlet(user, transfer.source_outlet_id)
            or _at_outlet(user, transfer.dest_outlet_id))
