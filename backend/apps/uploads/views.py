from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
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


def _outlet_mismatch(parsed_outlet_name, target_outlet):
    """
    Return a dict describing an outlet mismatch if the file header's outlet
    name doesn't line up with the target outlet. None when no mismatch is
    detectable (missing header or clean match).
    """
    if not parsed_outlet_name or not target_outlet:
        return None
    parsed_norm = parsed_outlet_name.strip().upper()
    candidates = [
        (target_outlet.outlet_name or "").strip().upper(),
        (target_outlet.short_code or "").strip().upper(),
        (target_outlet.location_code or "").strip().upper(),
        (target_outlet.file_location_name or "").strip().upper(),
    ]
    candidates = [c for c in candidates if c]
    if any(c == parsed_norm or c in parsed_norm or parsed_norm in c for c in candidates):
        return None
    return {
        "file_outlet": parsed_outlet_name,
        "target_outlet": target_outlet.outlet_name,
    }


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
    outlet_id = request.data.get("outlet_id")
    if outlet_id and user.role == User.Role.ADMIN:
        from django.shortcuts import get_object_or_404
        outlet = get_object_or_404(Outlet, pk=outlet_id)
    else:
        outlet = user.outlet
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    today = date.today()
    result = validate_file(file, file.name)
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

    # Check duplicate upload for that specific date
    if snapshot_date:
        duplicate = UploadLog.objects.filter(
            outlet=outlet,
            snapshot_date=snapshot_date,
            status=UploadLog.Status.SUCCESS,
        ).exists()
    else:
        duplicate = False

    # Outlet mismatch check — the file header's outlet name vs the target outlet
    parsed_outlet_name = result["preview"].get("outlet_name") or ""
    mismatch = _outlet_mismatch(parsed_outlet_name, outlet)

    result["duplicate"] = duplicate
    result["outlet_name"] = outlet.outlet_name
    result["today"] = str(today)
    result["outlet_mismatch"] = mismatch

    threshold = getattr(settings, "NEW_ITEMS_APPROVAL_THRESHOLD", 100)
    new_count = 0
    changed_count = 0
    matched_count = 0

    if parsed and result["valid"]:
        # Count matched vs new vs changed items for this outlet
        item_codes = [r.item_code for r in parsed.rows]
        existing_items = {
            item.item_code: item
            for item in Item.objects.filter(outlet=outlet, item_code__in=item_codes)
        }
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

    past_date = snapshot_date is not None and snapshot_date != today
    exceeds_threshold = new_count >= threshold
    needs_approval = past_date or exceeds_threshold

    approval_reasons = []
    if past_date:
        approval_reasons.append("past_date")
    if exceeds_threshold:
        approval_reasons.append(f"new_items_exceeds_threshold ({new_count} >= {threshold})")

    result["needs_approval"] = needs_approval
    result["approval_reasons"] = approval_reasons
    result["new_items_threshold"] = threshold

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
    override_outlet_mismatch = request.data.get("override_outlet_mismatch", "false").lower() == "true"
    if not file:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    outlet_id = request.data.get("outlet_id")
    if outlet_id and user.role == User.Role.ADMIN:
        from django.shortcuts import get_object_or_404
        outlet = get_object_or_404(Outlet, pk=outlet_id)
    else:
        outlet = user.outlet
    if not outlet:
        return Response({"detail": "User has no outlet assigned."}, status=status.HTTP_400_BAD_REQUEST)

    today = date.today()
    validation = validate_file(file, file.name)
    parsed = validation.pop("_parsed", None)

    if not validation["valid"]:
        return Response(
            {"detail": "File validation failed.", "errors": validation["errors"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Reject wrong-outlet uploads unless the user explicitly overrode the warning
    parsed_outlet_name = validation["preview"].get("outlet_name") or ""
    mismatch = _outlet_mismatch(parsed_outlet_name, outlet)
    if mismatch and not override_outlet_mismatch:
        return Response(
            {
                "detail": (
                    f"The file header lists outlet '{mismatch['file_outlet']}' but you are uploading to "
                    f"'{mismatch['target_outlet']}'. Re-validate and confirm override to proceed."
                ),
                "outlet_mismatch": mismatch,
            },
            status=status.HTTP_409_CONFLICT,
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

    if existing_log:
        if not overwrite:
            return Response(
                {"detail": "A successful upload already exists for this date. Set overwrite=true to replace."},
                status=status.HTTP_409_CONFLICT,
            )
        if user.role != User.Role.ADMIN:
            return Response(
                {"detail": "An upload already exists for today. Contact an admin to override."},
                status=status.HTTP_403_FORBIDDEN,
            )

    # Dry-run count of genuinely new items — drives the threshold-based approval gate.
    threshold = getattr(settings, "NEW_ITEMS_APPROVAL_THRESHOLD", 100)
    parsed_codes = [r.item_code for r in parsed.rows]
    existing_codes = set(
        Item.objects.filter(outlet=outlet, item_code__in=parsed_codes)
        .values_list("item_code", flat=True)
    )
    preview_new_items = sum(1 for c in parsed_codes if c not in existing_codes)
    exceeds_threshold = preview_new_items >= threshold
    past_date = snapshot_date != today

    # Past-date OR threshold-triggered upload → save file and create pending approval log
    if past_date or exceeds_threshold:
        file.seek(0)
        reason = "past_date" if past_date else "new_items_threshold"
        log = UploadLog(
            outlet=outlet,
            snapshot_date=snapshot_date,
            uploaded_by=user,
            status=UploadLog.Status.SUCCESS,
            total_rows=len(parsed.rows),
            matched_rows=0,
            new_items_count=preview_new_items,
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
                "reason": reason,
                "preview_new_items": preview_new_items,
                "threshold": threshold,
            },
        )

        return Response(
            {
                "detail": (
                    "Upload submitted for admin approval "
                    + ("(past date)." if past_date else f"({preview_new_items} new items exceeds threshold {threshold}).")
                ),
                "needs_approval": True,
                "reason": reason,
                "preview_new_items": preview_new_items,
                "upload_log_id": log.id,
                "snapshot_date": str(snapshot_date),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    # Same-day + under threshold → process immediately
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
def _deletion_scope(log):
    """Return the counts + sample codes of rows that `delete_upload` will remove."""
    items_qs = Item.objects.filter(upload_log=log)
    items_count = items_qs.count()
    sample_codes = list(items_qs.values_list("item_code", flat=True)[:20])
    new_item_ids = list(items_qs.values_list("id", flat=True))

    # PendingItems explicitly tagged to this upload (NEW_CODE + DATA_CHANGED).
    pending_tagged = PendingItem.objects.filter(upload_log=log).count()

    # Cascade-orphaned PendingItems that reference the about-to-be-deleted items.
    pending_via_item = PendingItem.objects.filter(
        item_id__in=new_item_ids
    ).exclude(upload_log=log).count() if new_item_ids else 0

    snapshots_for_date = PosSnapshot.objects.filter(
        outlet=log.outlet,
        snapshot_date=log.snapshot_date,
    ).count()

    # Barcodes attached to the items this upload created (cascades on Item delete)
    from apps.items.models import ItemBarcode
    barcodes_cascaded = ItemBarcode.objects.filter(item_id__in=new_item_ids).count() if new_item_ids else 0

    return {
        "items": items_count,
        "sample_codes": sample_codes,
        "pending_items": pending_tagged + pending_via_item,
        "barcodes": barcodes_cascaded,
        "snapshots_same_date": snapshots_for_date,
    }


@api_view(["GET"])
@permission_classes([IsManager])
def deletion_preview(request, log_id):
    """Report exactly what delete_upload(log_id) will remove. Read-only."""
    try:
        log = UploadLog.objects.select_related("outlet").get(pk=log_id)
    except UploadLog.DoesNotExist:
        return Response({"detail": "Upload log not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.user.role != "admin" and log.outlet != request.user.outlet:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    today = date.today()
    is_same_day = log.snapshot_date == today
    can_delete = request.user.role == "admin" or is_same_day

    return Response({
        "log_id": log.id,
        "outlet_name": log.outlet.outlet_name,
        "snapshot_date": str(log.snapshot_date),
        "filename": log.filename,
        "status": log.status,
        "approval_status": log.approval_status,
        "already_deleted": log.status == UploadLog.Status.DELETED,
        "can_delete": can_delete,
        "requires_admin": not is_same_day,
        "scope": _deletion_scope(log),
    })


@api_view(["DELETE"])
@permission_classes([IsManager])
def delete_upload(request, log_id):
    """
    Completely roll back an upload: deletes the PosSnapshots, the Items that
    this upload introduced (cascades to their barcodes, counts, pending
    requests, and snapshots on any date), and any PendingItem rows tagged to
    this upload.

    Permission: managers can delete same-day uploads for their own outlet;
    older uploads require admin.
    """
    try:
        log = UploadLog.objects.select_related("outlet").get(pk=log_id)
    except UploadLog.DoesNotExist:
        return Response({"detail": "Upload log not found."}, status=status.HTTP_404_NOT_FOUND)

    is_admin = request.user.role == "admin"
    if not is_admin and log.outlet != request.user.outlet:
        return Response({"detail": "Not authorized for this outlet."}, status=status.HTTP_403_FORBIDDEN)

    if not is_admin and log.snapshot_date != date.today():
        return Response(
            {"detail": "Only an admin can delete uploads for dates other than today."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if log.status == UploadLog.Status.DELETED:
        return Response({"detail": "Already deleted."}, status=status.HTTP_400_BAD_REQUEST)

    scope = _deletion_scope(log)

    with transaction.atomic():
        # 1. Delete PendingItems tagged to this upload (NEW_CODE + DATA_CHANGED).
        # Doing this *before* deleting Items keeps the FK intact for audit.
        pending_tagged_deleted, _ = PendingItem.objects.filter(upload_log=log).delete()

        # 2. Cascade-delete Items this upload introduced.
        # Deleting an Item cascades to: PosSnapshots (all dates), PendingItems
        # that only referenced it via SET_NULL (which become orphans we sweep below),
        # ItemBarcodes, and StockCounts — via existing on_delete=CASCADE rules.
        items_qs = Item.objects.filter(upload_log=log)
        items_deleted = items_qs.count()
        items_qs.delete()

        # 3. Sweep any PendingItems whose `item` FK was NULL'd by step 2 and
        # which belong to this outlet (stale NEW_CODE rows from SET_NULL cascade).
        pending_orphans_deleted, _ = PendingItem.objects.filter(
            first_seen_outlet=log.outlet,
            item__isnull=True,
            change_type=PendingItem.ChangeType.NEW_CODE,
        ).delete()

        # 4. Remove remaining PosSnapshots for this outlet+date — covers the
        # case where this upload added a snapshot for a pre-existing item.
        snapshots_deleted, _ = PosSnapshot.objects.filter(
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
                "filename": log.filename,
                "items_deleted": items_deleted,
                "pending_deleted": pending_tagged_deleted + pending_orphans_deleted,
                "snapshots_deleted": snapshots_deleted,
                "sample_codes": scope["sample_codes"],
            },
        )

    return Response({
        "detail": "Upload fully rolled back.",
        "items_deleted": items_deleted,
        "pending_deleted": pending_tagged_deleted + pending_orphans_deleted,
        "snapshots_deleted": snapshots_deleted,
        "sample_codes": scope["sample_codes"],
    })


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
    if row.category and item.category != row.category:
        return True
    return False


def _build_changed_fields(item: Item, row) -> dict:
    """Return a dict of {field: {old, new}} for changed fields."""
    changes = {}
    if item.item_name != row.item_name:
        changes["item_name"] = {"old": item.item_name, "new": row.item_name}
    if row.category and item.category != row.category:
        changes["category"] = {"old": item.category, "new": row.category}
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
        new_items_to_tag = []       # populate Item.upload_log FK once the UploadLog row exists
        new_pending_to_tag = []     # same, for PendingItem

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
                    upload_log=existing_log,  # null on same-day auto path; set below
                )
                pending_new, pending_created = PendingItem.objects.get_or_create(
                    item_code=row.item_code,
                    first_seen_outlet=outlet,
                    change_type=PendingItem.ChangeType.NEW_CODE,
                    defaults={
                        "item_name": row.item_name,
                        "item": item,
                        "upload_log": existing_log,
                    },
                )
                if pending_created:
                    new_pending_to_tag.append(pending_new.id)
                new_items += 1
                new_items_to_tag.append(item.id)
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
                        pending_change = PendingItem.objects.create(
                            item_code=row.item_code,
                            item_name=row.item_name,
                            first_seen_outlet=outlet,
                            change_type=PendingItem.ChangeType.DATA_CHANGED,
                            changed_fields=changes,
                            item=item,
                            upload_log=existing_log,
                        )
                        new_pending_to_tag.append(pending_change.id)
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

        # Tag the newly-created Items and PendingItems with this UploadLog so a
        # future delete_upload can cascade-remove everything this upload introduced.
        if new_items_to_tag:
            Item.objects.filter(pk__in=new_items_to_tag).update(upload_log=log)
        if new_pending_to_tag:
            PendingItem.objects.filter(pk__in=new_pending_to_tag).update(upload_log=log)

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


# ---------------------------------------------------------------------------
# Admin: diff preview for a pending upload
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdmin])
def upload_diff(request, log_id):
    """
    Return a diff preview for a PENDING upload without committing anything.
    Parses the stored file and compares against the current item/snapshot data.
    Flags suspicious items where the selling price changed by more than 20%.
    """
    try:
        log = UploadLog.objects.select_related("outlet").get(
            pk=log_id, approval_status=UploadLog.ApprovalStatus.PENDING
        )
    except UploadLog.DoesNotExist:
        return Response({"detail": "Pending upload not found."}, status=status.HTTP_404_NOT_FOUND)

    if not log.stored_file:
        return Response({"detail": "No stored file found."}, status=status.HTTP_400_BAD_REQUEST)

    log.stored_file.open("rb")
    parsed = parse_xls(log.stored_file, log.filename)
    log.stored_file.close()

    if not parsed.rows:
        return Response({"detail": "Could not parse stored file."}, status=status.HTTP_400_BAD_REQUEST)

    outlet = log.outlet
    item_codes = [r.item_code for r in parsed.rows]

    # Fetch existing items for this outlet
    existing_items = {
        item.item_code: item
        for item in Item.objects.filter(outlet=outlet, item_code__in=item_codes)
    }

    # Fetch latest snapshots for existing items (most recent before this upload's date)
    existing_item_ids = [item.id for item in existing_items.values()]
    latest_snaps = {}
    if existing_item_ids:
        for snap in PosSnapshot.objects.filter(
            outlet=outlet,
            item_id__in=existing_item_ids,
            snapshot_date__lt=log.snapshot_date,
        ).order_by("item_id", "-snapshot_date"):
            if snap.item_id not in latest_snaps:
                latest_snaps[snap.item_id] = snap

    matched_items = []
    new_items_list = []
    suspicious_items = []

    price_change_threshold = Decimal("0.20")  # 20%

    for row in parsed.rows:
        existing = existing_items.get(row.item_code)
        if existing is None:
            new_items_list.append({
                "item_code": row.item_code,
                "item_name": row.item_name,
                "cost_price": str(row.cost_price) if row.cost_price is not None else None,
                "selling_price": str(row.selling_price) if row.selling_price is not None else None,
                "pos_quantity": str(row.pos_quantity) if row.pos_quantity is not None else None,
            })
        else:
            snap = latest_snaps.get(existing.id)
            entry = {
                "item_code": row.item_code,
                "item_name": row.item_name,
                "new_selling_price": str(row.selling_price) if row.selling_price is not None else None,
                "new_cost_price": str(row.cost_price) if row.cost_price is not None else None,
                "new_pos_quantity": str(row.pos_quantity) if row.pos_quantity is not None else None,
                "old_selling_price": str(snap.selling_price) if snap and snap.selling_price is not None else None,
                "old_cost_price": str(snap.cost_price) if snap and snap.cost_price is not None else None,
                "old_pos_quantity": str(snap.pos_quantity) if snap and snap.pos_quantity is not None else None,
                "pct_change": None,
                "suspicious": False,
            }

            # Check for suspicious price change
            if snap and snap.selling_price and row.selling_price is not None:
                old = snap.selling_price
                new_val = row.selling_price
                if old > 0:
                    pct = abs(new_val - old) / old
                    entry["pct_change"] = f"{float(pct * 100):.1f}"
                    if pct > price_change_threshold:
                        entry["suspicious"] = True
                        suspicious_items.append(entry)

            matched_items.append(entry)

    return Response({
        "summary": {
            "total": len(parsed.rows),
            "matched": len(matched_items),
            "new_items": len(new_items_list),
            "suspicious": len(suspicious_items),
        },
        "suspicious_items": suspicious_items,
        "new_items": new_items_list,
    })
