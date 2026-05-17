"""
Shared view helpers for the three 17-column transaction report types that have
identical file shapes but separate DB tables:

    * Damage / Wastage   → DamageUploadBatch   + DamageLine
    * Office Use         → OfficeUploadBatch   + OfficeLine
    * Verification       → VerificationUploadBatch + VerificationLine

Each type gets its own URL path and its own tables (as requested); only the
backend plumbing is shared to avoid 3× duplicated code. A small `TypeConfig`
dataclass tells the helpers which models, labels, and audit action names to
use for each type.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Type

from django.db import transaction
from django.db.models import Sum, Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response


# Pagination bounds. 100 is generous enough that the admin table stays
# useful; beyond that queries start returning megabytes of JSON and the
# frontend grid stalls.
MAX_PAGE_SIZE = 100
DEFAULT_BATCH_PAGE_SIZE = 20
DEFAULT_LINE_PAGE_SIZE = 100


def _paginate_params(request, default_size):
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size") or default_size)
    except (TypeError, ValueError):
        page_size = default_size
    page_size = max(1, min(MAX_PAGE_SIZE, page_size))
    return page, page_size

from apps.accounts.models import User
from apps.outlets.models import Outlet
from utils.damage_parser import parse_damage_xls, validate_damage_file  # format-agnostic 17-col parser

from .models import AuditLog, UploadedSheet
from .approval_logic import decide_range
from .sheet_recorder import record_uploaded_sheet
from .pipeline_registry import TXN17_COLUMNS


@dataclass
class TypeConfig:
    type_code: str           # e.g. "damage", "office", "verification"
    label: str               # human-readable, e.g. "Damage"
    batch_model: Type        # e.g. DamageUploadBatch
    line_model: Type         # e.g. DamageLine


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #
def resolve_outlet(request):
    user = request.user
    outlet_id = request.data.get("outlet_id") or request.query_params.get("outlet_id")
    if outlet_id and user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return get_object_or_404(Outlet, pk=outlet_id)
    return user.outlet


def batch_summary(b) -> dict:
    return {
        "id": b.id,
        "outlet_id": b.outlet_id,
        "outlet_name": b.outlet.outlet_name if b.outlet_id else None,
        "date_from": str(b.date_from),
        "date_to": str(b.date_to),
        "uploaded_by": b.uploaded_by.username if b.uploaded_by_id else None,
        "uploaded_at": b.uploaded_at.isoformat(),
        "status": b.status,
        "approval_status": b.approval_status,
        "approved_by": b.approved_by.username if b.approved_by_id else None,
        "approved_at": b.approved_at.isoformat() if b.approved_at else None,
        "total_rows": b.total_rows,
        "total_amount": float(b.total_amount or 0),
        "filename": b.filename,
    }


def find_overlapping_batches(cfg: TypeConfig, outlet, date_from, date_to, exclude_id=None):
    qs = cfg.batch_model.objects.filter(
        outlet=outlet,
        status=cfg.batch_model.Status.SUCCESS,
        date_from__lte=date_to,
        date_to__gte=date_from,
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.order_by("-uploaded_at")


def commit_batch(cfg: TypeConfig, outlet, user, parsed, filename: str,
                 approval_status: str, approved_by=None, approved_at=None):
    with transaction.atomic():
        batch = cfg.batch_model.objects.create(
            outlet=outlet,
            date_from=parsed.date_from,
            date_to=parsed.date_to,
            uploaded_by=user,
            status=cfg.batch_model.Status.SUCCESS,
            total_rows=len(parsed.rows),
            total_amount=Decimal(str(round(sum(r.amount for r in parsed.rows), 2))),
            filename=filename[:255],
            approval_status=approval_status,
            approved_by=approved_by,
            approved_at=approved_at,
        )
        lines = [
            cfg.line_model(
                batch=batch,
                outlet=outlet,
                doc_no=r.doc_no,
                txn_date=r.txn_date,
                item_code=r.item_code,
                description=r.description,
                pack_size=r.pack_size,
                cost_price=None if r.cost_price is None else Decimal(str(r.cost_price)),
                selling_price=None if r.selling_price is None else Decimal(str(r.selling_price)),
                qty=Decimal(str(r.qty)),
                amount=Decimal(str(r.amount)),
                user_name=r.user_name,
                txn_time=r.txn_time,
            )
            for r in parsed.rows
        ]
        cfg.line_model.objects.bulk_create(lines, batch_size=500)
        AuditLog.objects.create(
            user=user,
            action=f"{cfg.type_code}_upload",
            entity_type=f"{cfg.type_code}_batch",
            entity_id=str(batch.id),
            details={
                "outlet_id": outlet.id,
                "date_from": str(parsed.date_from),
                "date_to": str(parsed.date_to),
                "rows": len(parsed.rows),
            },
        )
    return batch


# --------------------------------------------------------------------------- #
# Request handlers — each view calls into these with its TypeConfig.          #
# --------------------------------------------------------------------------- #
def handle_validate(request, cfg: TypeConfig) -> Response:
    file = request.FILES.get("file")
    if not file:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

    outlet = resolve_outlet(request)
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    result = validate_damage_file(file, file.name)
    parsed = result.pop("_parsed", None)

    raw_from = request.data.get("date_from")
    raw_to = request.data.get("date_to")
    try:
        if raw_from:
            parsed.date_from = date.fromisoformat(raw_from)
            result["preview"]["date_from"] = raw_from
        if raw_to:
            parsed.date_to = date.fromisoformat(raw_to)
            result["preview"]["date_to"] = raw_to
    except ValueError:
        return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    result["outlet_id"] = outlet.id
    result["outlet_name"] = outlet.outlet_name
    result["today"] = str(date.today())

    overlaps = []
    if parsed and parsed.date_from and parsed.date_to:
        overlaps = [batch_summary(b) for b in find_overlapping_batches(cfg, outlet, parsed.date_from, parsed.date_to)]
    result["overlapping_batches"] = overlaps
    result["has_overlap"] = bool(overlaps)

    if parsed and parsed.date_from and parsed.date_to:
        decision = decide_range(request.user, outlet, parsed.date_from, parsed.date_to, cfg.batch_model)
        result["needs_approval"] = decision.needs_approval
        result["approval_reasons"] = [decision.reason] if decision.reason else []
    else:
        result["needs_approval"] = False
        result["approval_reasons"] = []
    return Response(result)


def handle_confirm(request, cfg: TypeConfig) -> Response:
    file = request.FILES.get("file")
    if not file:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

    outlet = resolve_outlet(request)
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    validation = validate_damage_file(file, file.name)
    parsed = validation.pop("_parsed", None)
    if not validation["valid"]:
        return Response(
            {"detail": "File validation failed.", "errors": validation["errors"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    raw_from = request.data.get("date_from")
    raw_to = request.data.get("date_to")
    try:
        if raw_from:
            parsed.date_from = date.fromisoformat(raw_from)
        if raw_to:
            parsed.date_to = date.fromisoformat(raw_to)
    except ValueError:
        return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    # New approval rule (manager-driven):
    #   - range covers today  → auto
    #   - past range, no overlap → auto
    #   - past range, overlaps an active batch → pending
    decision = decide_range(request.user, outlet, parsed.date_from, parsed.date_to, cfg.batch_model)
    if decision.needs_approval:
        batch = cfg.batch_model.objects.create(
            outlet=outlet,
            date_from=parsed.date_from,
            date_to=parsed.date_to,
            uploaded_by=request.user,
            status=cfg.batch_model.Status.SUCCESS,
            total_rows=len(parsed.rows),
            total_amount=Decimal(str(round(sum(r.amount for r in parsed.rows), 2))),
            filename=file.name[:255],
            approval_status=cfg.batch_model.ApprovalStatus.PENDING,
            stored_file=file,
        )
        record_uploaded_sheet(
            pipeline=cfg.type_code,
            batch_id=batch.id,
            outlet=outlet,
            business_date=parsed.date_from,
            business_date_to=parsed.date_to,
            uploaded_by=request.user,
            filename=file.name,
            row_count=len(parsed.rows),
            columns=TXN17_COLUMNS,
            approval_status=UploadedSheet.ApprovalStatus.PENDING,
            approval_reason=decision.reason,
        )
        AuditLog.objects.create(
            user=request.user,
            action=f"{cfg.type_code}_upload_pending",
            entity_type=f"{cfg.type_code}_batch",
            entity_id=str(batch.id),
            details={
                "outlet_id": outlet.id,
                "date_from": str(parsed.date_from),
                "date_to": str(parsed.date_to),
                "rows": len(parsed.rows),
                "reason": decision.reason,
            },
        )
        return Response({"status": "pending_approval", "batch": batch_summary(batch)}, status=status.HTTP_202_ACCEPTED)

    batch = commit_batch(cfg, outlet, request.user, parsed, file.name, cfg.batch_model.ApprovalStatus.AUTO)
    record_uploaded_sheet(
        pipeline=cfg.type_code,
        batch_id=batch.id,
        outlet=outlet,
        business_date=parsed.date_from,
        business_date_to=parsed.date_to,
        uploaded_by=request.user,
        filename=file.name,
        row_count=len(parsed.rows),
        columns=TXN17_COLUMNS,
        approval_status=UploadedSheet.ApprovalStatus.AUTO,
    )
    return Response({"status": "committed", "batch": batch_summary(batch)})


def _scope_batches(request, cfg: TypeConfig):
    """Shared queryset factory honoring the current user's outlet scope + filters."""
    user = request.user
    qs = cfg.batch_model.objects.select_related("outlet", "uploaded_by", "approved_by")
    outlet_id = request.query_params.get("outlet_id")
    if user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if outlet_id:
            qs = qs.filter(outlet_id=outlet_id)
    else:
        qs = qs.filter(outlet=user.outlet)

    approval = request.query_params.get("approval_status")
    if approval:
        qs = qs.filter(approval_status=approval)

    include_deleted = (request.query_params.get("include_deleted") or "").lower() in ("1", "true", "yes")
    if not include_deleted:
        qs = qs.exclude(status=cfg.batch_model.Status.DELETED)
    return qs


