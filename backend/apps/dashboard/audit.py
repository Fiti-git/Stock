"""
Audit helper — writes rich AuditLog entries with before/after diffs for
workflow-critical actions (count approval, variance resolution, session
lifecycle). Uses the existing AuditLog.details JSONField so no migration
is needed on the uploads app.
"""

from decimal import Decimal
from datetime import date, datetime


def _jsonable(v):
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


def _snapshot(obj, fields):
    return {f: _jsonable(getattr(obj, f, None)) for f in fields}


def record_audit(*, user, action, entity, before=None, after=None, reason="", extra=None):
    """
    Write a single AuditLog row. `before` and `after` should be dicts (or None).
    `entity` is the model instance the action targets.
    """
    from apps.uploads.models import AuditLog

    entity_type = entity.__class__.__name__ if entity is not None else ""
    entity_id = str(getattr(entity, "pk", "") or "")
    details = {}
    if before is not None:
        details["before"] = {k: _jsonable(v) for k, v in before.items()}
    if after is not None:
        details["after"] = {k: _jsonable(v) for k, v in after.items()}
    if reason:
        details["reason"] = reason
    if extra:
        details["extra"] = extra

    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )


def snapshot_stock_count(sc):
    return _snapshot(sc, [
        "id", "outlet_id", "item_id", "count_date", "actual_qty",
        "location_tag", "approval_status", "session_id",
        "approved_by_id", "approved_at", "rejection_reason",
    ])


def snapshot_variance(v):
    return _snapshot(v, [
        "id", "outlet_id", "item_id", "count_date",
        "pos_qty", "counted_qty", "variance_qty",
        "status", "resolution_note", "adjustment_qty",
        "resolved_by_id", "resolved_at",
    ])


def snapshot_session(s):
    return _snapshot(s, [
        "id", "outlet_id", "count_date", "status",
        "started_by_id", "started_at", "closed_by_id", "closed_at", "note",
    ])
