import logging
import traceback
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

from .models import PosSnapshot, UploadLog, AuditLog, UploadedSheet
from .serializers import UploadLogSerializer, AuditLogSerializer
from .approval_logic import decide_pos
from .sheet_recorder import record_uploaded_sheet
from .pipeline_registry import POS_COLUMNS

logger = logging.getLogger(__name__)


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
@permission_classes([IsManager])
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

    # Preview uses the same decide_pos rule as the confirm endpoint.
    decision = decide_pos(user, outlet, snapshot_date) if snapshot_date else None
    result["needs_approval"] = bool(decision and decision.needs_approval)
    result["approval_reasons"] = [decision.reason] if decision and decision.reason else []
    result["new_items_threshold"] = threshold

    return Response(result)


# ---------------------------------------------------------------------------
# Confirm upload
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsManager])
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

    # Multi-upload per day is now first-class: each upload becomes a distinct
    # UploadLog batch with its own snapshots, so prior uploads on the same date
    # are preserved (the report uses the snapshot in effect at each count time).

    # Approval decision (manager rules — see approval_logic.decide_pos):
    #   today's date → auto
    #   past date, no approved record → auto
    #   past date, approved record exists → pending admin approval
    parsed_codes = [r.item_code for r in parsed.rows]
    existing_codes = set(
        Item.objects.filter(outlet=outlet, item_code__in=parsed_codes)
        .values_list("item_code", flat=True)
    )
    preview_new_items = sum(1 for c in parsed_codes if c not in existing_codes)

    decision = decide_pos(user, outlet, snapshot_date)
    if decision.needs_approval:
        file.seek(0)
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

        record_uploaded_sheet(
            pipeline=UploadedSheet.Pipeline.POS,
            batch_id=log.id,
            outlet=outlet,
            business_date=snapshot_date,
            business_date_to=None,
            uploaded_by=user,
            filename=file.name,
            row_count=len(parsed.rows),
            columns=POS_COLUMNS,
            approval_status=UploadedSheet.ApprovalStatus.PENDING,
            approval_reason=decision.reason,
        )

        AuditLog.objects.create(
            user=user,
            action="xls_upload_pending_approval",
            entity_type="upload_log",
            entity_id=str(log.id),
            details={
                "outlet": outlet.outlet_name,
                "date": str(snapshot_date),
                "filename": file.name,
                "reason": decision.reason,
                "preview_new_items": preview_new_items,
            },
        )

        return Response(
            {
                "detail": "Upload submitted for admin approval (past date already has an approved record).",
                "needs_approval": True,
                "reason": decision.reason,
                "preview_new_items": preview_new_items,
                "upload_log_id": log.id,
                "snapshot_date": str(snapshot_date),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    # Auto-approve path
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

    try:
        # Re-parse the stored file
        log.stored_file.open("rb")
        try:
            parsed = parse_xls(log.stored_file, log.filename)
        finally:
            log.stored_file.close()

        if not parsed.rows:
            return Response({"detail": "Could not parse stored file."}, status=status.HTTP_400_BAD_REQUEST)

        outlet = log.outlet

        # Approval re-uses the existing UploadLog as the batch; snapshots are
        # tied to it. Other batches on the same date are not affected.
        result = _process_upload(
            parsed, outlet, log.uploaded_by, log.snapshot_date, overwrite=False, filename=log.filename,
            existing_log=log,
        )

        # Mark log approved
        log.approval_status = UploadLog.ApprovalStatus.APPROVED
        log.approved_by = request.user
        log.approved_at = timezone.now()
        try:
            log.stored_file.delete(save=False)
        except Exception:
            logger.warning("approve_upload: failed to delete stored_file for log %s", log.id, exc_info=True)
            log.stored_file = None
        log.save(update_fields=["approval_status", "approved_by", "approved_at", "stored_file"])

        AuditLog.objects.create(
            user=request.user,
            action="approve_upload",
            entity_type="upload_log",
            entity_id=str(log.id),
            details={"outlet": outlet.outlet_name, "date": str(log.snapshot_date)},
        )

        return result
    except Exception as exc:
        logger.exception("approve_upload failed for log %s", log_id)
        return Response(
            {
                "detail": f"Approval failed: {exc.__class__.__name__}: {exc}",
                "trace": traceback.format_exc().splitlines()[-6:],
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


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

    UploadedSheet.objects.filter(
        pipeline=UploadedSheet.Pipeline.POS, batch_id=log.id,
    ).update(approval_status=UploadedSheet.ApprovalStatus.REJECTED)

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
@api_view(["GET"])
@permission_classes([IsAdmin])
def orphan_list(request):
    """
    List Items and PendingItems whose upload_log is NULL or points to a DELETED
    UploadLog. These are legacy/ghost rows that delete_upload couldn't reach.

    Query params:
      outlet      — filter by outlet id (optional)
      from_date   — YYYY-MM-DD, inclusive (uses Item.created_at / PendingItem.created_at)
      to_date     — YYYY-MM-DD, inclusive
      type        — "items" | "pending" | "both" (default both)
    """
    from datetime import datetime
    from django.db.models import Q, Count
    from apps.items.models import ItemBarcode

    outlet_id = request.query_params.get("outlet")
    type_filter = (request.query_params.get("type") or "both").lower()

    def _parse(d):
        try:
            return datetime.strptime(d, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None

    from_date = _parse(request.query_params.get("from_date", ""))
    to_date = _parse(request.query_params.get("to_date", ""))

    # "Orphan" = upload_log NULL OR tied to a DELETED UploadLog
    orphan_filter = Q(upload_log__isnull=True) | Q(upload_log__status=UploadLog.Status.DELETED)

    items_payload = []
    pending_payload = []

    if type_filter in ("items", "both"):
        iqs = Item.objects.filter(orphan_filter).select_related("outlet", "upload_log")
        if outlet_id:
            iqs = iqs.filter(outlet_id=outlet_id)
        if from_date:
            iqs = iqs.filter(created_at__date__gte=from_date)
        if to_date:
            iqs = iqs.filter(created_at__date__lte=to_date)
        iqs = iqs.annotate(
            barcode_count=Count("barcodes", distinct=True),
            snapshot_count=Count("pos_snapshots", distinct=True),
            count_count=Count("stock_counts", distinct=True),
        # Items with an assigned barcode are treated as "real" items someone
        # has curated — never surface them in the purge list.
        ).filter(barcode_count=0).order_by("-created_at")[:500]

        for it in iqs:
            items_payload.append({
                "id": it.id,
                "item_code": it.item_code,
                "item_name": it.item_name,
                "category": it.category,
                "status": it.status,
                "outlet_id": it.outlet_id,
                "outlet_name": it.outlet.outlet_name if it.outlet else "",
                "created_at": it.created_at.isoformat(),
                "barcode_count": it.barcode_count,
                "snapshot_count": it.snapshot_count,
                "count_count": it.count_count,
                "upload_log_id": it.upload_log_id,
                "upload_log_status": it.upload_log.status if it.upload_log else None,
            })

    if type_filter in ("pending", "both"):
        pqs = PendingItem.objects.filter(orphan_filter).select_related(
            "first_seen_outlet", "upload_log", "item",
        )
        if outlet_id:
            pqs = pqs.filter(first_seen_outlet_id=outlet_id)
        if from_date:
            pqs = pqs.filter(created_at__date__gte=from_date)
        if to_date:
            pqs = pqs.filter(created_at__date__lte=to_date)
        # If the pending row's linked item has been given a barcode,
        # someone already processed it — exclude from the purge list.
        pqs = pqs.annotate(
            linked_barcode_count=Count("item__barcodes", distinct=True),
        ).filter(linked_barcode_count=0).order_by("-created_at")[:500]

        for p in pqs:
            pending_payload.append({
                "id": p.id,
                "item_code": p.item_code,
                "item_name": p.item_name,
                "change_type": p.change_type,
                "status": p.status,
                "first_seen_outlet_id": p.first_seen_outlet_id,
                "first_seen_outlet_name": p.first_seen_outlet.outlet_name if p.first_seen_outlet else "",
                "first_seen_date": str(p.first_seen_date) if p.first_seen_date else None,
                "created_at": p.created_at.isoformat(),
                "item_id": p.item_id,
                "item_exists": bool(p.item_id),
                "upload_log_id": p.upload_log_id,
                "upload_log_status": p.upload_log.status if p.upload_log else None,
            })

    return Response({
        "items": items_payload,
        "pending": pending_payload,
        "items_truncated": len(items_payload) >= 500,
        "pending_truncated": len(pending_payload) >= 500,
    })


@api_view(["POST"])
@permission_classes([IsAdmin])
def orphan_purge_all(request):
    """
    Bulk-delete every orphan Item and PendingItem matching an outlet + date range.
    Complementary to orphan_purge(item_ids, pending_ids) — this one operates on
    the filter rather than an explicit id list.

    Body: { "outlet": int (REQUIRED), "from_date": "YYYY-MM-DD", "to_date": "YYYY-MM-DD" }

    Safety rules (same as orphan_list):
    - outlet is required (prevents accidental cross-outlet wipes)
    - only Items with upload_log NULL or DELETED are touched
    - only Items with **no barcodes** are deleted
    - only PendingItems whose linked item has no barcodes are deleted
    """
    from datetime import datetime
    from django.db.models import Q, Count

    outlet_id = request.data.get("outlet")
    if not outlet_id:
        return Response(
            {"detail": "outlet is required. Purging across all outlets is not allowed."},
            status=400,
        )

    def _parse(d):
        try:
            return datetime.strptime(d, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None

    from_date = _parse(request.data.get("from_date", ""))
    to_date = _parse(request.data.get("to_date", ""))

    orphan_filter = Q(upload_log__isnull=True) | Q(upload_log__status=UploadLog.Status.DELETED)

    with transaction.atomic():
        iqs = Item.objects.filter(orphan_filter, outlet_id=outlet_id)
        if from_date:
            iqs = iqs.filter(created_at__date__gte=from_date)
        if to_date:
            iqs = iqs.filter(created_at__date__lte=to_date)
        iqs = iqs.annotate(barcode_count=Count("barcodes", distinct=True)).filter(barcode_count=0)

        sample_items = list(iqs.values_list("id", "item_code")[:20])
        item_ids_to_delete = list(iqs.values_list("id", flat=True))
        items_deleted = len(item_ids_to_delete)

        # Pending rows whose linked item has no barcodes.
        pqs = PendingItem.objects.filter(orphan_filter, first_seen_outlet_id=outlet_id)
        if from_date:
            pqs = pqs.filter(created_at__date__gte=from_date)
        if to_date:
            pqs = pqs.filter(created_at__date__lte=to_date)
        pqs = pqs.annotate(
            linked_barcode_count=Count("item__barcodes", distinct=True),
        ).filter(linked_barcode_count=0)

        sample_pending = list(pqs.values_list("id", "item_code")[:20])
        pending_ids_to_delete = list(pqs.values_list("id", flat=True))
        pending_deleted = len(pending_ids_to_delete)

        # Delete pending first so their item FK stays intact for any audit hooks.
        PendingItem.objects.filter(pk__in=pending_ids_to_delete).delete()
        Item.objects.filter(pk__in=item_ids_to_delete).delete()

        # Sweep any orphan NEW_CODE pending left with NULL item FK by the cascade.
        sweep_qs = PendingItem.objects.filter(
            first_seen_outlet_id=outlet_id,
            item__isnull=True,
            change_type=PendingItem.ChangeType.NEW_CODE,
        )
        sweep_deleted = sweep_qs.count()
        sweep_qs.delete()

        AuditLog.objects.create(
            user=request.user,
            action="orphan_purge_all",
            entity_type="orphan",
            entity_id="",
            details={
                "outlet_id": outlet_id,
                "from_date": str(from_date) if from_date else None,
                "to_date": str(to_date) if to_date else None,
                "items_deleted": items_deleted,
                "pending_deleted": pending_deleted,
                "sweep_deleted": sweep_deleted,
                "sample_item_codes": [i[1] for i in sample_items],
                "sample_pending_codes": [p[1] for p in sample_pending],
            },
        )

    return Response({
        "items_deleted": items_deleted,
        "pending_deleted": pending_deleted,
        "sweep_deleted": sweep_deleted,
        "sample_item_codes": [i[1] for i in sample_items],
        "sample_pending_codes": [p[1] for p in sample_pending],
    })


@api_view(["POST"])
@permission_classes([IsAdmin])
def orphan_purge(request):
    """
    Bulk-delete orphan Items and PendingItems by id. Each id is validated
    server-side — rows that fail the orphan criteria are skipped (not deleted)
    and reported in the response.

    Body: { "item_ids": [int, ...], "pending_ids": [int, ...] }
    """
    from django.db.models import Q

    item_ids = request.data.get("item_ids") or []
    pending_ids = request.data.get("pending_ids") or []
    if not isinstance(item_ids, list) or not isinstance(pending_ids, list):
        return Response({"detail": "item_ids and pending_ids must be arrays."}, status=400)

    orphan_filter = Q(upload_log__isnull=True) | Q(upload_log__status=UploadLog.Status.DELETED)

    with transaction.atomic():
        # Re-validate each item is still an orphan before deleting
        deletable_items = list(
            Item.objects.filter(orphan_filter, pk__in=item_ids).values_list("id", "item_code", "outlet__outlet_name")
        )
        deletable_item_ids = [i[0] for i in deletable_items]
        skipped_items = [i for i in item_ids if i not in deletable_item_ids]

        # Deleting an Item cascades to PosSnapshots, ItemBarcodes, StockCounts
        # and SET_NULL on PendingItem.item (which we also then sweep below).
        items_deleted = len(deletable_item_ids)
        Item.objects.filter(pk__in=deletable_item_ids).delete()

        # Now validate pending ids — after item deletion, some may have item_id nulled.
        deletable_pending = list(
            PendingItem.objects.filter(orphan_filter, pk__in=pending_ids).values_list("id", "item_code")
        )
        deletable_pending_ids = [p[0] for p in deletable_pending]
        skipped_pending = [p for p in pending_ids if p not in deletable_pending_ids]

        pending_deleted = len(deletable_pending_ids)
        PendingItem.objects.filter(pk__in=deletable_pending_ids).delete()

        # Sweep any NEW_CODE pending with NULL item FK that was created by the
        # item cascade above (in case caller didn't pass them explicitly).
        sweep_deleted = 0
        if items_deleted:
            sweep_qs = PendingItem.objects.filter(
                item__isnull=True,
                change_type=PendingItem.ChangeType.NEW_CODE,
            )
            sweep_deleted = sweep_qs.count()
            sweep_qs.delete()

        AuditLog.objects.create(
            user=request.user,
            action="orphan_purge",
            entity_type="orphan",
            entity_id="",
            details={
                "items_deleted": items_deleted,
                "pending_deleted": pending_deleted,
                "sweep_deleted": sweep_deleted,
                "skipped_items": skipped_items,
                "skipped_pending": skipped_pending,
                "sample_item_codes": [i[1] for i in deletable_items[:20]],
                "sample_pending_codes": [p[1] for p in deletable_pending[:20]],
            },
        )

    return Response({
        "items_deleted": items_deleted,
        "pending_deleted": pending_deleted,
        "sweep_deleted": sweep_deleted,
        "skipped_items": skipped_items,
        "skipped_pending": skipped_pending,
    })


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

    # Snapshots that this batch owns (multi-upload per day: only this batch's
    # rows will be removed by delete_upload).
    snapshots_for_date = PosSnapshot.objects.filter(
        upload_batch=log,
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

        # 4. Remove only the PosSnapshots tied to *this* batch. Other batches
        # for the same outlet+date (multi-upload per day) stay intact.
        snapshots_deleted, _ = PosSnapshot.objects.filter(
            upload_batch=log,
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
    Per-outlet operational snapshot for a given date.

    Reports, per outlet:
      - POS upload status for the date (uploaded / missing / pending)
      - Stock count progress for the date (% counted, session status)
      - Counts pending manager approval (this date)
      - Open variance records (cross-session, not date-scoped)
      - Last activity time (most recent count or upload)

    The Admin's Outlets Overview page consumes this directly. Single
    endpoint so the page loads in one round-trip.

    Query param: ?date=YYYY-MM-DD (default: today)
    """
    from datetime import datetime
    from django.db.models import Count, Q, Max
    from apps.items.models import Item
    from apps.dashboard.models import CountSession, StockCount, VarianceRecord

    raw_date = request.query_params.get("date", "")
    try:
        target_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
    except ValueError:
        target_date = date.today()

    outlets = list(Outlet.objects.all().order_by("outlet_name"))
    outlet_ids = [o.id for o in outlets]

    # --- POS upload on target_date ---
    logs_by_outlet = {
        log.outlet_id: log
        for log in UploadLog.objects.filter(
            outlet_id__in=outlet_ids,
            snapshot_date=target_date,
            status=UploadLog.Status.SUCCESS,
        ).select_related("uploaded_by").order_by("-uploaded_at")
    }

    # --- Active item count per outlet (denominator for count %) ---
    item_totals = dict(
        Item.objects.filter(outlet_id__in=outlet_ids, status=Item.Status.ACTIVE)
        .values("outlet_id").annotate(n=Count("id")).values_list("outlet_id", "n")
    )

    # --- Count session for (outlet, target_date) ---
    sessions_by_outlet = {
        s.outlet_id: s
        for s in CountSession.objects.filter(outlet_id__in=outlet_ids, count_date=target_date)
    }

    # --- StockCount aggregates per (outlet, status) for target_date ---
    sc_rows = (
        StockCount.objects
        .filter(outlet_id__in=outlet_ids, count_date=target_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("outlet_id", "approval_status")
        .annotate(entries=Count("id"), distinct_items=Count("item_id", distinct=True))
    )
    sc_summary = {oid: {"submitted": 0, "approved": 0, "items_counted": 0} for oid in outlet_ids}
    # Need distinct items per outlet regardless of status, computed separately:
    distinct_rows = (
        StockCount.objects
        .filter(outlet_id__in=outlet_ids, count_date=target_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("outlet_id").annotate(distinct_items=Count("item_id", distinct=True))
    )
    for r in distinct_rows:
        sc_summary[r["outlet_id"]]["items_counted"] = r["distinct_items"]
    for r in sc_rows:
        oid = r["outlet_id"]
        if r["approval_status"] == StockCount.ApprovalStatus.SUBMITTED:
            sc_summary[oid]["submitted"] = r["entries"]
        elif r["approval_status"] == StockCount.ApprovalStatus.APPROVED:
            sc_summary[oid]["approved"] = r["entries"]

    # --- Open variances (cross-session, current) ---
    var_open = dict(
        VarianceRecord.objects
        .filter(outlet_id__in=outlet_ids, status__in=("pending", "investigating"))
        .values("outlet_id").annotate(n=Count("id")).values_list("outlet_id", "n")
    )

    # --- Last activity per outlet — max(last upload, last count) ---
    last_count_by_outlet = dict(
        StockCount.objects
        .filter(outlet_id__in=outlet_ids)
        .values("outlet_id").annotate(t=Max("counted_at")).values_list("outlet_id", "t")
    )

    results = []
    for outlet in outlets:
        oid = outlet.id
        log = logs_by_outlet.get(oid)
        sess = sessions_by_outlet.get(oid)
        sc = sc_summary.get(oid, {"submitted": 0, "approved": 0, "items_counted": 0})
        total_items = item_totals.get(oid, 0)
        items_counted = sc["items_counted"]
        pct = round(items_counted / total_items * 100, 1) if total_items else 0
        last_upload_t = log.uploaded_at if log else None
        last_count_t = last_count_by_outlet.get(oid)
        last_activity = max(filter(None, [last_upload_t, last_count_t]), default=None)

        results.append({
            "outlet_id": oid,
            "outlet_name": outlet.outlet_name,
            "short_code": outlet.short_code,
            # POS
            "uploaded": log is not None,
            "uploaded_at": log.uploaded_at.isoformat() if log else None,
            "uploaded_by": log.uploaded_by.username if log else None,
            "total_rows": log.total_rows if log else None,
            "approval_status": log.approval_status if log else None,
            # Count
            "total_items": total_items,
            "items_counted_today": items_counted,
            "count_pct": pct,
            "session_status": sess.status if sess else None,
            "counts_submitted": sc["submitted"],
            "counts_approved": sc["approved"],
            # Variance
            "open_variances": var_open.get(oid, 0),
            # Activity
            "last_activity": last_activity.isoformat() if last_activity else None,
        })

    uploaded_count = sum(1 for r in results if r["uploaded"])
    return Response({
        "date": str(target_date),
        "total_outlets": len(results),
        "uploaded_count": uploaded_count,
        "missing_count": len(results) - uploaded_count,
        "outlets_with_open_variances": sum(1 for r in results if r["open_variances"] > 0),
        "outlets_with_pending_counts": sum(1 for r in results if r["counts_submitted"] > 0),
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
    """Write pos_snapshots + pending_items to DB. Returns a DRF Response.

    Multi-upload per day: each call creates (or reuses) a single UploadLog
    batch and stamps every PosSnapshot with `upload_batch`. Prior batches on
    the same date are NOT deleted — they remain for time-based variance lookup.
    """
    with transaction.atomic():
        # Create the UploadLog up-front so PosSnapshots can be linked to it.
        if existing_log is not None:
            log = existing_log
        else:
            log = UploadLog.objects.create(
                outlet=outlet,
                snapshot_date=snapshot_date,
                uploaded_by=user,
                status=UploadLog.Status.SUCCESS,
                total_rows=len(parsed.rows),
                matched_rows=0,
                new_items_count=0,
                changed_items_count=0,
                filename=filename,
                approval_status=UploadLog.ApprovalStatus.AUTO,
            )

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
                    upload_log=log,
                )
                pending_new, pending_created = PendingItem.objects.get_or_create(
                    item_code=row.item_code,
                    first_seen_outlet=outlet,
                    change_type=PendingItem.ChangeType.NEW_CODE,
                    defaults={
                        "item_name": row.item_name,
                        "item": item,
                        "upload_log": log,
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
                            upload_log=log,
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
                    upload_batch=log,
                )
            )

        # Upsert keyed on (outlet, item, snapshot_date) — the canonical
        # daily row. A second upload for the same day overwrites the first
        # instead of duplicating it (multi-part uploads were silently
        # multiplying every aggregate downstream).
        PosSnapshot.objects.bulk_create(
            snapshot_list,
            update_conflicts=True,
            unique_fields=["outlet", "item", "snapshot_date"],
            update_fields=["pos_quantity", "cost_price", "selling_price", "uploaded_by", "uploaded_at", "upload_batch"],
        )

        # A new POS upload means the previous day's counts are frozen —
        # finalize any open count sessions for this outlet on dates strictly
        # earlier than this upload's snapshot_date. Same-day sessions stay
        # open so multi-upload-per-day still works.
        #
        # finalize_count_session auto-approves still-submitted counts and
        # generates variance records — the same end state a manual close
        # produces. Earlier versions only flipped status to CLOSED, which
        # left submitted counts in limbo forever.
        from apps.dashboard.models import CountSession as _CountSession
        from apps.dashboard.services import finalize_count_session as _finalize
        stale_sessions = list(
            _CountSession.objects.filter(
                outlet=outlet,
                count_date__lt=snapshot_date,
                status=_CountSession.Status.OPEN,
            )
        )
        for _sess in stale_sessions:
            _finalize(_sess, closed_by=user)

        log.matched_rows = matched
        log.new_items_count = new_items
        log.changed_items_count = changed_items
        log.total_rows = len(parsed.rows)
        log.save(update_fields=["matched_rows", "new_items_count", "changed_items_count", "total_rows"])

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

        # On approval (existing_log present) flip the prior pending UploadedSheet
        # to approved; on a fresh auto-approve upload, create one.
        if existing_log is not None:
            UploadedSheet.objects.filter(
                pipeline=UploadedSheet.Pipeline.POS, batch_id=log.id,
            ).update(approval_status=UploadedSheet.ApprovalStatus.APPROVED)
        else:
            record_uploaded_sheet(
                pipeline=UploadedSheet.Pipeline.POS,
                batch_id=log.id,
                outlet=outlet,
                business_date=snapshot_date,
                business_date_to=None,
                uploaded_by=user,
                filename=filename,
                row_count=len(parsed.rows),
                columns=POS_COLUMNS,
                approval_status=UploadedSheet.ApprovalStatus.AUTO,
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

    try:
        log.stored_file.open("rb")
        try:
            parsed = parse_xls(log.stored_file, log.filename)
        finally:
            log.stored_file.close()
    except Exception as exc:
        logger.exception("upload_diff: parse failed for log %s", log_id)
        return Response(
            {"detail": f"Could not parse stored file: {exc.__class__.__name__}: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

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