def _compute_gaps(cfg: TypeConfig, outlet, days: int = 60):
    """Return a sorted list of ISO-date strings with no covering batch in the
    last `days` days (Sundays excluded). Bounded work regardless of batch count."""
    if not outlet:
        return []
    window_end = date.today()
    window_start = window_end - timedelta(days=days)
    covered = set()
    active = cfg.batch_model.objects.filter(
        outlet=outlet,
        status=cfg.batch_model.Status.SUCCESS,
        date_from__lte=window_end,
        date_to__gte=window_start,
    ).values_list("date_from", "date_to")
    for df, dt in active:
        d = max(df, window_start)
        end = min(dt, window_end)
        while d <= end:
            covered.add(d)
            d += timedelta(days=1)
    missing = []
    d = window_start
    while d <= window_end:
        if d.weekday() != 6 and d not in covered:
            missing.append(str(d))
        d += timedelta(days=1)
    return missing


def handle_list(request, cfg: TypeConfig) -> Response:
    """Paginated batch list. Query params: page, page_size, outlet_id,
    approval_status, include_deleted."""
    user = request.user
    page, page_size = _paginate_params(request, DEFAULT_BATCH_PAGE_SIZE)

    qs = _scope_batches(request, cfg).order_by("-uploaded_at")
    total = qs.count()
    offset = (page - 1) * page_size
    batches = [batch_summary(b) for b in qs[offset: offset + page_size]]

    # Gap report only on page 1 — it's bounded work but no reason to recompute
    # it for every page click.
    missing = []
    if page == 1:
        outlet_id = request.query_params.get("outlet_id")
        gap_outlet = None
        if user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and outlet_id:
            gap_outlet = Outlet.objects.filter(pk=outlet_id).first()
        elif user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            gap_outlet = user.outlet
        missing = _compute_gaps(cfg, gap_outlet)[-30:]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "batches": batches,
        "missing_dates": missing,
    })


