"""
Approval-decision helpers for the manager-driven upload flow.

Rules (per business owner spec, 2026-05):
  - Manager uploading for TODAY (or a range that covers today): auto-approve.
    Multiple uploads same date are allowed; no admin needed.
  - Manager uploading PAST date with no existing approved record for that
    (outlet, date): auto-approve.
  - Manager uploading PAST date that already has an approved record for
    that (outlet, date): pending admin approval (old record stays live
    until admin approves).
  - Admin / Super-admin: always auto-approve (override).
"""

from dataclasses import dataclass
from datetime import date
from typing import Optional

from apps.accounts.models import User


@dataclass
class ApprovalDecision:
    needs_approval: bool
    reason: str = ""  # short code: "" | "past_date_overlap" | "past_date_duplicate"


def _is_admin(user) -> bool:
    return user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN)


def decide_pos(user, outlet, snapshot_date: date) -> ApprovalDecision:
    """POS snapshot: per (outlet, snapshot_date)."""
    from .models import UploadLog

    if _is_admin(user):
        return ApprovalDecision(False)

    today = date.today()
    if snapshot_date >= today:
        return ApprovalDecision(False)

    existing = UploadLog.objects.filter(
        outlet=outlet,
        snapshot_date=snapshot_date,
        status=UploadLog.Status.SUCCESS,
        approval_status__in=(
            UploadLog.ApprovalStatus.AUTO,
            UploadLog.ApprovalStatus.APPROVED,
        ),
    ).exists()
    return ApprovalDecision(existing, "past_date_duplicate" if existing else "")


def decide_range(user, outlet, date_from: date, date_to: date, batch_model) -> ApprovalDecision:
    """
    Date-range batch pipelines (Damage/Office/Verification/GRN/RTS/Sales/SalesReturns).
    Considered 'past' only when the range ends before today. If the range covers
    today, allow auto regardless of overlap.
    """
    if _is_admin(user):
        return ApprovalDecision(False)

    today = date.today()
    if date_to >= today:
        return ApprovalDecision(False)

    overlap = batch_model.objects.filter(
        outlet=outlet,
        status=batch_model.Status.SUCCESS,
        approval_status__in=(
            batch_model.ApprovalStatus.AUTO,
            batch_model.ApprovalStatus.APPROVED,
        ),
        date_from__lte=date_to,
        date_to__gte=date_from,
    ).exists()
    return ApprovalDecision(overlap, "past_date_overlap" if overlap else "")
