from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import IsAdmin, IsManager, IsStoreUser
from apps.outlets.models import Outlet
from apps.items.models import Item, PendingItem
from utils.xls_parser import validate_file, parse_xls

from .models import PosSnapshot, UploadLog, AuditLog
from .serializers import UploadLogSerializer, AuditLogSerializer


# ---------------------------------------------------------------------------
# Validate upload (no DB writes)
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsStoreUser])
@parser_classes([MultiPartParser])
def validate_upload(request):
    """
    Parse and validate the XLS file without writing to the database.
    Returns a preview the user must confirm before import.
    """
    file = request.FILES.get("file")
    if not file:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    outlet = user.outlet
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    today = date.today()
    result = validate_file(file, file.name, outlet.outlet_name, outlet.file_location_name)
    parsed = result.pop("_parsed", None)

    # Allow caller to override the date extracted from the XLS
    raw_date = request.data.get("upload_date")
    if raw_date:
        try:
            snapshot_date = date.fromisoformat(raw_date)
            result["preview"]["snapshot_date"] = str(snapshot_date)
        except ValueError:
            return Response({"detail": "Invalid upload_date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
    else:
        snapshot_date = None
        if result["preview"].get("snapshot_date"):
            from datetime import datetime
            try:
                snapshot_date = datetime.strptime(result["preview"]["snapshot_date"], "%Y-%m-%d").date()
            except ValueError:
                pass

    needs_approval = snapshot_date is not None and snapshot_date != today

    # Check duplicate upload for that specific date
    if snapshot_date:
        duplicate = UploadLog.objects.filter(
            outlet=outlet,
            snapshot_date=snapshot_date,
            status=UploadLog.Status.SUCCESS,
        ).exists()
    else:
        duplicate = False

    result["duplicate"] = duplicate
    result["needs_approval"] = needs_approval
    result["outlet_name"] = outlet.outlet_name
    result["today"] = str(today)

    if parsed and result["valid"]:
        # Count matched vs new vs changed items for this outlet
        item_codes = [r.item_code for r in parsed.rows]
        existing_items = {
            item.item_code: item
            for item in Item.objects.filter(outlet=outlet, item_code__in=item_codes)
        }
        new_count = 0
        changed_count = 0
        matched_count = 0
        for row in parsed.rows:
            existing = existing_items.get(row.item_code)
            if existing is None:
                new_count += 1
            else:
                if _has_changes(existing, row):
                    changed_count += 1
                else:
                    matched_count += 1

        result["preview"]["matched"] = matched_count
        result["preview"]["new_items"] = new_count
        result["preview"]["changed_items"] = changed_count

    return Response(result)


# ---------------------------------------------------------------------------
# Confirm upload
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsStoreUser])
@parser_classes([MultiPartParser])
def confirm_upload(request):
    """
    Write pos_snapshots and pending_items to the database.
    If the XLS date is not today, creates a pending approval log instead.
    """
    file = request.FILES.get("file")
    overwrite = request.data.get("overwrite", "false").lower() == "true"
    if not file:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    outlet = user.outlet
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    today = date.today()
    validation = validate_file(file, file.name, outlet.outlet_name, outlet.file_location_name)
    parsed = validation.pop("_parsed", None)

    if not validation["valid"]:
        return Response(
            {"detail": "File validation failed.", "errors": validation["errors"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Allow caller to override the date extracted from the XLS
    raw_date = request.data.get("upload_date")
    if raw_date:
        try:
            snapshot_date = date.fromisoformat(raw_date)
        except ValueError:
            return Response({"detail": "Invalid upload_date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
    else:
        snapshot_date = parsed.snapshot_date

    # Handle duplicate
    existing_log = UploadLog.objects.filter(
        outlet=outlet,
        snapshot_date=snapshot_date,
        status=UploadLog.Status.SUCCESS,
    ).first()

    if existing_log and not overwrite:
        return Response(
            {"detail": "A successful upload already exists for this date. Set overwrite=true to replace."},
            status=status.HTTP_409_CONFLICT,
        )

    # Past-date upload → save file and create pending approval log
    if snapshot_date != today:
        file.seek(0)
        log = UploadLog(
            outlet=outlet,
            snapshot_date=snapshot_date,
            uploaded_by=user,
            status=UploadLog.Status.SUCCESS,
            total_rows=len(parsed.rows),
            matched_rows=0,
            new_items_count=0,
            changed_items_count=0,
            filename=file.name,
            approval_status=UploadLog.ApprovalStatus.PENDING,
        )
        log.stored_file.save(file.name, file, save=True)

        AuditLog.objects.create(
            user=user,
            action="xls_upload_pending_approval",
            entity_type="upload_log",
            entity_id=str(log.id),
            details={
                "outlet": outlet.outlet_name,
                "date": str(snapshot_date),
                "filename": file.name,
            },
        )

        return Response(
            {
                "detail": "Upload submitted for admin approval.",
                "needs_approval": True,
                "upload_log_id": log.id,
                "snapshot_date": str(snapshot_date),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    # Same-day upload → process immediately
    return _process_upload(parsed, outlet, user, snapshot_date, overwrite, file.name)


# ---------------------------------------------------------------------------
# Admin: list pending approvals
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdmin])
def pending_approvals(request):
    """List all upload logs awaiting admin approval."""
    logs = UploadLog.objects.filter(
        approval_status=UploadLog.ApprovalStatus.PENDING
    ).select_related("outlet", "uploaded_by").order_by("-uploaded_at")
    serializer = UploadLogSerializer(logs, many=True)
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Admin: approve or reject a pending upload
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAdmin])
def approve_upload(request, log_id):
    """Approve a pending upload — processes the stored file."""
    try:
        log = UploadLog.objects.get(pk=log_id, approval_status=UploadLog.ApprovalStatus.PENDING)
    except UploadLog.DoesNotExist:
        return Response({"detail": "Pending upload not found."}, status=status.HTTP_404_NOT_FOUND)

    if not log.stored_file:
        return Response({"detail": "No stored file found for this log."}, status=status.HTTP_400_BAD_REQUEST)

    # Re-parse the stored file
    log.stored_file.open("rb")
    parsed = parse_xls(log.stored_file, log.filename)
    log.stored_file.close()

    if not parsed.rows:
        return Response({"detail": "Could not parse stored file."}, status=status.HTTP_400_BAD_REQUEST)

    outlet = log.outlet

    # Remove existing snapshots for this date if any (overwrite semantics)
    PosSnapshot.objects.filter(outlet=outlet, snapshot_date=log.snapshot_date).delete()

    result = _process_upload(
        parsed, outlet, log.uploaded_by, log.snapshot_date, overwrite=True, filename=log.filename,
        existing_log=log,
    )

    # Mark log approved
    log.approval_status = UploadLog.ApprovalStatus.APPROVED
    log.approved_by = request.user
    log.approved_at = timezone.now()
    log.stored_file.delete(save=False)
    log.save(update_fields=["approval_status", "approved_by", "approved_at", "stored_file"])

    AuditLog.objects.create(
        user=request.user,
        action="approve_upload",
        entity_type="upload_log",
        entity_id=str(log.id),
        details={"outlet": outlet.outlet_name, "date": str(log.snapshot_date)},
    )

    return result


@api_view(["POST"])
@permission_classes([IsAdmin])
def reject_upload(request, log_id):
    """Reject and discard a pending upload."""
    try:
        log = UploadLog.objects.get(pk=log_id, approval_status=UploadLog.ApprovalStatus.PENDING)
    except UploadLog.DoesNotExist:
        return Response({"detail": "Pending upload not found."}, status=status.HTTP_404_NOT_FOUND)

    if log.stored_file:
        log.stored_file.delete(save=False)

    log.approval_status = UploadLog.ApprovalStatus.REJECTED
    log.approved_by = request.user
    log.approved_at = timezone.now()
    log.save(update_fields=["approval_status", "approved_by", "approved_at", "stored_file"])

    AuditLog.objects.create(
        user=request.user,
        action="reject_upload",
        entity_type="upload_log",
        entity_id=str(log.id),
        details={"outlet": log.outlet.outlet_name, "date": str(log.snapshot_date)},
    )

    return Response({"detail": "Upload rejected."})


# ---------------------------------------------------------------------------
# Delete an upload (manager or admin)
# ---------------------------------------------------------------------------
@api_view(["DELETE"])
@permission_classes([IsManager])
def delete_upload(request, log_id):
    """
    Delete an upload log and its associated pos_snapshots.
    Manager can only delete own outlet. Admin can delete any.
    """
    try:
        log = UploadLog.objects.get(pk=log_id)
    except UploadLog.DoesNotExist:
        return Response({"detail": "Upload log not found."}, status=status.HTTP_404_NOT_FOUND)

    # Managers restricted to own outlet
    if request.user.role != "admin" and log.outlet != request.user.outlet:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    if log.status == UploadLog.Status.DELETED:
        return Response({"detail": "Already deleted."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        deleted_count, _ = PosSnapshot.objects.filter(
            outlet=log.outlet,
            snapshot_date=log.snapshot_date,
        ).delete()

        log.status = UploadLog.Status.DELETED
        log.save(update_fields=["status"])

        AuditLog.objects.create(
            user=request.user,
            action="delete_upload",
            entity_type="upload_log",
            entity_id=str(log.id),
            details={
                "outlet": log.outlet.outlet_name,
                "date": str(log.snapshot_date),
                "snapshots_deleted": deleted_count,
            },
        )

    return Response({"detail": "Upload deleted.", "snapshots_deleted": deleted_count})


# ---------------------------------------------------------------------------
# Upload history
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsStoreUser])
def upload_history(request):
    """Last 30 upload logs for the user's outlet, with gap detection.
    Admins may pass ?outlet=<id> to view any outlet's history.
    """
    if request.user.role == User.Role.ADMIN and request.query_params.get("outlet"):
        from django.shortcuts import get_object_or_404
        outlet = get_object_or_404(Outlet, pk=request.query_params["outlet"])
    else:
        outlet = request.user.outlet
    if not outlet:
        return Response([])

    logs = UploadLog.objects.filter(
        outlet=outlet
    ).exclude(status=UploadLog.Status.DELETED).order_by("-snapshot_date")[:30]
    serializer = UploadLogSerializer(logs, many=True)

    uploaded_dates = {log.snapshot_date for log in logs if log.status == UploadLog.Status.SUCCESS}
    today = date.today()
    missing = []
    for i in range(1, 31):
        d = today - timedelta(days=i)
        if d.weekday() < 6 and d not in uploaded_dates:
            missing.append(str(d))

    return Response({"logs": serializer.data, "missing_dates": missing})


# ---------------------------------------------------------------------------
# All-outlets upload overview (manager/admin)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsManager])
def all_outlets_overview(request):
    """
    Returns today's (or a given date's) upload status for every outlet.
    Query param: ?date=YYYY-MM-DD (default: today)
    """
    from datetime import datetime
    raw_date = request.query_params.get("date", "")
    try:
        target_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
    except ValueError:
        target_date = date.today()

    outlets = Outlet.objects.all().order_by("outlet_name")

    # Fetch all successful upload logs for that date in one query
    logs_by_outlet = {
        log.outlet_id: log
        for log in UploadLog.objects.filter(
            snapshot_date=target_date,
            status=UploadLog.Status.SUCCESS,
        ).select_related("uploaded_by").order_by("-uploaded_at")
    }

    results = []
    for outlet in outlets:
        log = logs_by_outlet.get(outlet.id)
        results.append({
            "outlet_id": outlet.id,
            "outlet_name": outlet.outlet_name,
            "short_code": outlet.short_code,
            "uploaded": log is not None,
            "uploaded_at": log.uploaded_at.isoformat() if log else None,
            "uploaded_by": log.uploaded_by.username if log else None,
            "total_rows": log.total_rows if log else None,
            "approval_status": log.approval_status if log else None,
        })

    uploaded_count = sum(1 for r in results if r["uploaded"])
    return Response({
        "date": str(target_date),
        "total_outlets": len(results),
        "uploaded_count": uploaded_count,
        "missing_count": len(results) - uploaded_count,
        "outlets": results,
    })


# ---------------------------------------------------------------------------
# Audit log (admin only)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdmin])
def audit_log_list(request):
    """
    Paginated audit log. Filters: ?entity_type=, ?user=, ?from_date=, ?to_date=
    """
    from datetime import datetime
    qs = AuditLog.objects.select_related("user").order_by("-created_at")

    entity_type = request.query_params.get("entity_type")
    if entity_type:
        qs = qs.filter(entity_type=entity_type)

    username = request.query_params.get("user")
    if username:
        qs = qs.filter(user__username__icontains=username)

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

    # Simple manual pagination
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        page = 1
    page_size = 50
    offset = (page - 1) * page_size
    total = qs.count()
    records = qs[offset: offset + page_size]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": AuditLogSerializer(records, many=True).data,
    })


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _has_changes(item: Item, row) -> bool:
    """Return True if any field in the XLS row differs from the stored Item."""
    if item.item_name != row.item_name:
        return True
    if row.cost_price is not None and item.category != row.category:
        return True
    return False


def _build_changed_fields(item: Item, row) -> dict:
    """Return a dict of {field: {old, new}} for changed fields."""
    changes = {}
    if item.item_name != row.item_name:
        changes["item_name"] = {"old": item.item_name, "new": row.item_name}
    if row.category and item.category != row.category:
        changes["category"] = {"old": item.category, "new": row.category}
    if row.cost_price is not None:
        old_cost = float(item.cost_price) if hasattr(item, "cost_price") and item.cost_price else None
        if old_cost != row.cost_price:
            changes["cost_price"] = {"old": old_cost, "new": row.cost_price}
    if row.selling_price is not None:
        old_sell = float(item.selling_price) if hasattr(item, "selling_price") and item.selling_price else None
        if old_sell != row.selling_price:
            changes["selling_price"] = {"old": old_sell, "new": row.selling_price}
    return changes


def _process_upload(parsed, outlet, user, snapshot_date, overwrite, filename, existing_log=None):
    """Write pos_snapshots + pending_items to DB. Returns a DRF Response."""
    with transaction.atomic():
        if overwrite:
            PosSnapshot.objects.filter(outlet=outlet, snapshot_date=snapshot_date).delete()

        matched = 0
        new_items = 0
        changed_items = 0
        snapshot_list = []

        # Pre-fetch all known items for this outlet in one query
        item_codes = [r.item_code for r in parsed.rows]
        existing_map = {
            item.item_code: item
            for item in Item.objects.filter(outlet=outlet, item_code__in=item_codes)
        }

        for row in parsed.rows:
            item = existing_map.get(row.item_code)

            if item is None:
                # Brand-new item for this outlet
                item = Item.objects.create(
                    outlet=outlet,
                    item_code=row.item_code,
                    item_name=row.item_name,
                    category=row.category,
                    status=Item.Status.PENDING_BARCODE,
                )
                PendingItem.objects.get_or_create(
                    item_code=row.item_code,
                    first_seen_outlet=outlet,
                    change_type=PendingItem.ChangeType.NEW_CODE,
                    defaults={
                        "item_name": row.item_name,
                        "item": item,
                    },
                )
                new_items += 1
            else:
                changes = _build_changed_fields(item, row)
                if changes:
                    # Data changed — flag for manager review (only if no open request exists)
                    open_request = PendingItem.objects.filter(
                        item_code=row.item_code,
                        first_seen_outlet=outlet,
                        change_type=PendingItem.ChangeType.DATA_CHANGED,
                        status=PendingItem.Status.PENDING,
                    ).first()
                    if not open_request:
                        PendingItem.objects.create(
                            item_code=row.item_code,
                            item_name=row.item_name,
                            first_seen_outlet=outlet,
                            change_type=PendingItem.ChangeType.DATA_CHANGED,
                            changed_fields=changes,
                            item=item,
                        )
                    changed_items += 1
                else:
                    matched += 1

            snapshot_list.append(
                PosSnapshot(
                    outlet=outlet,
                    item=item,
                    snapshot_date=snapshot_date,
                    pos_quantity=row.pos_quantity,
                    cost_price=row.cost_price,
                    selling_price=row.selling_price,
                    uploaded_by=user,
                )
            )

        PosSnapshot.objects.bulk_create(
            snapshot_list,
            update_conflicts=True,
            unique_fields=["outlet", "item", "snapshot_date"],
            update_fields=["pos_quantity", "cost_price", "selling_price", "uploaded_by", "uploaded_at"],
        )

        if existing_log:
            existing_log.matched_rows = matched
            existing_log.new_items_count = new_items
            existing_log.changed_items_count = changed_items
            existing_log.total_rows = len(parsed.rows)
            existing_log.save(update_fields=["matched_rows", "new_items_count", "changed_items_count", "total_rows"])
            log = existing_log
        else:
            log = UploadLog.objects.create(
                outlet=outlet,
                snapshot_date=snapshot_date,
                uploaded_by=user,
                status=UploadLog.Status.SUCCESS,
                total_rows=len(parsed.rows),
                matched_rows=matched,
                new_items_count=new_items,
                changed_items_count=changed_items,
                filename=filename,
                approval_status=UploadLog.ApprovalStatus.AUTO,
            )

        AuditLog.objects.create(
            user=user,
            action="xls_upload",
            entity_type="upload_log",
            entity_id=str(log.id),
            details={
                "outlet": outlet.outlet_name,
                "date": str(snapshot_date),
                "total": len(parsed.rows),
                "matched": matched,
                "new_items": new_items,
                "changed_items": changed_items,
                "filename": filename,
            },
        )

    return Response(
        {
            "detail": "Upload successful.",
            "total_rows": len(parsed.rows),
            "matched": matched,
            "new_items": new_items,
            "changed_items": changed_items,
            "upload_log_id": log.id,
        },
        status=status.HTTP_201_CREATED,
    )