def handle_stats(request, cfg: TypeConfig) -> Response:
    """
    Lightweight summary the hub cards use to avoid pulling the full paginated
    list. Returns counts + latest batch stub + gap count. Cheap aggregate
    queries only, no per-row joins.
    """
    user = request.user
    qs = _scope_batches(request, cfg)

    agg = qs.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(approval_status=cfg.batch_model.ApprovalStatus.PENDING)),
    )
    latest = qs.order_by("-uploaded_at").first()

    outlet_id = request.query_params.get("outlet_id")
    gap_outlet = None
    if user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and outlet_id:
        gap_outlet = Outlet.objects.filter(pk=outlet_id).first()
    elif user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        gap_outlet = user.outlet
    gaps = _compute_gaps(cfg, gap_outlet) if gap_outlet else []

    return Response({
        "total_batches": agg["total"],
        "pending_count": agg["pending"],
        "missing_dates_count": len(gaps),
        "latest": batch_summary(latest) if latest else None,
    })


def handle_detail(request, cfg: TypeConfig, batch_id: int) -> Response:
    batch = get_object_or_404(
        cfg.batch_model.objects.select_related("outlet", "uploaded_by", "approved_by"),
        pk=batch_id,
    )
    user = request.user
    if user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and batch.outlet_id != user.outlet_id:
        return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

    page, page_size = _paginate_params(request, DEFAULT_LINE_PAGE_SIZE)
    line_qs = cfg.line_model.objects.filter(batch=batch).order_by("txn_date", "doc_no", "item_code")
    total = line_qs.count()
    offset = (page - 1) * page_size
    lines = line_qs[offset: offset + page_size]

    return Response({
        "batch": batch_summary(batch),
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "lines": [
            {
                "id": l.id,
                "doc_no": l.doc_no,
                "txn_date": str(l.txn_date),
                "item_code": l.item_code,
                "description": l.description,
                "pack_size": l.pack_size,
                "cost_price": float(l.cost_price) if l.cost_price is not None else None,
                "selling_price": float(l.selling_price) if l.selling_price is not None else None,
                "qty": float(l.qty),
                "amount": float(l.amount),
                "user_name": l.user_name,
                "txn_time": l.txn_time,
            }
            for l in lines
        ],
    })


