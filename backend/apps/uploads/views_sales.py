"""
Sales (Bill Listing) upload pipeline. Similar shape to the damage/office/GRN
pipelines but with a Sales-specific line schema (invoice, cashier, unit_price,
discount). Shares pagination + gap-detection helpers from views_txn17 to stay
DRY — only the type-specific parts (commit, line serializer) are inlined.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import IsStoreUser, IsAdmin, IsManager
from apps.outlets.models import Outlet
from utils.sales_parser import parse_sales_xls, validate_sales_file

from .models import SalesUploadBatch, SalesLine, AuditLog, UploadedSheet
from .approval_logic import decide_range
from .sheet_recorder import record_uploaded_sheet
from .pipeline_registry import SALES_COLUMNS
from .views_txn17 import (
    _paginate_params, _compute_gaps,
    DEFAULT_BATCH_PAGE_SIZE, DEFAULT_LINE_PAGE_SIZE,
)


TYPE_CODE = "sales"


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #
def _resolve_outlet(request):
    user = request.user
    outlet_id = request.data.get("outlet_id") or request.query_params.get("outlet_id")
    if outlet_id and user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return get_object_or_404(Outlet, pk=outlet_id)
    return user.outlet


def _batch_summary(b: SalesUploadBatch) -> dict:
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


def _scope_batches(request):
    user = request.user
    qs = SalesUploadBatch.objects.select_related("outlet", "uploaded_by", "approved_by")
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
        qs = qs.exclude(status=SalesUploadBatch.Status.DELETED)
    return qs


def _find_overlapping(outlet, date_from, date_to, exclude_id=None):
    qs = SalesUploadBatch.objects.filter(
        outlet=outlet,
        status=SalesUploadBatch.Status.SUCCESS,
        date_from__lte=date_to,
        date_to__gte=date_from,
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.order_by("-uploaded_at")


def _commit_batch(outlet, user, parsed, filename, approval_status, approved_by=None, approved_at=None):
    with transaction.atomic():
        batch = SalesUploadBatch.objects.create(
            outlet=outlet,
            date_from=parsed.date_from,
            date_to=parsed.date_to,
            uploaded_by=user,
            status=SalesUploadBatch.Status.SUCCESS,
            total_rows=len(parsed.rows),
            total_amount=Decimal(str(round(sum(r.amount for r in parsed.rows), 2))),
            filename=filename[:255],
            approval_status=approval_status,
            approved_by=approved_by,
            approved_at=approved_at,
        )
        lines = [
            SalesLine(
                batch=batch,
                outlet=outlet,
                invoice_no=r.invoice_no,
                txn_date=r.txn_date,
                txn_time=r.txn_time,
                item_code=r.item_code,
                description=r.description,
                cust_code=r.cust_code,
                cost_price=None if r.cost_price is None else Decimal(str(r.cost_price)),
                unit_price=None if r.unit_price is None else Decimal(str(r.unit_price)),
                qty=Decimal(str(r.qty)),
                discount=Decimal(str(r.discount)),
                amount=Decimal(str(r.amount)),
                cashier=r.cashier,
            )
            for r in parsed.rows
        ]
        # Sales is high-volume; bigger batch size reduces round trips.
        SalesLine.objects.bulk_create(lines, batch_size=1000)
        AuditLog.objects.create(
            user=user,
            action="sales_upload",
            entity_type="sales_batch",
            entity_id=str(batch.id),
            details={
                "outlet_id": outlet.id,
                "date_from": str(parsed.date_from),
                "date_to": str(parsed.date_to),
                "rows": len(parsed.rows),
            },
        )
    return batch


def _line_dict(l):
    return {
        "id": l.id,
        "invoice_no": l.invoice_no,
        "txn_date": str(l.txn_date),
        "txn_time": l.txn_time,
        "item_code": l.item_code,
        "description": l.description,
        "cust_code": l.cust_code,
        "cost_price": float(l.cost_price) if l.cost_price is not None else None,
        "unit_price": float(l.unit_price) if l.unit_price is not None else None,
        "qty": float(l.qty),
        "discount": float(l.discount),
        "amount": float(l.amount),
        "cashier": l.cashier,
    }


# --------------------------------------------------------------------------- #
# Endpoints                                                                   #
# --------------------------------------------------------------------------- #
@api_view(["POST"])
@permission_classes([IsManager])
@parser_classes([MultiPartParser])
def sales_validate(request):
    file = request.FILES.get("file")
    if not file:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    result = validate_sales_file(file, file.name)
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
        return Response({"detail": "Invalid date format."}, status=status.HTTP_400_BAD_REQUEST)

    result["outlet_id"] = outlet.id
    result["outlet_name"] = outlet.outlet_name
    result["today"] = str(date.today())
    overlaps = []
    if parsed and parsed.date_from and parsed.date_to:
        overlaps = [_batch_summary(b) for b in _find_overlapping(outlet, parsed.date_from, parsed.date_to)]
    result["overlapping_batches"] = overlaps
    result["has_overlap"] = bool(overlaps)
    if parsed and parsed.date_from and parsed.date_to:
        decision = decide_range(request.user, outlet, parsed.date_from, parsed.date_to, SalesUploadBatch)
        result["needs_approval"] = decision.needs_approval
        result["approval_reasons"] = [decision.reason] if decision.reason else []
    else:
        result["needs_approval"] = False
        result["approval_reasons"] = []
    return Response(result)


@api_view(["POST"])
@permission_classes([IsManager])
@parser_classes([MultiPartParser])
def sales_confirm(request):
    file = request.FILES.get("file")
    if not file:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    validation = validate_sales_file(file, file.name)
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
        return Response({"detail": "Invalid date format."}, status=status.HTTP_400_BAD_REQUEST)

    replace_overlapping = str(request.data.get("replace_overlapping", "")).lower() == "true"
    overlapping = list(_find_overlapping(outlet, parsed.date_from, parsed.date_to))
    if overlapping and not replace_overlapping:
        return Response(
            {
                "detail": "Overlapping batches exist. Set replace_overlapping=true to replace them.",
                "overlapping_batches": [_batch_summary(b) for b in overlapping],
            },
            status=status.HTTP_409_CONFLICT,
        )

    if overlapping and replace_overlapping:
        with transaction.atomic():
            for old_batch in overlapping:
                SalesLine.objects.filter(batch=old_batch).delete()
                UploadedSheet.objects.filter(pipeline="sales", batch_id=old_batch.id).delete()
                old_batch.status = SalesUploadBatch.Status.DELETED
                old_batch.save(update_fields=["status"])

    decision = decide_range(request.user, outlet, parsed.date_from, parsed.date_to, SalesUploadBatch)
    if decision.needs_approval:
        batch = SalesUploadBatch.objects.create(
            outlet=outlet,
            date_from=parsed.date_from,
            date_to=parsed.date_to,
            uploaded_by=request.user,
            status=SalesUploadBatch.Status.SUCCESS,
            total_rows=len(parsed.rows),
            total_amount=Decimal(str(round(sum(r.amount for r in parsed.rows), 2))),
            filename=file.name[:255],
            approval_status=SalesUploadBatch.ApprovalStatus.PENDING,
            stored_file=file,
        )
        record_uploaded_sheet(
            pipeline=UploadedSheet.Pipeline.SALES,
            batch_id=batch.id,
            outlet=outlet,
            business_date=parsed.date_from,
            business_date_to=parsed.date_to,
            uploaded_by=request.user,
            filename=file.name,
            row_count=len(parsed.rows),
            columns=SALES_COLUMNS,
            approval_status=UploadedSheet.ApprovalStatus.PENDING,
            approval_reason=decision.reason,
        )
        AuditLog.objects.create(
            user=request.user, action="sales_upload_pending",
            entity_type="sales_batch", entity_id=str(batch.id),
            details={"outlet_id": outlet.id, "date_from": str(parsed.date_from), "date_to": str(parsed.date_to), "rows": len(parsed.rows), "reason": decision.reason},
        )
        return Response({"status": "pending_approval", "batch": _batch_summary(batch)}, status=status.HTTP_202_ACCEPTED)

    batch = _commit_batch(outlet, request.user, parsed, file.name, SalesUploadBatch.ApprovalStatus.AUTO)
    record_uploaded_sheet(
        pipeline=UploadedSheet.Pipeline.SALES,
        batch_id=batch.id,
        outlet=outlet,
        business_date=parsed.date_from,
        business_date_to=parsed.date_to,
        uploaded_by=request.user,
        filename=file.name,
        row_count=len(parsed.rows),
        columns=SALES_COLUMNS,
        approval_status=UploadedSheet.ApprovalStatus.AUTO,
    )
    return Response({"status": "committed", "batch": _batch_summary(batch)})


@api_view(["GET"])
@permission_classes([IsStoreUser])
def sales_batches(request):
    user = request.user
    page, page_size = _paginate_params(request, DEFAULT_BATCH_PAGE_SIZE)
    qs = _scope_batches(request).order_by("-uploaded_at")
    total = qs.count()
    offset = (page - 1) * page_size
    batches = [_batch_summary(b) for b in qs[offset: offset + page_size]]

    missing = []
    if page == 1:
        outlet_id = request.query_params.get("outlet_id")
        gap_outlet = None
        if user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and outlet_id:
            gap_outlet = Outlet.objects.filter(pk=outlet_id).first()
        elif user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            gap_outlet = user.outlet
        # Need a pseudo-cfg shape for _compute_gaps — build it inline.
        class _Cfg:
            batch_model = SalesUploadBatch
        missing = _compute_gaps(_Cfg, gap_outlet)[-30:]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "batches": batches,
        "missing_dates": missing,
    })


@api_view(["GET"])
@permission_classes([IsStoreUser])
def sales_stats(request):
    user = request.user
    qs = _scope_batches(request)
    agg = qs.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(approval_status=SalesUploadBatch.ApprovalStatus.PENDING)),
    )
    latest = qs.order_by("-uploaded_at").first()

    outlet_id = request.query_params.get("outlet_id")
    gap_outlet = None
    if user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and outlet_id:
        gap_outlet = Outlet.objects.filter(pk=outlet_id).first()
    elif user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        gap_outlet = user.outlet

    class _Cfg:
        batch_model = SalesUploadBatch
    gaps = _compute_gaps(_Cfg, gap_outlet) if gap_outlet else []

    return Response({
        "total_batches": agg["total"],
        "pending_count": agg["pending"],
        "missing_dates_count": len(gaps),
        "latest": _batch_summary(latest) if latest else None,
    })


@api_view(["GET"])
@permission_classes([IsStoreUser])
def sales_batch_detail(request, batch_id: int):
    batch = get_object_or_404(
        SalesUploadBatch.objects.select_related("outlet", "uploaded_by", "approved_by"),
        pk=batch_id,
    )
    user = request.user
    if user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and batch.outlet_id != user.outlet_id:
        return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

    page, page_size = _paginate_params(request, DEFAULT_LINE_PAGE_SIZE)
    line_qs = SalesLine.objects.filter(batch=batch).order_by("txn_date", "invoice_no", "item_code")
    total = line_qs.count()
    offset = (page - 1) * page_size
    lines = line_qs[offset: offset + page_size]

    return Response({
        "batch": _batch_summary(batch),
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "lines": [_line_dict(l) for l in lines],
    })


@api_view(["POST"])
@permission_classes([IsAdmin])
def sales_approve(request, batch_id: int):
    batch = get_object_or_404(SalesUploadBatch, pk=batch_id)
    if batch.approval_status != SalesUploadBatch.ApprovalStatus.PENDING:
        return Response({"detail": "Batch is not pending approval."}, status=status.HTTP_400_BAD_REQUEST)
    if not batch.stored_file:
        return Response({"detail": "Stored file missing."}, status=status.HTTP_400_BAD_REQUEST)

    with batch.stored_file.open("rb") as f:
        parsed = parse_sales_xls(f, batch.filename or "sales.xls")

    overlaps = list(_find_overlapping(batch.outlet, parsed.date_from, parsed.date_to, exclude_id=batch.id))
    if overlaps:
        return Response(
            {
                "detail": "A newer batch now overlaps this range. Delete it before approving.",
                "overlapping_batches": [_batch_summary(b) for b in overlaps],
            },
            status=status.HTTP_409_CONFLICT,
        )

    old_batch_id = batch.id
    with transaction.atomic():
        if batch.stored_file:
            batch.stored_file.delete(save=False)
        batch.delete()
        new_batch = _commit_batch(
            batch.outlet, batch.uploaded_by, parsed, batch.filename,
            SalesUploadBatch.ApprovalStatus.APPROVED,
            approved_by=request.user, approved_at=timezone.now(),
        )
        UploadedSheet.objects.filter(
            pipeline=UploadedSheet.Pipeline.SALES, batch_id=old_batch_id,
        ).update(batch_id=new_batch.id, approval_status=UploadedSheet.ApprovalStatus.APPROVED)
    AuditLog.objects.create(
        user=request.user, action="sales_upload_approved",
        entity_type="sales_batch", entity_id=str(new_batch.id),
        details={"replaced_batch_id": batch_id},
    )
    return Response({"status": "approved", "batch": _batch_summary(new_batch)})


@api_view(["POST"])
@permission_classes([IsAdmin])
def sales_reject(request, batch_id: int):
    batch = get_object_or_404(SalesUploadBatch, pk=batch_id)
    if batch.approval_status != SalesUploadBatch.ApprovalStatus.PENDING:
        return Response({"detail": "Batch is not pending approval."}, status=status.HTTP_400_BAD_REQUEST)

    batch.approval_status = SalesUploadBatch.ApprovalStatus.REJECTED
    batch.approved_by = request.user
    batch.approved_at = timezone.now()
    batch.status = SalesUploadBatch.Status.DELETED
    if batch.stored_file:
        batch.stored_file.delete(save=False)
    batch.save(update_fields=["approval_status", "approved_by", "approved_at", "status", "stored_file"])

    UploadedSheet.objects.filter(
        pipeline=UploadedSheet.Pipeline.SALES, batch_id=batch.id,
    ).update(approval_status=UploadedSheet.ApprovalStatus.REJECTED)

    AuditLog.objects.create(
        user=request.user, action="sales_upload_rejected",
        entity_type="sales_batch", entity_id=str(batch.id),
        details={"reason": request.data.get("reason", "")},
    )
    return Response({"status": "rejected", "batch_id": batch.id})


def _can_delete(user, batch):
    if user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return True, False
    if user.role != User.Role.MANAGER:
        return False, True
    if batch.outlet_id != user.outlet_id:
        return False, True
    if batch.uploaded_at.date() == date.today():
        return True, False
    return False, True


@api_view(["GET"])
@permission_classes([IsStoreUser])
def sales_deletion_preview(request, batch_id: int):
    batch = get_object_or_404(SalesUploadBatch, pk=batch_id)
    can, admin = _can_delete(request.user, batch)
    row_count = SalesLine.objects.filter(batch=batch).count()
    total = SalesLine.objects.filter(batch=batch).aggregate(s=Sum("amount"))["s"] or 0
    return Response({
        "batch": _batch_summary(batch),
        "row_count": row_count,
        "total_amount": float(total),
        "can_delete": can,
        "requires_admin": admin,
    })


@api_view(["DELETE"])
@permission_classes([IsStoreUser])
def sales_delete(request, batch_id: int):
    batch = get_object_or_404(SalesUploadBatch, pk=batch_id)
    can, _ = _can_delete(request.user, batch)
    if not can:
        return Response({"detail": "Not permitted to delete this batch."}, status=status.HTTP_403_FORBIDDEN)

    row_count = SalesLine.objects.filter(batch=batch).count()
    with transaction.atomic():
        # Delete in chunks so we don't hold a huge transaction for a
        # 300k-row batch. The batch FK cascades, but explicit chunking keeps
        # memory flat.
        SalesLine.objects.filter(batch=batch).delete()
        batch.status = SalesUploadBatch.Status.DELETED
        if batch.stored_file:
            batch.stored_file.delete(save=False)
        batch.save(update_fields=["status", "stored_file"])

    AuditLog.objects.create(
        user=request.user, action="sales_upload_deleted",
        entity_type="sales_batch", entity_id=str(batch.id),
        details={
            "outlet_id": batch.outlet_id,
            "date_from": str(batch.date_from),
            "date_to": str(batch.date_to),
            "rows": row_count,
        },
    )
    return Response({"status": "deleted", "batch_id": batch.id, "rows_removed": row_count})


@api_view(["GET"])
@permission_classes([IsManager])
def sales_overview(request):
    today = date.today()
    try:
        from_date = date.fromisoformat(request.query_params.get("from_date") or str(today.replace(day=1)))
        to_date = date.fromisoformat(request.query_params.get("to_date") or str(today))
    except ValueError:
        return Response({"detail": "Invalid date."}, status=status.HTTP_400_BAD_REQUEST)

    outlets = Outlet.objects.all().order_by("outlet_name")
    batches = SalesUploadBatch.objects.filter(
        status=SalesUploadBatch.Status.SUCCESS,
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