def handle_approve(request, cfg: TypeConfig, batch_id: int) -> Response:
    batch = get_object_or_404(cfg.batch_model, pk=batch_id)
    if batch.approval_status != cfg.batch_model.ApprovalStatus.PENDING:
        return Response({"detail": "Batch is not pending approval."}, status=status.HTTP_400_BAD_REQUEST)
    if not batch.stored_file:
        return Response({"detail": "Stored file missing."}, status=status.HTTP_400_BAD_REQUEST)

    with batch.stored_file.open("rb") as f:
        parsed = parse_damage_xls(f, batch.filename or f"{cfg.type_code}.xls")

    overlaps = list(find_overlapping_batches(cfg, batch.outlet, parsed.date_from, parsed.date_to, exclude_id=batch.id))
    if overlaps:
        return Response(
            {
                "detail": "A newer batch now overlaps this range. Delete it before approving.",
                "overlapping_batches": [batch_summary(b) for b in overlaps],
            },
            status=status.HTTP_409_CONFLICT,
        )

    old_batch_id = batch.id
    with transaction.atomic():
        if batch.stored_file:
            batch.stored_file.delete(save=False)
        batch.delete()
        new_batch = commit_batch(
            cfg, batch.outlet, batch.uploaded_by, parsed, batch.filename,
            cfg.batch_model.ApprovalStatus.APPROVED,
            approved_by=request.user, approved_at=timezone.now(),
        )
        UploadedSheet.objects.filter(
            pipeline=cfg.type_code, batch_id=old_batch_id,
        ).update(
            batch_id=new_batch.id,
            approval_status=UploadedSheet.ApprovalStatus.APPROVED,
        )
    AuditLog.objects.create(
        user=request.user,
        action=f"{cfg.type_code}_upload_approved",
        entity_type=f"{cfg.type_code}_batch",
        entity_id=str(new_batch.id),
        details={"replaced_batch_id": batch_id},
    )
    return Response({"status": "approved", "batch": batch_summary(new_batch)})


def handle_reject(request, cfg: TypeConfig, batch_id: int) -> Response:
    batch = get_object_or_404(cfg.batch_model, pk=batch_id)
    if batch.approval_status != cfg.batch_model.ApprovalStatus.PENDING:
        return Response({"detail": "Batch is not pending approval."}, status=status.HTTP_400_BAD_REQUEST)

    batch.approval_status = cfg.batch_model.ApprovalStatus.REJECTED
    batch.approved_by = request.user
    batch.approved_at = timezone.now()
    batch.status = cfg.batch_model.Status.DELETED
    if batch.stored_file:
        batch.stored_file.delete(save=False)
    batch.save(update_fields=["approval_status", "approved_by", "approved_at", "status", "stored_file"])

    UploadedSheet.objects.filter(
        pipeline=cfg.type_code, batch_id=batch.id,
    ).update(approval_status=UploadedSheet.ApprovalStatus.REJECTED)

    AuditLog.objects.create(
        user=request.user,
        action=f"{cfg.type_code}_upload_rejected",
        entity_type=f"{cfg.type_code}_batch",
        entity_id=str(batch.id),
        details={"reason": request.data.get("reason", "")},
    )
    return Response({"status": "rejected", "batch_id": batch.id})


def _can_delete(user, batch) -> tuple[bool, bool]:
    if user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return True, False
    if user.role != User.Role.MANAGER:
        return False, True
    if batch.outlet_id != user.outlet_id:
        return False, True
    if batch.uploaded_at.date() == date.today():
        return True, False
    return False, True


def handle_deletion_preview(request, cfg: TypeConfig, batch_id: int) -> Response:
    batch = get_object_or_404(cfg.batch_model, pk=batch_id)
    can, admin = _can_delete(request.user, batch)
    row_count = cfg.line_model.objects.filter(batch=batch).count()
    total = cfg.line_model.objects.filter(batch=batch).aggregate(s=Sum("amount"))["s"] or 0
    return Response({
        "batch": batch_summary(batch),
        "row_count": row_count,
        "total_amount": float(total),
        "can_delete": can,
        "requires_admin": admin,
    })


def handle_delete(request, cfg: TypeConfig, batch_id: int) -> Response:
    batch = get_object_or_404(cfg.batch_model, pk=batch_id)
    can, _ = _can_delete(request.user, batch)
    if not can:
        return Response({"detail": "Not permitted to delete this batch."}, status=status.HTTP_403_FORBIDDEN)

    row_count = cfg.line_model.objects.filter(batch=batch).count()
    with transaction.atomic():
        cfg.line_model.objects.filter(batch=batch).delete()
        batch.status = cfg.batch_model.Status.DELETED
        if batch.stored_file:
            batch.stored_file.delete(save=False)
        batch.save(update_fields=["status", "stored_file"])

    AuditLog.objects.create(
        user=request.user,
        action=f"{cfg.type_code}_upload_deleted",
        entity_type=f"{cfg.type_code}_batch",
        entity_id=str(batch.id),
        details={
            "outlet_id": batch.outlet_id,
            "date_from": str(batch.date_from),
            "date_to": str(batch.date_to),
            "rows": row_count,
        },
    )
    return Response({"status": "deleted", "batch_id": batch.id, "rows_removed": row_count})


def handle_overview(request, cfg: TypeConfig) -> Response:
    today = date.today()
    try:
        from_date = date.fromisoformat(request.query_params.get("from_date") or str(today.replace(day=1)))
        to_date = date.fromisoformat(request.query_params.get("to_date") or str(today))
    except ValueError:
        return Response({"detail": "Invalid date."}, status=status.HTTP_400_BAD_REQUEST)

    outlets = Outlet.objects.all().order_by("outlet_name")
    batches = cfg.batch_model.objects.filter(
        status=cfg.batch_model.Status.SUCCESS,
        date_from__lte=to_date,
        date_to__gte=from_date,
    )
    covered_outlets = {b.outlet_id for b in batches}

    rows = [
        {
            "outlet_id": o.id,
            "outlet_name": o.outlet_name,
            "short_code": o.short_code,
            "covered": o.id in covered_outlets,
        }
        for o in outlets
    ]
    return Response({
        "from_date": str(from_date),
        "to_date": str(to_date),
        "outlets": rows,
        "covered_count": sum(1 for r in rows if r["covered"]),
        "missing_count": sum(1 for r in rows if not r["covered"]),
    })
