from datetime import date, timedelta, datetime
from decimal import Decimal

from django.db import transaction
from django.db.models import F, ExpressionWrapper, DecimalField, Count, Sum, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User, MobileDevice
from apps.accounts.permissions import IsManager, CanCount, IsAdmin
from apps.accounts.permission_registry import user_has_permission
from apps.outlets.models import Outlet
from apps.items.models import PendingItem, Item
from apps.uploads.models import PosSnapshot, UploadLog
from .models import StockCount, CountSession, VarianceRecord
from .serializers import (
    VarianceSerializer,
    StockCountSerializer,
    CountSessionSerializer,
    VarianceRecordSerializer,
)
from .audit import record_audit, snapshot_stock_count, snapshot_variance, snapshot_session


def _resolve_outlet(request):
    """Return the outlet to operate on.

    Admins may override by passing ?outlet=<id>. All other roles are
    locked to their assigned outlet.
    """
    if request.user.role == User.Role.ADMIN and request.query_params.get("outlet"):
        return get_object_or_404(Outlet, pk=request.query_params["outlet"])
    return request.user.outlet


def _get_or_create_open_session(outlet, count_date, user):
    """Lazily open a session for (outlet, count_date). Used by submit_count."""
    session = CountSession.objects.filter(
        outlet=outlet, count_date=count_date, status=CountSession.Status.OPEN
    ).first()
    if session:
        return session
    return CountSession.objects.create(
        outlet=outlet,
        count_date=count_date,
        started_by=user,
    )


def _parse_date(raw, default=None):
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return default


@api_view(["GET"])
@permission_classes([IsManager])
def count_progress(request):
    """Count progress for the manager's outlet, for the given date (defaults today).

    `?date=YYYY-MM-DD` overrides the target date. Also reports whether a
    count session for that date is currently OPEN — used by the Daily Ops
    page to show the session-state badge.
    """
    outlet = _resolve_outlet(request)
    target_date = _parse_date(request.query_params.get("date", "")) or date.today()

    total_counted = (
        StockCount.objects
        .filter(outlet=outlet, count_date=target_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id").distinct().count()
    )
    total_items = PosSnapshot.objects.filter(outlet=outlet, snapshot_date=target_date).count()
    pending_barcodes = PendingItem.objects.filter(
        first_seen_outlet=outlet, status=PendingItem.Status.PENDING
    ).count()

    session = CountSession.objects.filter(outlet=outlet, count_date=target_date).order_by("-id").first()

    return Response(
        {
            "today": str(target_date),
            "counted": total_counted,
            "total_items": total_items,
            "pending_barcodes": pending_barcodes,
            "has_upload_today": total_items > 0,
            "session_status": session.status if session else None,
            "session_id": session.id if session else None,
        }
    )


@api_view(["GET"])
@permission_classes([IsManager])
def variances(request):
    """
    POS qty vs latest actual count for the manager's outlet.

    Aggregation, abs-variance sort and pagination are all pushed to SQL so
    rendering 50 of 50k snapshots reads ~50 rows from the DB instead of all
    50k into Python memory.
    """
    from django.db.models import OuterRef, Subquery, F, ExpressionWrapper, DecimalField, Value
    from django.db.models.functions import Abs, Coalesce

    outlet = _resolve_outlet(request)

    try:
        limit = min(int(request.query_params.get("limit", 200)), 500)
    except (TypeError, ValueError):
        limit = 200

    latest_snapshot = (
        PosSnapshot.objects.filter(outlet=outlet)
        .order_by("-snapshot_date")
        .values_list("snapshot_date", flat=True)
        .first()
    )
    if not latest_snapshot:
        return Response([])

    # Latest count_date for this (outlet, item)
    latest_count_date = (
        StockCount.objects
        .filter(outlet=outlet, item=OuterRef("item"))
        .order_by("-count_date")
        .values("count_date")[:1]
    )
    # Summed actual_qty on that latest date for this (outlet, item)
    counted_qty_subq = (
        StockCount.objects
        .filter(outlet=outlet, item=OuterRef("item"), count_date=Subquery(latest_count_date))
        .values("item")
        .annotate(total=Sum("actual_qty"))
        .values("total")[:1]
    )

    qs = (
        PosSnapshot.objects
        .filter(outlet=outlet, snapshot_date=latest_snapshot)
        .select_related("item")
        .annotate(
            actual_qty=Subquery(counted_qty_subq, output_field=DecimalField(max_digits=14, decimal_places=3)),
            last_counted=Subquery(latest_count_date),
        )
        # "Variance" only makes sense when something was actually counted.
        # Items that have never been counted have actual_qty IS NULL and
        # were previously rendered with "—" everywhere — pure noise. Drop
        # them at the source so the dashboard table only shows real
        # POS-vs-Counted comparisons.
        .filter(actual_qty__isnull=False)
        .annotate(
            variance=ExpressionWrapper(
                F("actual_qty") - F("pos_quantity"),
                output_field=DecimalField(max_digits=14, decimal_places=3),
            ),
        )
        .annotate(
            abs_variance=Abs(F("variance")),
        )
        .order_by("-abs_variance")
    )

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(int(request.query_params.get("page_size", 50)), 200)
    except (TypeError, ValueError):
        page_size = 50

    total = min(qs.count(), limit)
    offset = (page - 1) * page_size
    page_qs = qs[offset: min(offset + page_size, limit)]

    page_results = [
        {
            "item_id": snap.item.id,
            "item_code": snap.item.item_code,
            "item_name": snap.item.item_name,
            "category": snap.item.category,
            "pos_qty": float(snap.pos_quantity),
            "actual_qty": float(snap.actual_qty) if snap.actual_qty is not None else None,
            "variance": float(snap.variance) if snap.variance is not None else None,
            "location_tag": "",
            "last_counted": str(snap.last_counted) if snap.last_counted else None,
            "snapshot_date": str(latest_snapshot),
        }
        for snap in page_qs
    ]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "snapshot_date": str(latest_snapshot),
        "results": page_results,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def alerts(request):
    """Negative stock and missing upload warnings for the manager's outlet."""
    outlet = _resolve_outlet(request)
    today = date.today()

    negative_snapshots = PosSnapshot.objects.filter(
        outlet=outlet,
        snapshot_date=today,
        pos_quantity__lt=0,
    ).select_related("item")

    negative_items = [
        {
            "item_code": s.item.item_code,
            "item_name": s.item.item_name,
            "pos_qty": float(s.pos_quantity),
        }
        for s in negative_snapshots
    ]

    uploaded_dates = set(
        UploadLog.objects.filter(
            outlet=outlet,
            status=UploadLog.Status.SUCCESS,
        ).values_list("snapshot_date", flat=True)
    )
    missing_uploads = []
    for i in range(1, 8):
        d = today - timedelta(days=i)
        if d.weekday() < 6 and d not in uploaded_dates:
            missing_uploads.append(str(d))

    pending_count = PendingItem.objects.filter(
        first_seen_outlet=outlet, status=PendingItem.Status.PENDING
    ).count()

    return Response(
        {
            "negative_items": negative_items,
            "missing_uploads": missing_uploads,
            "pending_barcodes": pending_count,
        }
    )


@api_view(["GET"])
@permission_classes([CanCount])
def count_items(request):
    """
    Items for the user's outlet from the POS snapshot for the requested date.
    """
    outlet_id = request.query_params.get("outlet")
    if outlet_id:
        try:
            outlet = Outlet.objects.get(pk=outlet_id)
        except Outlet.DoesNotExist:
            return Response({"detail": "Outlet not found."}, status=404)
    else:
        outlet = request.user.outlet
        if not outlet:
            return Response({"detail": "No outlet assigned."}, status=400)

    count_date = _parse_date(request.query_params.get("count_date", ""), default=date.today())

    snapshots = (
        PosSnapshot.objects.filter(outlet=outlet, snapshot_date=count_date)
        .select_related("item")
    )

    # SME fallback: when no snapshot exists for this date, count against Item.on_hand
    # (the in-house POS is the source of truth). We synthesize snapshot-like rows.
    use_on_hand = not snapshots.exists()
    if use_on_hand:
        from apps.items.models import Item as _Item
        items_qs = _Item.objects.filter(outlet=outlet, status=_Item.Status.ACTIVE)
        if not items_qs.exists():
            return Response(
                {
                    "detail": f"No products in catalog. Add products first, or upload an XLS for {count_date}.",
                    "no_upload": True,
                    "count_date": str(count_date),
                },
                status=200,
            )

    summed_date_counts = {
        row["item_id"]: row["total_qty"]
        for row in StockCount.objects.filter(outlet=outlet, count_date=count_date)
        .values("item_id")
        .annotate(total_qty=Sum("actual_qty"))
    }
    last_count_per_item = {}
    for sc in StockCount.objects.filter(outlet=outlet, count_date=count_date).select_related("counted_by").order_by("item_id", "-counted_at"):
        if sc.item_id not in last_count_per_item:
            last_count_per_item[sc.item_id] = sc

    results = []
    if use_on_hand:
        for it in items_qs:
            total_qty = summed_date_counts.get(it.id)
            sc = last_count_per_item.get(it.id)
            results.append({
                "item_id": it.id,
                "item_code": it.item_code,
                "item_name": it.item_name,
                "category": it.category,
                "barcode": it.barcode,
                "pos_qty": float(it.on_hand or 0),
                "snapshot_date": str(count_date),
                "source": "on_hand",
                "today_count_id": sc.id if sc else None,
                "today_actual_qty": float(total_qty) if total_qty is not None else None,
                "today_location_tag": sc.location_tag if sc else "",
                "today_counted_by": sc.counted_by.username if sc and sc.counted_by else None,
                "today_approval_status": sc.approval_status if sc else None,
            })
    else:
        for snap in snapshots:
            total_qty = summed_date_counts.get(snap.item_id)
            sc = last_count_per_item.get(snap.item_id)
            results.append(
                {
                    "item_id": snap.item.id,
                    "item_code": snap.item.item_code,
                    "item_name": snap.item.item_name,
                    "category": snap.item.category,
                    "barcode": snap.item.barcode,
                    "pos_qty": float(snap.pos_quantity),
                    "snapshot_date": str(count_date),
                    "source": "pos_snapshot",
                    "today_count_id": sc.id if sc else None,
                    "today_actual_qty": float(total_qty) if total_qty is not None else None,
                    "today_location_tag": sc.location_tag if sc else "",
                    "today_counted_by": sc.counted_by.username if sc and sc.counted_by else None,
                    "today_approval_status": sc.approval_status if sc else None,
                }
            )

    results.sort(key=lambda x: (x["today_actual_qty"] is not None, x["item_code"]))

    counted_count = sum(1 for r in results if r["today_actual_qty"] is not None)

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        page = 1
    page_size = 10
    total = len(results)
    start = (page - 1) * page_size
    page_results = results[start:start + page_size]

    return Response({
        "count": total,
        "counted_count": counted_count,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": page_results,
    })



@api_view(["GET"])
@permission_classes([IsManager])
def admin_summary(request):
    """Cross-outlet summary for admins."""
    from django.core.cache import cache

    if request.user.role != "admin" and request.user.role != "super_admin":
        return Response({"detail": "Admin only."}, status=403)

    today = date.today()
    cache_key = f"dashboard.admin_summary.{today.isoformat()}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    outlets = Outlet.objects.all().order_by("outlet_name")

    uploaded_today_ids = set(
        UploadLog.objects.filter(status=UploadLog.Status.SUCCESS, snapshot_date=today)
        .values_list("outlet_id", flat=True)
    )

    rows = []
    total_items = 0
    total_pending = 0
    total_negative = 0

    for outlet in outlets:
        item_count = PosSnapshot.objects.filter(outlet=outlet).values("item").distinct().count()
        pending_bc = PendingItem.objects.filter(
            first_seen_outlet=outlet, status=PendingItem.Status.PENDING
        ).count()
        negative_count = PosSnapshot.objects.filter(
            outlet=outlet, snapshot_date=today, pos_quantity__lt=0
        ).count()
        counted_today = StockCount.objects.filter(outlet=outlet, count_date=today).values("item_id").distinct().count()

        total_items += item_count
        total_pending += pending_bc
        total_negative += negative_count

        rows.append({
            "outlet_id": outlet.id,
            "outlet_name": outlet.outlet_name,
            "item_count": item_count,
            "uploaded_today": outlet.id in uploaded_today_ids,
            "pending_barcodes": pending_bc,
            "negative_items": negative_count,
            "counted_today": counted_today,
        })

    payload = {
        "today": str(today),
        "outlet_count": len(rows),
        "total_items": total_items,
        "total_pending_barcodes": total_pending,
        "total_negative_today": total_negative,
        "outlets": rows,
    }
    cache.set(cache_key, payload, 60)
    return Response(payload)


@api_view(["POST"])
@permission_classes([CanCount])
def submit_count(request):
    """
    Submit a physical stock count. Mobile-preserving:
      - Same request payload as before.
      - Same response shape (StockCountSerializer).
      - Server auto-attaches an open CountSession and sets approval_status=submitted.
      - Duplicate (outlet,item,date,location_tag) inside the same session is
        upserted (idempotent retry) rather than rejected.
      - Outlier qty (>10x POS qty) is accepted but flagged for manager review.
    """
    from .serializers import SubmitCountSerializer
    from apps.accounts.device_utils import touch_device, get_device_uuid
    from apps.items.models import Item

    serializer = SubmitCountSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    try:
        item = Item.objects.get(pk=serializer.validated_data["item_id"])
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=404)

    outlet = request.user.outlet
    if not outlet:
        return Response({"detail": "No outlet assigned."}, status=400)

    count_date = _parse_date(request.data.get("count_date", ""), default=date.today())
    device_uuid = get_device_uuid(request)
    touch_device(request, action="count")

    actual_qty = serializer.validated_data["actual_qty"]
    location_tag = serializer.validated_data.get("location_tag", "") or ""
    is_month_end = serializer.validated_data.get("is_month_end", False)

    pos_qty = (
        PosSnapshot.objects.filter(outlet=outlet, item=item, snapshot_date=count_date)
        .values_list("pos_quantity", flat=True)
        .first()
    )
    flagged = False
    if pos_qty is not None and pos_qty > 0:
        if Decimal(actual_qty) > Decimal(pos_qty) * Decimal("10"):
            flagged = True

    with transaction.atomic():
        session = _get_or_create_open_session(outlet, count_date, request.user)

        existing = StockCount.objects.filter(
            outlet=outlet,
            item=item,
            count_date=count_date,
            location_tag=location_tag,
            session=session,
        ).first()

        if existing and existing.approval_status in (
            StockCount.ApprovalStatus.DRAFT,
            StockCount.ApprovalStatus.SUBMITTED,
        ):
            # Upsert: overwrite a draft/submitted count from the same session
            before = snapshot_stock_count(existing)
            existing.actual_qty = actual_qty
            existing.counted_by = request.user
            existing.is_month_end = is_month_end
            existing.device_uuid = device_uuid
            existing.flagged_outlier = flagged
            existing.submitted_at = timezone.now()
            existing.approval_status = StockCount.ApprovalStatus.SUBMITTED
            existing.save()
            record_audit(
                user=request.user,
                action="stock_count.upsert",
                entity=existing,
                before=before,
                after=snapshot_stock_count(existing),
            )
            return Response(StockCountSerializer(existing).data, status=200)

        count = StockCount.objects.create(
            outlet=outlet,
            item=item,
            count_date=count_date,
            actual_qty=actual_qty,
            location_tag=location_tag,
            counted_by=request.user,
            is_month_end=is_month_end,
            device_uuid=device_uuid,
            session=session,
            approval_status=StockCount.ApprovalStatus.SUBMITTED,
            submitted_at=timezone.now(),
            flagged_outlier=flagged,
        )
        record_audit(
            user=request.user,
            action="stock_count.submit",
            entity=count,
            after=snapshot_stock_count(count),
        )
    return Response(StockCountSerializer(count).data, status=201)


@api_view(["GET"])
@permission_classes([IsManager])
def daily_counts(request):
    """All StockCount records for an outlet on a given date range.

    When `session_id` is provided, outlet + date scope are derived from the
    session itself — the caller doesn't need to pass `outlet` or a date
    range. This is the path used by the Count Session detail page, where
    the admin may be in "All outlets" mode globally.
    """
    session_id = request.query_params.get("session_id")
    session_obj = None
    if session_id:
        try:
            session_obj = CountSession.objects.select_related("outlet").get(pk=session_id)
        except CountSession.DoesNotExist:
            return Response({"detail": "Session not found."}, status=404)
        if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            if session_obj.outlet_id != request.user.outlet_id:
                return Response({"detail": "Cross-outlet access denied."}, status=403)
        outlet = session_obj.outlet
    else:
        outlet = _resolve_outlet(request)
        if not outlet:
            return Response({"detail": "No outlet."}, status=400)

    legacy = _parse_date(request.query_params.get("count_date", ""))
    date_from = _parse_date(request.query_params.get("date_from", "")) or legacy or date.today()
    date_to = _parse_date(request.query_params.get("date_to", "")) or legacy or date_from
    if date_to < date_from:
        date_from, date_to = date_to, date_from

    search = request.query_params.get("search", "").strip()
    status_filter = request.query_params.get("approval_status", "").strip()

    qs = (
        StockCount.objects.filter(outlet=outlet)
        .select_related("item", "counted_by", "approved_by")
        .order_by("-count_date", "item__item_code", "counted_at")
    )

    if session_obj:
        # session_id already pins this to a single (outlet, count_date) —
        # the explicit date range is redundant and would mask older sessions
        # when the default date_from defaults to today.
        qs = qs.filter(session_id=session_obj.id)
    else:
        qs = qs.filter(count_date__gte=date_from, count_date__lte=date_to)

    if search:
        qs = qs.filter(
            Q(item__item_code__icontains=search) | Q(item__item_name__icontains=search)
        )
    if status_filter:
        qs = qs.filter(approval_status=status_filter)

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = min(int(request.query_params.get("page_size", 20)), 100)
    except (ValueError, TypeError):
        page_size = 20

    total = qs.count()
    offset = (page - 1) * page_size
    page_qs = list(qs[offset: offset + page_size])

    snapshot_map = {}
    if page_qs:
        item_ids = {sc.item_id for sc in page_qs}
        prior_rows = (
            StockCount.objects.filter(
                outlet=outlet,
                item_id__in=item_ids,
                approval_status=StockCount.ApprovalStatus.APPROVED,
            )
            .order_by("-count_date", "-counted_at")
            .values("item_id", "location_tag", "count_date", "actual_qty")
        )
        prior_by_key = {}
        for row in prior_rows:
            prior_by_key.setdefault((row["item_id"], row["location_tag"]), []).append(row)
        for sc in page_qs:
            for row in prior_by_key.get((sc.item_id, sc.location_tag), []):
                if row["count_date"] < sc.count_date:
                    snapshot_map[(sc.item_id, sc.location_tag, sc.count_date)] = row
                    break

    # POS qty in effect at the moment of each count: walk the page's items
    # once and pick the latest PosSnapshot for (outlet, item) with
    # uploaded_at <= sc.counted_at. Same temporal-match logic as Count
    # Coverage Report. Bounded scan: items_on_page * snapshots_per_item.
    pos_snap_by_count = {}
    if page_qs:
        item_ids = list({sc.item_id for sc in page_qs})
        snap_rows = (
            PosSnapshot.objects
            .filter(outlet=outlet, item_id__in=item_ids)
            .order_by("item_id", "-uploaded_at")
            .values("item_id", "uploaded_at", "pos_quantity", "snapshot_date")
        )
        snaps_by_item = {}
        for s in snap_rows:
            snaps_by_item.setdefault(s["item_id"], []).append(s)
        for sc in page_qs:
            for s in snaps_by_item.get(sc.item_id, []):
                if s["uploaded_at"] <= sc.counted_at:
                    pos_snap_by_count[sc.id] = s
                    break

    results = []
    for sc in page_qs:
        snap = snapshot_map.get((sc.item_id, sc.location_tag, sc.count_date))
        pos_snap = pos_snap_by_count.get(sc.id)
        actual_q = float(sc.actual_qty)
        pos_q = float(pos_snap["pos_quantity"]) if pos_snap else None
        results.append({
            "id": sc.id,
            "item_code": sc.item.item_code,
            "item_name": sc.item.item_name,
            "category": sc.item.category,
            "location_tag": sc.location_tag,
            "actual_qty": actual_q,
            "last_snapshot_qty": float(snap["actual_qty"]) if snap else None,
            "last_snapshot_date": str(snap["count_date"]) if snap else None,
            # POS qty in effect when this count was taken (multi-upload aware).
            "pos_qty_at_count": pos_q,
            "pos_snapshot_uploaded_at": (
                pos_snap["uploaded_at"].isoformat() if pos_snap else None
            ),
            "pos_snapshot_date": (
                str(pos_snap["snapshot_date"]) if pos_snap else None
            ),
            "variance_qty": (actual_q - pos_q) if pos_q is not None else None,
            "counted_by_username": sc.counted_by.username if sc.counted_by else None,
            "counted_at": sc.counted_at.isoformat(),
            "count_date": str(sc.count_date),
            "is_month_end": sc.is_month_end,
            "approval_status": sc.approval_status,
            "approved_by_username": sc.approved_by.username if sc.approved_by else None,
            "approved_at": sc.approved_at.isoformat() if sc.approved_at else None,
            "rejection_reason": sc.rejection_reason,
            "flagged_outlier": sc.flagged_outlier,
            "session_id": sc.session_id,
        })

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "date_from": str(date_from),
        "date_to": str(date_to),
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def counts_grouped(request):
    """
    StockCount rows for (outlet, date) grouped by item, with a per-location
    breakdown embedded per row. Same item counted in Rack 3 (5 units) and
    Rack 7 (3 units) collapses to ONE row (total 8, 2 locations).

    Powers the Daily Ops "See counted" modal, which is item-first, not
    entry-first. When the same item is counted by multiple counters we
    show "Multiple" in the counted_by column and reveal the per-counter
    breakdown in the expand panel.

    Query params:
      outlet=<id>            admin override
      date=YYYY-MM-DD        default today
      q                      search item code / name
      page, page_size        standard pagination on the grouped rows
    """
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    target_date = _parse_date(request.query_params.get("date", "")) or date.today()

    # Pull every non-rejected count for the (outlet, date). We'll group in
    # Python because we need a nested per-location payload per item.
    counts_qs = (
        StockCount.objects
        .filter(outlet=outlet, count_date=target_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .select_related("item", "counted_by")
        .order_by("item__item_code", "counted_at")
    )

    q = request.query_params.get("q", "").strip()
    if q:
        counts_qs = counts_qs.filter(
            Q(item__item_code__icontains=q) | Q(item__item_name__icontains=q)
        )

    # Group by item_id
    grouped = {}
    for sc in counts_qs:
        row = grouped.setdefault(sc.item_id, {
            "item_id": sc.item_id,
            "item_code": sc.item.item_code,
            "item_name": sc.item.item_name,
            "category": sc.item.category,
            "total_qty": Decimal("0"),
            "locations_count": 0,
            "counters": set(),
            "last_counted_at": None,
            "any_submitted": False,
            "any_approved": False,
            "any_pending": False,
            "entries": [],
        })
        row["total_qty"] += Decimal(sc.actual_qty or 0)
        row["locations_count"] += 1
        counter = sc.counted_by.username if sc.counted_by else None
        if counter:
            row["counters"].add(counter)
        if row["last_counted_at"] is None or (sc.counted_at and sc.counted_at > row["last_counted_at"]):
            row["last_counted_at"] = sc.counted_at
        status = sc.approval_status
        if status == StockCount.ApprovalStatus.SUBMITTED:
            row["any_submitted"] = True
        elif status == StockCount.ApprovalStatus.APPROVED:
            row["any_approved"] = True
        else:
            row["any_pending"] = True
        row["entries"].append({
            "stock_count_id": sc.id,
            "location_tag": sc.location_tag or "",
            "qty": float(sc.actual_qty or 0),
            "counted_by": counter,
            "counted_at": sc.counted_at.isoformat() if sc.counted_at else None,
            "approval_status": status,
        })

    rows = list(grouped.values())

    # Bulk-fetch active POS snapshot for every item once so we can enrich +
    # sort by variance columns before paginating.
    all_item_ids = [r["item_id"] for r in rows]
    snap_map = {
        snap.item_id: snap for snap in
        PosSnapshot.objects
        .filter(outlet=outlet, item_id__in=all_item_ids, snapshot_date=target_date)
    }

    # Enrich every row with pos/variance so sort keys work
    enriched = []
    for r in rows:
        counters = sorted(r["counters"])
        summary_status = (
            "approved" if r["any_approved"] and not r["any_submitted"] and not r["any_pending"]
            else "submitted" if r["any_submitted"]
            else "mixed" if len(counters) > 1 or r["any_approved"] and r["any_pending"]
            else "pending"
        )
        snap = snap_map.get(r["item_id"])
        pos_qty = Decimal(snap.pos_quantity) if snap else None
        cost_price = Decimal(snap.cost_price) if snap and snap.cost_price is not None else None
        sell_price = Decimal(snap.selling_price) if snap and snap.selling_price is not None else None
        variance_qty = (r["total_qty"] - pos_qty) if pos_qty is not None else None
        variance_value = (variance_qty * cost_price) if variance_qty is not None and cost_price is not None else None
        enriched.append({
            "item_id": r["item_id"],
            "item_code": r["item_code"],
            "item_name": r["item_name"],
            "category": r["category"],
            "total_qty": float(r["total_qty"]),
            "locations_count": r["locations_count"],
            "counters": counters,
            "counters_summary": "Multiple" if len(counters) > 1 else (counters[0] if counters else "—"),
            "status_summary": summary_status,
            "last_counted_at": r["last_counted_at"].isoformat() if r["last_counted_at"] else None,
            "entries": r["entries"],
            "pos_qty": float(pos_qty) if pos_qty is not None else None,
            "cost_price": float(cost_price) if cost_price is not None else None,
            "sell_price": float(sell_price) if sell_price is not None else None,
            "variance_qty": float(variance_qty) if variance_qty is not None else None,
            "variance_value": float(variance_value) if variance_value is not None else None,
        })

    # Client-supplied variance filter: shrinkage / extra / zero / all
    var_filter = request.query_params.get("var_filter", "all")
    if var_filter == "shrinkage":
        enriched = [r for r in enriched if r["variance_qty"] is not None and r["variance_qty"] < 0]
    elif var_filter == "extra":
        enriched = [r for r in enriched if r["variance_qty"] is not None and r["variance_qty"] > 0]
    elif var_filter == "zero":
        enriched = [r for r in enriched if r["variance_qty"] == 0]

    # Client-supplied status filter (multi-select via CSV): approved,submitted,pending,mixed
    status_filter = request.query_params.get("status_filter", "").strip()
    if status_filter:
        wanted = {s.strip() for s in status_filter.split(",") if s.strip()}
        if wanted:
            enriched = [r for r in enriched if r["status_summary"] in wanted]

    # Sort (default: |variance_value| desc — biggest money problems first).
    # Absolute-value sort keeps -Rs 30k above +Rs 500 in urgency terms.
    sort_by = request.query_params.get("sort_by", "abs_variance_value")
    order = request.query_params.get("order", "desc" if sort_by in ("abs_variance_value", "variance_value", "variance_qty", "total_qty", "pos_qty", "last_counted_at") else "asc")
    counted_sort_map = {
        "item_code":       lambda r: (r["item_code"] or "").lower(),
        "item_name":       lambda r: (r["item_name"] or "").lower(),
        "pos_qty":         lambda r: r["pos_qty"],
        "sell_price":      lambda r: r["sell_price"],
        "total_qty":       lambda r: r["total_qty"],
        "variance_qty":    lambda r: r["variance_qty"],
        "variance_value":  lambda r: r["variance_value"],
        "abs_variance_value": lambda r: abs(r["variance_value"]) if r["variance_value"] is not None else None,
        "last_counted_at": lambda r: r["last_counted_at"] or "",
    }
    enriched = _sort_rows(enriched, sort_by, order, counted_sort_map, "abs_variance_value")

    # CSV mode
    if request.query_params.get("export") == "csv":
        header = ["Code", "Item", "Location(s)", "POS qty", "Sell price",
                  "Total counted", "Variance qty", "Variance value",
                  "Status", "Counted by", "Last counted at"]

        def iterator():
            for r in enriched:
                location = (
                    f"{r['locations_count']} locations"
                    if r["locations_count"] > 1
                    else (r["entries"][0]["location_tag"] if r["entries"] else "")
                )
                yield [
                    r["item_code"], r["item_name"], location,
                    "" if r["pos_qty"] is None else r["pos_qty"],
                    "" if r["sell_price"] is None else r["sell_price"],
                    r["total_qty"],
                    "" if r["variance_qty"] is None else r["variance_qty"],
                    "" if r["variance_value"] is None else r["variance_value"],
                    r["status_summary"], r["counters_summary"],
                    r["last_counted_at"] or "",
                ]

        resp = _csv_stream(header, iterator())
        resp["Content-Disposition"] = f'attachment; filename="daily-ops-counted-{outlet.short_code or outlet.id}-{target_date}.csv"'
        return resp

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(max(int(request.query_params.get("page_size", 25)), 1), 200)
    except (TypeError, ValueError):
        page_size = 25

    total = len(enriched)
    offset = (page - 1) * page_size
    results = enriched[offset:offset + page_size]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "outlet_id": outlet.id,
        "date": str(target_date),
        "results": results,
    })


# Sort keys allowed on the uncounted endpoint. Maps to a callable that returns
# the key for Python sort — None values sort last regardless of direction.
UNCOUNTED_SORT_KEYS = {
    "item_code":    lambda r: (r["item_code"] or "").lower(),
    "item_name":    lambda r: (r["item_name"] or "").lower(),
    "category":     lambda r: (r["category"] or "").lower(),
    "pos_qty":      lambda r: r["pos_qty"],
    "cost_price":   lambda r: r["cost_price"],
    "selling_price":lambda r: r["selling_price"],
}


def _sort_rows(rows, sort_by, direction, sort_map, default_key):
    """Stable sort with None-values-last semantics regardless of direction."""
    key_fn = sort_map.get(sort_by, sort_map[default_key])
    reverse = (direction or "asc").lower() == "desc"
    # First bucket by has-value, then by natural order, so nulls always sink.
    def wrap(r):
        v = key_fn(r)
        return (v is None, v if v is not None else "")
    try:
        return sorted(rows, key=wrap, reverse=reverse)
    except TypeError:
        # Mixed types (e.g. some rows have strings, others None) — fall back
        # to string coercion. Rare but keeps the endpoint from 500ing.
        return sorted(rows, key=lambda r: (key_fn(r) is None, str(key_fn(r) or "")), reverse=reverse)


def _csv_stream(header, iterator):
    """Return a StreamingHttpResponse that yields a CSV file row-by-row."""
    import csv, io
    from django.http import StreamingHttpResponse

    class _Echo:
        def write(self, value):
            return value

    writer = csv.writer(_Echo())

    def rows():
        yield writer.writerow(header)
        for row in iterator:
            yield writer.writerow(row)

    return StreamingHttpResponse(rows(), content_type="text/csv")


import math


COVERAGE_SORT_KEYS = {
    "item_code":       lambda r: (r["item_code"] or "").lower(),
    "item_name":       lambda r: (r["item_name"] or "").lower(),
    "category":        lambda r: (r["category"] or "").lower(),
    "times_counted":   lambda r: r["times_counted"],
    "last_counted":    lambda r: r["last_counted"] or "",
    "total_qty":       lambda r: r["total_qty"],
    "coverage_bucket": lambda r: {"never": 0, "once": 1, "occasional": 2, "frequent": 3}[r["coverage_bucket"]],
}


def _coverage_bucket(times_counted, frequent_threshold):
    if times_counted == 0:
        return "never"
    if times_counted == 1:
        return "once"
    if times_counted < frequent_threshold:
        return "occasional"
    return "frequent"


DAILY_ITEM_SORT_KEYS = {
    "item_code":     lambda r: (r["item_code"] or "").lower(),
    "item_name":     lambda r: (r["item_name"] or "").lower(),
    "category":      lambda r: (r["category"] or "").lower(),
    "pos_qty":       lambda r: r["pos_qty"],
    "counted_qty":   lambda r: r["counted_qty"],
    "variance_qty":  lambda r: r["variance_qty"],
    "variance_value":lambda r: r["variance_value"],
    "counters_summary": lambda r: (r["counters_summary"] or "").lower(),
    "last_counted_at":  lambda r: r["last_counted_at"] or "",
    "status":           lambda r: {"not_counted": 0, "shrinkage": 1, "extra": 2, "match": 3}[r["status"]],
    # Special composite key used as default: uncounted first, then by absolute
    # variance value desc. Managers care most about "what's missing + what
    # matters" — this puts both on the top of the list.
    "urgency":       lambda r: (
        0 if r["status"] == "not_counted" else 1,
        -(abs(r["variance_value"]) if r["variance_value"] is not None else 0),
    ),
}


@api_view(["GET"])
@permission_classes([IsManager])
def daily_count_items(request):
    """
    Every item flagged is_daily_count for the outlet, joined with today's
    (or ?date=) counts + POS snapshot, so managers can see at a glance
    which daily-count items got counted and how they compare to POS.

    Query params:
      outlet=<id>          admin override
      date=YYYY-MM-DD      target date (default: today)
      q                    search item code / name
      bucket               all | not_counted | match | shrinkage | extra
      sort_by, order       standard sort (default: urgency, desc)
      page, page_size      pagination
      export=csv           streaming CSV of the filtered/sorted view

    Response includes a summary block with bucket_counts so the Daily
    Ops card can render the split without a second call.
    """
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    target_date = _parse_date(request.query_params.get("date", "")) or date.today()

    # All daily-count items for the outlet (active only).
    items_qs = (
        Item.objects
        .filter(outlet=outlet, status=Item.Status.ACTIVE, is_daily_count=True)
    )
    q = request.query_params.get("q", "").strip()
    if q:
        items_qs = items_qs.filter(
            Q(item_code__icontains=q) | Q(item_name__icontains=q)
        )

    item_ids = list(items_qs.values_list("id", flat=True))

    # Grouped counts for these items on the target date (item-level totals).
    counts_by_item = {}
    for sc in (
        StockCount.objects
        .filter(outlet=outlet, count_date=target_date, item_id__in=item_ids)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .select_related("counted_by")
    ):
        row = counts_by_item.setdefault(sc.item_id, {
            "total_qty": Decimal("0"),
            "counters": set(),
            "last_counted_at": None,
            "any_submitted": False,
            "any_approved": False,
            "any_pending": False,
            "locations_count": 0,
        })
        row["total_qty"] += Decimal(sc.actual_qty or 0)
        row["locations_count"] += 1
        u = sc.counted_by.username if sc.counted_by else None
        if u:
            row["counters"].add(u)
        if row["last_counted_at"] is None or (sc.counted_at and sc.counted_at > row["last_counted_at"]):
            row["last_counted_at"] = sc.counted_at
        if sc.approval_status == StockCount.ApprovalStatus.SUBMITTED:
            row["any_submitted"] = True
        elif sc.approval_status == StockCount.ApprovalStatus.APPROVED:
            row["any_approved"] = True
        else:
            row["any_pending"] = True

    # POS snapshot for these items on the target date.
    snap_by_item = {
        snap.item_id: snap for snap in
        PosSnapshot.objects
        .filter(outlet=outlet, item_id__in=item_ids, snapshot_date=target_date)
    }

    # Materialize enriched rows for every daily-count item.
    all_items = list(items_qs)
    rows = []
    for it in all_items:
        c = counts_by_item.get(it.id)
        snap = snap_by_item.get(it.id)
        counted_qty = float(c["total_qty"]) if c else None
        pos_qty = float(snap.pos_quantity) if snap else None
        cost_price = float(snap.cost_price) if snap and snap.cost_price is not None else None
        sell_price = float(snap.selling_price) if snap and snap.selling_price is not None else None

        variance_qty = None
        variance_value = None
        if c is not None and pos_qty is not None:
            variance_qty = counted_qty - pos_qty
            if cost_price is not None:
                variance_value = variance_qty * cost_price

        if c is None:
            status = "not_counted"
        elif variance_qty is None or variance_qty == 0:
            status = "match"
        elif variance_qty < 0:
            status = "shrinkage"
        else:
            status = "extra"

        counters = sorted(c["counters"]) if c else []
        counters_summary = (
            "Multiple" if len(counters) > 1
            else (counters[0] if counters else "—")
        )
        status_summary = None
        if c:
            status_summary = (
                "approved" if c["any_approved"] and not c["any_submitted"] and not c["any_pending"]
                else "submitted" if c["any_submitted"]
                else "mixed" if len(counters) > 1 or c["any_approved"] and c["any_pending"]
                else "pending"
            )

        rows.append({
            "item_id": it.id,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "category": it.category or "",
            "rack_number": it.rack_number or "",
            "shelf": it.shelf or "",

            "pos_qty": pos_qty,
            "cost_price": cost_price,
            "sell_price": sell_price,

            "counted_qty": counted_qty,
            "locations_count": (c["locations_count"] if c else 0),
            "variance_qty": variance_qty,
            "variance_value": variance_value,

            "status": status,
            "count_status": status_summary,
            "counters": counters,
            "counters_summary": counters_summary,
            "last_counted_at": c["last_counted_at"].isoformat() if c and c["last_counted_at"] else None,
        })

    # Summary (computed BEFORE bucket filter so numbers reflect the outlet,
    # not the filtered view). Includes per-bucket counts for the chip
    # labels and a net variance value across counted items.
    total_items = len(rows)
    bucket_counts = {"not_counted": 0, "match": 0, "shrinkage": 0, "extra": 0}
    net_variance_value = 0.0
    for r in rows:
        bucket_counts[r["status"]] += 1
        if r["variance_value"] is not None:
            net_variance_value += r["variance_value"]
    counted = total_items - bucket_counts["not_counted"]
    summary = {
        "total_items": total_items,
        "counted": counted,
        "not_counted": bucket_counts["not_counted"],
        "counted_pct": round(counted / total_items * 100, 1) if total_items else 0,
        "net_variance_value": net_variance_value,
        "bucket_counts": bucket_counts,
        "date": str(target_date),
    }

    bucket = (request.query_params.get("bucket") or "all").lower()
    if bucket in ("not_counted", "match", "shrinkage", "extra"):
        rows = [r for r in rows if r["status"] == bucket]

    sort_by = request.query_params.get("sort_by", "urgency")
    order = request.query_params.get("order", "asc" if sort_by == "urgency" else "asc")
    rows = _sort_rows(rows, sort_by, order, DAILY_ITEM_SORT_KEYS, "urgency")

    if request.query_params.get("export") == "csv":
        header = ["Code", "Name", "Category", "Rack", "Shelf",
                  "POS qty", "Counted qty", "Variance qty", "Variance value",
                  "Status", "Counted by", "Last counted at"]

        def iterator():
            for r in rows:
                yield [
                    r["item_code"], r["item_name"], r["category"],
                    r["rack_number"], r["shelf"],
                    "" if r["pos_qty"] is None else r["pos_qty"],
                    "" if r["counted_qty"] is None else r["counted_qty"],
                    "" if r["variance_qty"] is None else r["variance_qty"],
                    "" if r["variance_value"] is None else r["variance_value"],
                    r["status"],
                    r["counters_summary"],
                    r["last_counted_at"] or "",
                ]

        resp = _csv_stream(header, iterator())
        resp["Content-Disposition"] = (
            f'attachment; filename="daily-ops-daily-count-{target_date}.csv"'
        )
        return resp

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(max(int(request.query_params.get("page_size", 25)), 1), 200)
    except (TypeError, ValueError):
        page_size = 25

    total = len(rows)
    offset = (page - 1) * page_size
    results = rows[offset:offset + page_size]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "outlet_id": outlet.id,
        "date": str(target_date),
        "summary": summary,
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def item_coverage_range(request):
    """
    Per-item count coverage across a date range for one outlet. Answers
    "which items are we ignoring and which are we counting religiously"
    in a single call.

    A "time counted" = a distinct count_date the item got at least one
    non-rejected stock_count. Two counts on the same day for the same
    item collapse to one.

    Query params:
      outlet=<id>            admin override
      from=YYYY-MM-DD        range start (inclusive; default: today - 6d)
      to=YYYY-MM-DD          range end (inclusive; default: today)
      q                      search item code / item name
      bucket                 all | never | once | occasional | frequent
      sort_by, order         standard sort
      page, page_size        pagination
      export=csv             stream all matching rows as text/csv

    Response includes a `summary` block so the Daily Ops card can render
    without a second call:
      {
        "total_items":            total active items in outlet,
        "counted_at_least_once":  distinct items with a count in range,
        "counted_every_day":      items with times_counted == range_days,
        "never_counted":          total_items - counted_at_least_once,
        "range_days":             (to - from) + 1,
        "frequent_threshold":     computed threshold used for the bucket,
      }
    """
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    to_date = _parse_date(request.query_params.get("to", "")) or date.today()
    from_date = _parse_date(request.query_params.get("from", "")) or (to_date - timedelta(days=6))
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    range_days = (to_date - from_date).days + 1
    # Threshold scales with the range but caps at 5 so long ranges don't
    # accidentally set the bar too high for a "frequent" item.
    frequent_threshold = max(2, min(5, math.ceil(range_days * 0.25)))

    # Base pool: active items in the outlet, filterable by search.
    items_qs = Item.objects.filter(outlet=outlet, status=Item.Status.ACTIVE)
    q = request.query_params.get("q", "").strip()
    if q:
        items_qs = items_qs.filter(
            Q(item_code__icontains=q) | Q(item_name__icontains=q)
        )

    # Aggregate stock_counts per item over the range.
    from django.db.models import Count as _Count
    agg = (
        StockCount.objects
        .filter(
            outlet=outlet,
            count_date__gte=from_date,
            count_date__lte=to_date,
        )
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id")
        .annotate(
            times_counted=_Count("count_date", distinct=True),
            last_counted=Max("count_date"),
            total_qty=Sum("actual_qty"),
        )
    )
    agg_map = {r["item_id"]: r for r in agg}

    # Left-merge — every active item shows, even ones with zero counts.
    all_items = list(items_qs.values("id", "item_code", "item_name", "category"))
    rows = []
    for it in all_items:
        a = agg_map.get(it["id"])
        times = a["times_counted"] if a else 0
        rows.append({
            "item_id": it["id"],
            "item_code": it["item_code"],
            "item_name": it["item_name"],
            "category": it["category"] or "",
            "times_counted": times,
            "last_counted": str(a["last_counted"]) if a and a["last_counted"] else None,
            "total_qty": float(a["total_qty"]) if a and a["total_qty"] is not None else 0.0,
            "coverage_bucket": _coverage_bucket(times, frequent_threshold),
        })

    # Summary (computed BEFORE bucket filter so numbers reflect the outlet,
    # not the filtered view). Per-bucket counts also live here so the
    # frontend can show "Never (6,307)" etc on the filter chips.
    total_items = len(rows)
    counted_at_least_once = sum(1 for r in rows if r["times_counted"] > 0)
    counted_every_day = sum(1 for r in rows if r["times_counted"] == range_days)
    bucket_counts = {"never": 0, "once": 0, "occasional": 0, "frequent": 0}
    for r in rows:
        bucket_counts[r["coverage_bucket"]] += 1
    summary = {
        "total_items": total_items,
        "counted_at_least_once": counted_at_least_once,
        "counted_every_day": counted_every_day,
        "never_counted": total_items - counted_at_least_once,
        "range_days": range_days,
        "frequent_threshold": frequent_threshold,
        "bucket_counts": bucket_counts,
    }

    bucket = (request.query_params.get("bucket") or "all").lower()
    if bucket in ("never", "once", "occasional", "frequent"):
        rows = [r for r in rows if r["coverage_bucket"] == bucket]

    # Default sort: times_counted asc so under-counted items float to top.
    sort_by = request.query_params.get("sort_by", "times_counted")
    order = request.query_params.get("order", "asc")
    rows = _sort_rows(rows, sort_by, order, COVERAGE_SORT_KEYS, "times_counted")

    if request.query_params.get("export") == "csv":
        header = ["Code", "Name", "Category", "Times counted", "Last counted",
                  "Total counted qty", "Coverage"]

        def iterator():
            for r in rows:
                yield [
                    r["item_code"], r["item_name"], r["category"],
                    r["times_counted"], r["last_counted"] or "",
                    r["total_qty"], r["coverage_bucket"],
                ]

        resp = _csv_stream(header, iterator())
        resp["Content-Disposition"] = (
            f'attachment; filename="daily-ops-coverage-{from_date}-to-{to_date}.csv"'
        )
        return resp

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(max(int(request.query_params.get("page_size", 25)), 1), 200)
    except (TypeError, ValueError):
        page_size = 25

    total = len(rows)
    offset = (page - 1) * page_size
    results = rows[offset:offset + page_size]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "outlet_id": outlet.id,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "summary": summary,
        "results": results,
    })


COUNT_HISTORY_SORT_KEYS = {
    "count_date":       lambda r: r["count_date"] or "",
    "item_code":        lambda r: r["item_code"] or "",
    "item_name":        lambda r: (r["item_name"] or "").lower(),
    "counted_qty":      lambda r: r["counted_qty"],
    "mypos_qty":        lambda r: r["mypos_qty"],
    "variance":         lambda r: r["variance"],
    "loss_value":       lambda r: r["loss_value"],
    "counted_by_name":  lambda r: (r["counted_by_name"] or "").lower(),
}


@api_view(["GET"])
@permission_classes([IsManager])
def count_history_detail(request):
    """
    Per-count-event drill-down for the Count Coverage report. Unlike
    item_coverage_range (one row per item), this returns one row per
    StockCount record so 10 counts of the same item show as 10 rows.

    Joins in:
      - counter username (StockCount.counted_by)
      - MyPOS qty on the same (outlet, item, count_date) from PosSnapshot
      - variance = counted_qty − mypos_qty
      - loss_value = variance × current cost_price (signed; negative = loss)

    Rejected counts are excluded (matches item_coverage_range).

    Query params:
      outlet=<id>            admin override
      from=YYYY-MM-DD        range start (inclusive; default: today - 6d)
      to=YYYY-MM-DD          range end (inclusive; default: today)
      q                      search item_code / item_name
      user=<id|username>     filter by counter (id preferred, falls back to username)
      only_variance=1        only rows where variance != 0
      sort_by, order         see COUNT_HISTORY_SORT_KEYS
      page, page_size        standard pagination
      export=csv             stream all matching rows as CSV
    """
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    to_date = _parse_date(request.query_params.get("to", "")) or date.today()
    from_date = _parse_date(request.query_params.get("from", "")) or (to_date - timedelta(days=6))
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    counts_qs = (
        StockCount.objects
        .filter(outlet=outlet, count_date__gte=from_date, count_date__lte=to_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .select_related("item", "counted_by")
    )

    q = (request.query_params.get("q") or "").strip()
    if q:
        counts_qs = counts_qs.filter(
            Q(item__item_code__icontains=q) | Q(item__item_name__icontains=q)
        )

    user_param = (request.query_params.get("user") or "").strip()
    if user_param:
        if user_param.isdigit():
            counts_qs = counts_qs.filter(counted_by_id=int(user_param))
        else:
            counts_qs = counts_qs.filter(counted_by__username=user_param)

    # Bulk-fetch PosSnapshot rows for all (item, date) pairs in one query.
    count_list = list(counts_qs.only(
        "id", "count_date", "actual_qty", "item_id", "counted_by_id"
    ))
    item_ids = {c.item_id for c in count_list}
    dates = {c.count_date for c in count_list}
    pos_map = {}
    if item_ids and dates:
        pos_rows = PosSnapshot.objects.filter(
            outlet=outlet, item_id__in=item_ids, snapshot_date__in=dates,
        ).values("item_id", "snapshot_date", "pos_quantity")
        for r in pos_rows:
            pos_map[(r["item_id"], r["snapshot_date"])] = float(r["pos_quantity"] or 0)

    # Bulk-fetch item details + current cost.
    item_map = {
        it.id: it for it in Item.objects.filter(id__in=item_ids).only(
            "id", "item_code", "item_name", "category", "cost_price"
        )
    }

    rows = []
    for c in count_list:
        it = item_map.get(c.item_id)
        if not it:
            continue
        counted_qty = float(c.actual_qty or 0)
        mypos_qty = pos_map.get((c.item_id, c.count_date), 0.0)
        variance = counted_qty - mypos_qty
        cost = float(it.cost_price or 0)
        loss_value = variance * cost
        rows.append({
            "count_id": c.id,
            "count_date": str(c.count_date),
            "item_id": c.item_id,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "category": it.category or "",
            "counted_qty": counted_qty,
            "counted_by_id": c.counted_by_id,
            "counted_by_name": (
                c.counted_by.username if c.counted_by_id and c.counted_by else ""
            ),
            "mypos_qty": mypos_qty,
            "variance": variance,
            "cost_price": cost,
            "loss_value": loss_value,
        })

    if request.query_params.get("only_variance") in ("1", "true"):
        rows = [r for r in rows if abs(r["variance"]) > 0.001]

    # Summary computed BEFORE pagination so totals reflect the filtered set.
    total_variance_qty = sum(r["variance"] for r in rows)
    total_loss_value = sum(r["loss_value"] for r in rows if r["loss_value"] < 0)
    total_surplus_value = sum(r["loss_value"] for r in rows if r["loss_value"] > 0)
    summary = {
        "total_events": len(rows),
        "total_variance_qty": total_variance_qty,
        "total_loss_value": total_loss_value,
        "total_surplus_value": total_surplus_value,
        "range_days": (to_date - from_date).days + 1,
    }

    sort_by = request.query_params.get("sort_by", "count_date")
    order = request.query_params.get("order", "desc")
    rows = _sort_rows(rows, sort_by, order, COUNT_HISTORY_SORT_KEYS, "count_date")

    if request.query_params.get("export") == "csv":
        header = [
            "Count date", "Code", "Name", "Category",
            "Counted qty", "MyPOS qty", "Variance",
            "Cost price", "Loss/Surplus value", "Counted by",
        ]

        def iterator():
            for r in rows:
                yield [
                    r["count_date"], r["item_code"], r["item_name"], r["category"],
                    r["counted_qty"], r["mypos_qty"], r["variance"],
                    r["cost_price"], r["loss_value"], r["counted_by_name"],
                ]

        resp = _csv_stream(header, iterator())
        resp["Content-Disposition"] = (
            f'attachment; filename="count-history-detail-{from_date}-to-{to_date}.csv"'
        )
        return resp

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(max(int(request.query_params.get("page_size", 50)), 1), 500)
    except (TypeError, ValueError):
        page_size = 50

    total = len(rows)
    offset = (page - 1) * page_size
    results = rows[offset:offset + page_size]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "outlet_id": outlet.id,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "summary": summary,
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def uncounted_items(request):
    """
    Items that have NOT been counted yet in the open count session for
    (outlet, date). Powers the "See uncounted" modal on the Daily Ops page.

    Query params:
      outlet=<id>            admin override (else user.outlet)
      date=YYYY-MM-DD        session date (default: today)
      page, page_size        standard pagination
      q                      search item_code / item_name
      daily_only=1           restrict to items flagged is_daily_count
      recount_only=1         restrict to items previously rejected today
      sort_by, order         sort by any of UNCOUNTED_SORT_KEYS, asc|desc
      export=csv             stream all matching rows as text/csv (respects
                             all above filters + sort, ignores pagination).
                             Uses `export` not `format` to avoid clashing
                             with DRF's content-negotiation query param.

    Response mirrors the catalog row shape so the frontend can reuse
    existing table components. `count` is total matching rows; `results`
    is one page.
    """
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    target_date = _parse_date(request.query_params.get("date", "")) or date.today()

    # Items already counted for this (outlet, date). We include SUBMITTED and
    # APPROVED — REJECTED counts don't count as "counted" so the item stays
    # in the uncounted list until it's re-counted successfully.
    counted_item_ids = (
        StockCount.objects
        .filter(outlet=outlet, count_date=target_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values_list("item_id", flat=True)
        .distinct()
    )

    qs = (
        Item.objects
        .filter(outlet=outlet, status=Item.Status.ACTIVE)
        .exclude(id__in=counted_item_ids)
    )

    q = request.query_params.get("q", "").strip()
    if q:
        qs = qs.filter(Q(item_code__icontains=q) | Q(item_name__icontains=q))

    if request.query_params.get("daily_only") in ("1", "true", "True"):
        qs = qs.filter(is_daily_count=True)

    # Latest POS snapshot per item for the reference date (best-effort).
    latest_snap = {
        snap.item_id: snap
        for snap in PosSnapshot.objects
            .filter(outlet=outlet, item_id__in=qs.values("id"), snapshot_date=target_date)
    }

    # Items that WERE counted today but got rejected — surfaced with a
    # "Recount requested" chip on the frontend. We keep the most-recent
    # rejection's reason + timestamp so the counter knows why.
    rejected_today = {}
    for sc in (
        StockCount.objects
        .filter(outlet=outlet, count_date=target_date,
                approval_status=StockCount.ApprovalStatus.REJECTED)
        .select_related("counted_by")
        .order_by("item_id", "-counted_at")
    ):
        rejected_today.setdefault(sc.item_id, sc)

    recount_only = request.query_params.get("recount_only") in ("1", "true", "True")
    if recount_only:
        qs = qs.filter(id__in=list(rejected_today.keys()))

    # Materialize all matching items so we can sort by joined values.
    # Bounded by outlet catalog size (~50k items worst case). Fast enough.
    all_items = list(qs)

    # Build the enriched row list
    all_rows = []
    for it in all_items:
        snap = latest_snap.get(it.id)
        rej = rejected_today.get(it.id)
        all_rows.append({
            "item_id": it.id,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "category": it.category,
            "rack_number": it.rack_number,
            "shelf": it.shelf,
            "is_daily_count": it.is_daily_count,
            "is_nbci": it.is_nbci,
            "pos_qty": float(snap.pos_quantity) if snap else None,
            "cost_price": float(snap.cost_price) if snap and snap.cost_price is not None else None,
            "selling_price": float(snap.selling_price) if snap and snap.selling_price is not None else None,
            "snapshot_date": str(snap.snapshot_date) if snap else None,
            "recount_requested": rej is not None,
            "recount_reason": rej.rejection_reason if rej else None,
            "recount_by_at": rej.counted_at.isoformat() if rej and rej.counted_at else None,
        })

    # Sort (default: POS qty desc — biggest uncounted first)
    sort_by = request.query_params.get("sort_by", "pos_qty")
    order = request.query_params.get("order", "desc" if sort_by == "pos_qty" else "asc")
    all_rows = _sort_rows(all_rows, sort_by, order, UNCOUNTED_SORT_KEYS, "pos_qty")

    # CSV mode — stream everything (respects current filter + sort), no pagination
    if request.query_params.get("export") == "csv":
        header = ["Code", "Name", "Category", "Rack", "Shelf",
                  "POS Qty", "Cost", "Sell", "Recount requested", "Recount reason"]

        def iterator():
            for r in all_rows:
                yield [
                    r["item_code"], r["item_name"], r["category"] or "",
                    r["rack_number"] or "", r["shelf"] or "",
                    "" if r["pos_qty"] is None else r["pos_qty"],
                    "" if r["cost_price"] is None else r["cost_price"],
                    "" if r["selling_price"] is None else r["selling_price"],
                    "yes" if r["recount_requested"] else "",
                    r["recount_reason"] or "",
                ]

        resp = _csv_stream(header, iterator())
        resp["Content-Disposition"] = f'attachment; filename="daily-ops-uncounted-{outlet.short_code or outlet.id}-{target_date}.csv"'
        return resp

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(max(int(request.query_params.get("page_size", 25)), 1), 200)
    except (TypeError, ValueError):
        page_size = 25

    total = len(all_rows)
    offset = (page - 1) * page_size
    results = all_rows[offset:offset + page_size]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "outlet_id": outlet.id,
        "date": str(target_date),
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def counter_performance(request):
    """Per-user count performance metrics aggregated from StockCount."""
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    date_from = _parse_date(request.query_params.get("date_from"), date.today() - timedelta(days=30))
    date_to = _parse_date(request.query_params.get("date_to"), date.today())
    if date_to < date_from:
        date_from, date_to = date_to, date_from

    qs = StockCount.objects.filter(
        outlet=outlet,
        count_date__gte=date_from,
        count_date__lte=date_to,
        counted_by__isnull=False,
    )

    stats = (
        qs.values("counted_by_id", "counted_by__username")
        .annotate(
            total_counts=Count("id"),
            approved_counts=Count("id", filter=Q(approval_status=StockCount.ApprovalStatus.APPROVED)),
            rejected_counts=Count("id", filter=Q(approval_status=StockCount.ApprovalStatus.REJECTED)),
            active_days=Count("count_date", distinct=True),
            last_active=Max("count_date"),
        )
        .order_by("-total_counts")
    )

    results = []
    for row in stats:
        total = row["total_counts"]
        approved = row["approved_counts"]
        rejected = row["rejected_counts"]
        days = row["active_days"]
        results.append({
            "user_id": row["counted_by_id"],
            "username": row["counted_by__username"] or "Unknown",
            "total_counts": total,
            "approved_counts": approved,
            "rejected_counts": rejected,
            "pending_counts": total - approved - rejected,
            "approval_rate": round(approved / total * 100, 1) if total else 0,
            "rejection_rate": round(rejected / total * 100, 1) if total else 0,
            "active_days": days,
            "avg_per_day": round(total / days, 1) if days else 0,
            "last_active": str(row["last_active"]) if row["last_active"] else None,
        })

    return Response({
        "date_from": str(date_from),
        "date_to": str(date_to),
        "outlet": outlet.outlet_name if outlet else None,
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def daily_upload_report(request):
    """Per-outlet-per-date aggregation of daily uploads."""
    from django.db.models.functions import Coalesce

    def _parse(raw, default):
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return default

    from django.core.cache import cache

    today = date.today()
    from_date = _parse(request.query_params.get("from_date"), today - timedelta(days=7))
    to_date = _parse(request.query_params.get("to_date"), today)
    outlet_filter = request.query_params.get("outlet")

    cache_key = f"dashboard.daily_upload_report.{from_date.isoformat()}.{to_date.isoformat()}.{outlet_filter or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    snap_qs = PosSnapshot.objects.filter(snapshot_date__gte=from_date, snapshot_date__lte=to_date)
    if outlet_filter:
        snap_qs = snap_qs.filter(outlet_id=outlet_filter)

    line_value = ExpressionWrapper(
        F("pos_quantity") * Coalesce(F("cost_price"), Decimal("0")),
        output_field=DecimalField(max_digits=18, decimal_places=4),
    )
    line_sell = ExpressionWrapper(
        F("pos_quantity") * Coalesce(F("selling_price"), Decimal("0")),
        output_field=DecimalField(max_digits=18, decimal_places=4),
    )

    all_agg = (
        snap_qs
        .values("outlet_id", "snapshot_date")
        .annotate(
            total_items=Count("id"),
            total_cost_value=Sum(line_value),
            total_selling_value=Sum(line_sell),
        )
    )

    neg_agg = (
        snap_qs.filter(pos_quantity__lt=0)
        .values("outlet_id", "snapshot_date")
        .annotate(
            negative_items_count=Count("id"),
            negative_cost_value=Sum(line_value),
            negative_selling_value=Sum(line_sell),
        )
    )
    neg_map = {(r["outlet_id"], r["snapshot_date"]): r for r in neg_agg}

    upload_qs = UploadLog.objects.filter(
        snapshot_date__gte=from_date, snapshot_date__lte=to_date,
        status=UploadLog.Status.SUCCESS,
    )
    if outlet_filter:
        upload_qs = upload_qs.filter(outlet_id=outlet_filter)
    upload_map = {}
    for u in upload_qs.values("outlet_id", "snapshot_date").annotate(
        new_items_count=Sum("new_items_count"),
        filenames=Max("filename"),
        uploaded_at=Max("uploaded_at"),
    ):
        upload_map[(u["outlet_id"], u["snapshot_date"])] = u

    outlet_names = dict(Outlet.objects.values_list("id", "outlet_name"))

    def _pct(profit, sell):
        if sell is None or sell == 0:
            return None
        return float(profit) / float(sell) * 100.0

    rows = []
    for a in all_agg:
        key = (a["outlet_id"], a["snapshot_date"])
        total_cost = a["total_cost_value"] or Decimal("0")
        total_sell = a["total_selling_value"] or Decimal("0")
        gp_value = total_sell - total_cost

        neg = neg_map.get(key, {})
        neg_cost = neg.get("negative_cost_value") or Decimal("0")
        neg_sell = neg.get("negative_selling_value") or Decimal("0")
        neg_gp_value = neg_sell - neg_cost

        upload = upload_map.get(key, {})

        rows.append({
            "outlet_id": a["outlet_id"],
            "outlet_name": outlet_names.get(a["outlet_id"], ""),
            "upload_date": str(a["snapshot_date"]),
            "new_items_count": upload.get("new_items_count") or 0,
            "total_items": a["total_items"],
            "total_cost_value": float(total_cost),
            "total_selling_value": float(total_sell),
            "gross_profit_value": float(gp_value),
            "gross_profit_pct": _pct(gp_value, total_sell),
            "negative_items_count": neg.get("negative_items_count") or 0,
            "negative_cost_value": float(neg_cost),
            "negative_selling_value": float(neg_sell),
            "negative_gross_profit_value": float(neg_gp_value),
            "negative_gross_profit_pct": _pct(neg_gp_value, neg_sell),
            "filename": upload.get("filenames") or "",
            "uploaded_at": upload.get("uploaded_at").isoformat() if upload.get("uploaded_at") else None,
        })

    rows.sort(key=lambda r: (r["upload_date"], r["outlet_name"]), reverse=True)

    payload = {
        "from_date": str(from_date),
        "to_date": str(to_date),
        "results": rows,
    }
    cache.set(cache_key, payload, 60)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAdmin])
def counted_items_report(request):
    """
    For a given outlet and date range, return two lists:
      - counted_items: items that have at least one StockCount in the range,
        with their last counted date, summed qty, and latest cost/sell price.
      - uncounted_items: items in the outlet NOT counted in the range, with
        latest cost/sell price.

    Query params:
      outlet: outlet id (required)
      from_date, to_date: YYYY-MM-DD (default last 7 days → today)
    """
    outlet_id = request.query_params.get("outlet")
    if not outlet_id:
        return Response({"detail": "outlet is required."}, status=400)
    today = date.today()
    from_date = _parse_date(request.query_params.get("from_date"), today - timedelta(days=7))
    to_date = _parse_date(request.query_params.get("to_date"), today)

    # Aggregate counts in the range (exclude rejected) per item.
    count_agg = (
        StockCount.objects
        .filter(outlet_id=outlet_id, count_date__gte=from_date, count_date__lte=to_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id")
        .annotate(
            last_counted_date=Max("count_date"),
            last_counted_at=Max("counted_at"),
            total_counted_qty=Sum("actual_qty"),
            count_entries=Count("id"),
        )
    )
    count_map = {r["item_id"]: r for r in count_agg}

    # Latest PosSnapshot per item (on or before to_date) for cost/sell price.
    pos_map = {}
    for s in (
        PosSnapshot.objects
        .filter(outlet_id=outlet_id, snapshot_date__lte=to_date)
        .order_by("item_id", "-snapshot_date")
        .only("item_id", "snapshot_date", "pos_quantity", "cost_price", "selling_price")
    ):
        if s.item_id not in pos_map:
            pos_map[s.item_id] = s

    items = (
        Item.objects.filter(outlet_id=outlet_id)
        .only("id", "item_code", "item_name", "category")
    )

    counted_items = []
    uncounted_items = []
    for it in items:
        snap = pos_map.get(it.id)
        cost = float(snap.cost_price) if snap and snap.cost_price is not None else None
        sell = float(snap.selling_price) if snap and snap.selling_price is not None else None
        pos_qty = float(snap.pos_quantity) if snap else None

        base = {
            "item_id": it.id,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "category": it.category or "",
            "cost_price": cost,
            "selling_price": sell,
            "pos_qty": pos_qty,
        }
        cnt = count_map.get(it.id)
        if cnt:
            counted_items.append({
                **base,
                "last_counted_date": str(cnt["last_counted_date"]) if cnt["last_counted_date"] else None,
                "last_counted_at": cnt["last_counted_at"].isoformat() if cnt["last_counted_at"] else None,
                "total_counted_qty": float(cnt["total_counted_qty"] or 0),
                "count_entries": int(cnt["count_entries"] or 0),
            })
        else:
            uncounted_items.append(base)

    counted_items.sort(key=lambda r: r["last_counted_date"] or "", reverse=True)
    uncounted_items.sort(key=lambda r: r["item_code"])

    return Response({
        "outlet_id": int(outlet_id),
        "from_date": str(from_date),
        "to_date": str(to_date),
        "counted_count": len(counted_items),
        "uncounted_count": len(uncounted_items),
        "counted_items": counted_items,
        "uncounted_items": uncounted_items,
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def stock_variance_report(request):
    """
    Compare ending POS-snapshot balance against manual stock counts for an
    outlet on a given date. Counts for the same item across multiple
    locations are summed. Returns per-item variance qty and the cost/selling
    value of that variance.

    Query params:
      outlet: outlet id (required)
      date:   YYYY-MM-DD (defaults to today)
    """
    outlet_id = request.query_params.get("outlet")
    if not outlet_id:
        return Response({"detail": "outlet is required."}, status=400)
    snap_date = _parse_date(request.query_params.get("date"), date.today())

    # Latest PosSnapshot on or before the date, per item. With multiple
    # uploads/day allowed, we also tiebreak by uploaded_at DESC so the most
    # recent upload of the day wins.
    snap_qs = (
        PosSnapshot.objects
        .filter(outlet_id=outlet_id, snapshot_date__lte=snap_date)
        .order_by("item_id", "-snapshot_date", "-uploaded_at")
    )
    pos_map = {}
    for s in snap_qs:
        if s.item_id not in pos_map:
            pos_map[s.item_id] = s

    # Aggregated counts for that date (sum across locations, non-rejected).
    count_rows = (
        StockCount.objects
        .filter(outlet_id=outlet_id, count_date=snap_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id")
        .annotate(
            counted_qty=Sum("actual_qty"),
            location_count=Count("id"),
        )
    )
    count_map = {r["item_id"]: r for r in count_rows}

    # Per-location detail for display.
    loc_rows = (
        StockCount.objects
        .filter(outlet_id=outlet_id, count_date=snap_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id", "location_tag")
        .annotate(qty=Sum("actual_qty"))
    )
    locations_by_item = {}
    for r in loc_rows:
        locations_by_item.setdefault(r["item_id"], []).append({
            "location_tag": r["location_tag"] or "—",
            "qty": float(r["qty"] or 0),
        })

    item_ids = set(pos_map.keys()) | set(count_map.keys())
    items = Item.objects.filter(id__in=item_ids).only("id", "item_code", "item_name")
    item_by_id = {i.id: i for i in items}

    results = []
    totals = {
        "pos_qty": 0.0, "counted_qty": 0.0, "variance_qty": 0.0,
        "variance_cost_value": 0.0, "variance_selling_value": 0.0,
    }
    for iid in item_ids:
        it = item_by_id.get(iid)
        if not it:
            continue
        snap = pos_map.get(iid)
        pos_qty = float(snap.pos_quantity) if snap else 0.0
        cost = float(snap.cost_price) if snap and snap.cost_price is not None else None
        sell = float(snap.selling_price) if snap and snap.selling_price is not None else None

        cnt = count_map.get(iid)
        counted_qty = float(cnt["counted_qty"] or 0) if cnt else 0.0
        loc_count = int(cnt["location_count"]) if cnt else 0

        variance_qty = counted_qty - pos_qty
        variance_cost = variance_qty * cost if cost is not None else None
        variance_sell = variance_qty * sell if sell is not None else None

        results.append({
            "item_id": iid,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "pos_qty": pos_qty,
            "counted_qty": counted_qty,
            "variance_qty": variance_qty,
            "cost_price": cost,
            "selling_price": sell,
            "variance_cost_value": variance_cost,
            "variance_selling_value": variance_sell,
            "location_count": loc_count,
            "locations": locations_by_item.get(iid, []),
            "snapshot_date": str(snap.snapshot_date) if snap else None,
            "has_count": cnt is not None,
        })
        totals["pos_qty"] += pos_qty
        totals["counted_qty"] += counted_qty
        totals["variance_qty"] += variance_qty
        if variance_cost is not None:
            totals["variance_cost_value"] += variance_cost
        if variance_sell is not None:
            totals["variance_selling_value"] += variance_sell

    results.sort(key=lambda r: abs(r["variance_qty"]), reverse=True)

    return Response({
        "outlet_id": int(outlet_id),
        "date": str(snap_date),
        "count": len(results),
        "totals": totals,
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def count_coverage_report(request):
    """
    Outlet- and date-range-wise count coverage.

    For each item with at least one (non-rejected) count whose `counted_at`
    falls inside the range, attach the latest PosSnapshot for that
    (outlet, item) where snapshot.uploaded_at <= count.counted_at — i.e. the
    snapshot the counter was effectively comparing against. Multi-upload per
    day is fully supported via this temporal match.

    Totals reported:
      total_items     — active items in outlet (master catalog)
      counted_items   — distinct items counted in range
      uncounted_items — total_items - counted_items
      coverage_pct    — counted / total * 100

    Query params:
      outlet     : outlet id (required)
      date_from  : YYYY-MM-DD (defaults to today - 7d)
      date_to    : YYYY-MM-DD (defaults to today)
    """
    outlet_id = request.query_params.get("outlet")
    if not outlet_id:
        return Response({"detail": "outlet is required."}, status=400)

    # Non-admin users are scoped to their own outlet — silently override any
    # outlet id they pass so the dropdown can't be used to peek at siblings.
    if request.user.role not in ("admin", "super_admin"):
        if not request.user.outlet_id:
            return Response({"detail": "User has no outlet assigned."}, status=400)
        outlet_id = str(request.user.outlet_id)

    today = date.today()
    date_from = _parse_date(request.query_params.get("date_from"), today - timedelta(days=7))
    date_to = _parse_date(request.query_params.get("date_to"), today)
    if date_from > date_to:
        date_from, date_to = date_to, date_from

    # Range as timestamps: include the whole of date_to.
    range_start = datetime.combine(date_from, datetime.min.time())
    range_end = datetime.combine(date_to, datetime.max.time())
    if timezone.is_aware(timezone.now()):
        tz = timezone.get_current_timezone()
        range_start = timezone.make_aware(range_start, tz)
        range_end = timezone.make_aware(range_end, tz)

    # 1. Aggregate counts in range, per item: total counted_qty, last
    #    counted_at, location entries.
    count_rows = (
        StockCount.objects
        .filter(outlet_id=outlet_id, counted_at__gte=range_start, counted_at__lte=range_end)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id")
        .annotate(
            counted_qty=Sum("actual_qty"),
            location_count=Count("id"),
            last_counted_at=Max("counted_at"),
        )
    )
    count_map = {r["item_id"]: r for r in count_rows}

    if not count_map:
        # Fast path — nothing counted in range.
        total_items = Item.objects.filter(outlet_id=outlet_id).count()
        return Response({
            "outlet_id": int(outlet_id),
            "date_from": str(date_from),
            "date_to": str(date_to),
            "totals": {
                "total_items": total_items,
                "counted_items": 0,
                "uncounted_items": total_items,
                "coverage_pct": 0.0,
            },
            "results": [],
        })

    # 2. Per-location detail for the locations dialog.
    loc_rows = (
        StockCount.objects
        .filter(outlet_id=outlet_id, counted_at__gte=range_start, counted_at__lte=range_end)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id", "location_tag")
        .annotate(qty=Sum("actual_qty"))
    )
    locations_by_item = {}
    for r in loc_rows:
        locations_by_item.setdefault(r["item_id"], []).append({
            "location_tag": r["location_tag"] or "—",
            "qty": float(r["qty"] or 0),
        })

    # 3. For each counted item, find the latest snapshot uploaded at or
    #    before its last_counted_at. Done with a single ORM scan over all
    #    snapshots for this outlet + items, sliced in Python (cheap: bounded
    #    by counted_items * batches/day).
    item_ids = list(count_map.keys())
    snap_rows = (
        PosSnapshot.objects
        .filter(outlet_id=outlet_id, item_id__in=item_ids)
        .order_by("item_id", "-uploaded_at")
        .values("item_id", "uploaded_at", "pos_quantity", "cost_price", "selling_price", "snapshot_date")
    )
    snaps_by_item = {}
    for s in snap_rows:
        snaps_by_item.setdefault(s["item_id"], []).append(s)

    def _pick_snapshot(iid, ref_ts):
        """Latest snapshot for `iid` with uploaded_at <= ref_ts (or None)."""
        for s in snaps_by_item.get(iid, []):
            if s["uploaded_at"] <= ref_ts:
                return s
        return None

    # 4. Item master rows (code + name).
    items = Item.objects.filter(id__in=item_ids).only("id", "item_code", "item_name")
    item_by_id = {i.id: i for i in items}

    # 5. Build response rows.
    results = []
    for iid, cnt in count_map.items():
        it = item_by_id.get(iid)
        if not it:
            continue
        counted_qty = float(cnt["counted_qty"] or 0)
        last_counted_at = cnt["last_counted_at"]
        snap = _pick_snapshot(iid, last_counted_at)
        pos_qty = float(snap["pos_quantity"]) if snap else None
        cost = float(snap["cost_price"]) if snap and snap["cost_price"] is not None else None
        sell = float(snap["selling_price"]) if snap and snap["selling_price"] is not None else None
        variance_qty = (counted_qty - pos_qty) if pos_qty is not None else None
        variance_cost = (variance_qty * cost) if (variance_qty is not None and cost is not None) else None
        variance_sell = (variance_qty * sell) if (variance_qty is not None and sell is not None) else None

        results.append({
            "item_id": iid,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "pos_qty": pos_qty,
            "counted_qty": counted_qty,
            "variance_qty": variance_qty,
            "cost_price": cost,
            "selling_price": sell,
            "variance_cost_value": variance_cost,
            "variance_selling_value": variance_sell,
            "location_count": int(cnt["location_count"] or 0),
            "locations": locations_by_item.get(iid, []),
            "snapshot_uploaded_at": snap["uploaded_at"].isoformat() if snap else None,
            "snapshot_date": str(snap["snapshot_date"]) if snap else None,
            "counted_at": last_counted_at.isoformat() if last_counted_at else None,
        })

    results.sort(key=lambda r: r["item_code"])

    # 6. Totals.
    total_items = Item.objects.filter(outlet_id=outlet_id).count()
    counted_items = len(results)
    uncounted_items = max(0, total_items - counted_items)
    coverage_pct = round((counted_items / total_items) * 100, 2) if total_items else 0.0

    return Response({
        "outlet_id": int(outlet_id),
        "date_from": str(date_from),
        "date_to": str(date_to),
        "totals": {
            "total_items": total_items,
            "counted_items": counted_items,
            "uncounted_items": uncounted_items,
            "coverage_pct": coverage_pct,
        },
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def daily_upload_new_items(request):
    """
    List of new items introduced by upload(s) for a given outlet + snapshot_date.

    Query params:
      outlet: outlet id (required)
      date:   snapshot date YYYY-MM-DD (required)
    """
    outlet_id = request.query_params.get("outlet")
    date_str = request.query_params.get("date")
    snap_date = _parse_date(date_str)
    if not outlet_id or not snap_date:
        return Response(
            {"detail": "outlet and date are required."},
            status=400,
        )

    log_ids = list(
        UploadLog.objects.filter(
            outlet_id=outlet_id,
            snapshot_date=snap_date,
            status=UploadLog.Status.SUCCESS,
        ).values_list("id", flat=True)
    )
    items = (
        Item.objects.filter(outlet_id=outlet_id, upload_log_id__in=log_ids)
        .only("id", "item_code", "item_name")
        .order_by("item_code")
    )
    item_ids = [i.id for i in items]

    snaps = {
        s.item_id: s
        for s in PosSnapshot.objects.filter(
            outlet_id=outlet_id, item_id__in=item_ids, snapshot_date=snap_date
        )
    }

    results = []
    for it in items:
        s = snaps.get(it.id)
        results.append({
            "item_code": it.item_code,
            "item_name": it.item_name,
            "cost_price": float(s.cost_price) if s and s.cost_price is not None else None,
            "selling_price": float(s.selling_price) if s and s.selling_price is not None else None,
            "pos_quantity": float(s.pos_quantity) if s and s.pos_quantity is not None else None,
        })

    return Response({
        "outlet_id": int(outlet_id),
        "date": str(snap_date),
        "count": len(results),
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def mobile_devices_report(request):
    """Admin report: mobile-device activity."""
    qs = MobileDevice.objects.select_related("last_user", "last_outlet").all()

    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(device_uuid__icontains=q)
            | Q(last_user__username__icontains=q)
            | Q(last_outlet__outlet_name__icontains=q)
        )

    outlet_id = request.query_params.get("outlet")
    if outlet_id:
        qs = qs.filter(last_outlet_id=outlet_id)

    rows = [
        {
            "id": d.id,
            "device_uuid": d.device_uuid,
            "platform": d.platform,
            "app_version": d.app_version,
            "first_seen_at": d.first_seen_at.isoformat(),
            "last_seen_at": d.last_seen_at.isoformat(),
            "last_user_id": d.last_user_id,
            "last_user_username": d.last_user.username if d.last_user else None,
            "last_outlet_id": d.last_outlet_id,
            "last_outlet_name": d.last_outlet.outlet_name if d.last_outlet else None,
            "total_counts": d.total_counts,
            "total_assigns": d.total_assigns,
        }
        for d in qs
    ]

    return Response({"count": len(rows), "results": rows})


# -------------------------------------------------------------------
# Count approval workflow
# -------------------------------------------------------------------

def _require_approve_permission(request):
    if not user_has_permission(request.user, "counts.approve"):
        return Response({"detail": "You do not have permission to approve counts."}, status=403)
    return None


@api_view(["POST"])
@permission_classes([IsManager])
def approve_count(request, count_id):
    """Manager approves a submitted stock count."""
    deny = _require_approve_permission(request)
    if deny:
        return deny

    sc = get_object_or_404(StockCount, pk=count_id)

    outlet = _resolve_outlet(request)
    if outlet and sc.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Cross-outlet access denied."}, status=403)

    if sc.approval_status == StockCount.ApprovalStatus.APPROVED:
        return Response({"detail": "Already approved."}, status=400)
    if sc.approval_status == StockCount.ApprovalStatus.REJECTED:
        return Response({"detail": "Cannot approve a rejected count; ask the counter to re-submit."}, status=400)

    before = snapshot_stock_count(sc)
    sc.approval_status = StockCount.ApprovalStatus.APPROVED
    sc.approved_by = request.user
    sc.approved_at = timezone.now()
    sc.rejection_reason = ""
    sc.save(update_fields=["approval_status", "approved_by", "approved_at", "rejection_reason"])
    record_audit(
        user=request.user, action="stock_count.approve", entity=sc,
        before=before, after=snapshot_stock_count(sc),
    )
    return Response(StockCountSerializer(sc).data)


@api_view(["POST"])
@permission_classes([IsManager])
def reject_count(request, count_id):
    """Manager rejects a submitted stock count with a reason."""
    deny = _require_approve_permission(request)
    if deny:
        return deny

    reason = (request.data.get("reason") or "").strip()
    if not reason:
        return Response({"detail": "A rejection reason is required."}, status=400)

    sc = get_object_or_404(StockCount, pk=count_id)
    if sc.approval_status not in (StockCount.ApprovalStatus.SUBMITTED, StockCount.ApprovalStatus.DRAFT):
        return Response({"detail": f"Cannot reject a count in status '{sc.approval_status}'."}, status=400)

    before = snapshot_stock_count(sc)
    sc.approval_status = StockCount.ApprovalStatus.REJECTED
    sc.rejection_reason = reason[:500]
    sc.approved_by = request.user
    sc.approved_at = timezone.now()
    sc.save(update_fields=["approval_status", "rejection_reason", "approved_by", "approved_at"])
    record_audit(
        user=request.user, action="stock_count.reject", entity=sc,
        before=before, after=snapshot_stock_count(sc), reason=reason,
    )
    return Response(StockCountSerializer(sc).data)


@api_view(["POST"])
@permission_classes([IsManager])
def bulk_approve_counts(request):
    """Approve many submitted counts at once. Body: {"ids": [1,2,3]}"""
    deny = _require_approve_permission(request)
    if deny:
        return deny

    ids = request.data.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return Response({"detail": "ids must be a non-empty list."}, status=400)

    qs = StockCount.objects.filter(
        pk__in=ids,
        approval_status__in=[StockCount.ApprovalStatus.SUBMITTED, StockCount.ApprovalStatus.DRAFT],
    )
    outlet = _resolve_outlet(request)
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)

    now = timezone.now()
    updated = []
    with transaction.atomic():
        for sc in qs.select_for_update():
            before = snapshot_stock_count(sc)
            sc.approval_status = StockCount.ApprovalStatus.APPROVED
            sc.approved_by = request.user
            sc.approved_at = now
            sc.rejection_reason = ""
            sc.save(update_fields=["approval_status", "approved_by", "approved_at", "rejection_reason"])
            record_audit(
                user=request.user, action="stock_count.bulk_approve", entity=sc,
                before=before, after=snapshot_stock_count(sc),
            )
            updated.append(sc.id)

    return Response({"approved": updated, "count": len(updated)})


# -------------------------------------------------------------------
# Count sessions
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsManager])
def list_count_sessions(request):
    """List count sessions for the manager's outlet."""
    outlet = _resolve_outlet(request)

    qs = CountSession.objects.all()
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)
    elif request.query_params.get("outlet"):
        qs = qs.filter(outlet_id=request.query_params["outlet"])

    status_filter = request.query_params.get("status", "").strip()
    if status_filter:
        qs = qs.filter(status=status_filter)

    df = _parse_date(request.query_params.get("date_from"))
    dt = _parse_date(request.query_params.get("date_to"))
    if df:
        qs = qs.filter(count_date__gte=df)
    if dt:
        qs = qs.filter(count_date__lte=dt)

    qs = qs.select_related("outlet", "started_by", "closed_by")

    # Annotate counts per session
    session_ids = list(qs.values_list("id", flat=True))
    count_stats = {}
    for row in StockCount.objects.filter(session_id__in=session_ids).values("session_id", "approval_status").annotate(n=Count("id")):
        d = count_stats.setdefault(row["session_id"], {"count_total": 0, "submitted_count": 0, "approved_count": 0})
        d["count_total"] += row["n"]
        if row["approval_status"] == "submitted":
            d["submitted_count"] = row["n"]
        elif row["approval_status"] == "approved":
            d["approved_count"] = row["n"]

    var_stats = {}
    for row in VarianceRecord.objects.filter(session_id__in=session_ids).values("session_id", "status").annotate(n=Count("id")):
        d = var_stats.setdefault(row["session_id"], {"variance_total": 0, "variance_pending": 0})
        d["variance_total"] += row["n"]
        if row["status"] in ("pending", "investigating"):
            d["variance_pending"] += row["n"]

    results = []
    for s in qs.order_by("-count_date", "-started_at"):
        stats = count_stats.get(s.id, {})
        vs = var_stats.get(s.id, {})
        results.append({
            "id": s.id,
            "outlet": s.outlet_id,
            "outlet_name": s.outlet.outlet_name,
            "count_date": str(s.count_date),
            "status": s.status,
            "started_by_username": s.started_by.username if s.started_by else None,
            "started_at": s.started_at.isoformat(),
            "closed_by_username": s.closed_by.username if s.closed_by else None,
            "closed_at": s.closed_at.isoformat() if s.closed_at else None,
            "note": s.note,
            "count_total": stats.get("count_total", 0),
            "submitted_count": stats.get("submitted_count", 0),
            "approved_count": stats.get("approved_count", 0),
            "variance_total": vs.get("variance_total", 0),
            "variance_pending": vs.get("variance_pending", 0),
        })

    return Response({"count": len(results), "results": results})


@api_view(["GET"])
@permission_classes([IsManager])
def count_session_detail(request, session_id):
    """Return metadata + aggregated stats for a single CountSession."""
    session = get_object_or_404(CountSession, pk=session_id)

    outlet = _resolve_outlet(request)
    if outlet and session.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Cross-outlet access denied."}, status=403)

    count_stats = {"count_total": 0, "submitted_count": 0, "approved_count": 0, "rejected_count": 0}
    for row in StockCount.objects.filter(session_id=session_id).values("approval_status").annotate(n=Count("id")):
        count_stats["count_total"] += row["n"]
        if row["approval_status"] == "submitted":
            count_stats["submitted_count"] = row["n"]
        elif row["approval_status"] == "approved":
            count_stats["approved_count"] = row["n"]
        elif row["approval_status"] == "rejected":
            count_stats["rejected_count"] = row["n"]

    var_stats = {"variance_total": 0, "variance_pending": 0}
    for row in VarianceRecord.objects.filter(session_id=session_id).values("status").annotate(n=Count("id")):
        var_stats["variance_total"] += row["n"]
        if row["status"] in ("pending", "investigating"):
            var_stats["variance_pending"] += row["n"]

    return Response({
        "id": session.id,
        "outlet": session.outlet_id,
        "outlet_name": session.outlet.outlet_name,
        "count_date": str(session.count_date),
        "status": session.status,
        "started_by_username": session.started_by.username if session.started_by else None,
        "started_at": session.started_at.isoformat(),
        "closed_by_username": session.closed_by.username if session.closed_by else None,
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
        "note": session.note,
        **count_stats,
        **var_stats,
    })


@api_view(["POST"])
@permission_classes([IsManager])
def close_count_session(request, session_id):
    """
    Close a CountSession: approve any remaining submitted counts, then
    generate VarianceRecord rows for every item in the POS snapshot.
    Idempotent — re-closing a closed session returns the same data.
    """
    deny = _require_approve_permission(request)
    if deny:
        return deny

    session = get_object_or_404(CountSession, pk=session_id)

    outlet = _resolve_outlet(request)
    if outlet and session.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Cross-outlet access denied."}, status=403)

    if session.status == CountSession.Status.CLOSED:
        return Response({
            "detail": "Session already closed.",
            "session_id": session.id,
            "variance_generated": VarianceRecord.objects.filter(session=session).count(),
        }, status=200)

    from .services import finalize_count_session
    result = finalize_count_session(session, closed_by=request.user)

    return Response({
        "session_id": session.id,
        "status": session.status,
        "variance_generated": VarianceRecord.objects.filter(session=session).count(),
        "variance_created_now": result["variances_created"],
    })


# -------------------------------------------------------------------
# Variance records
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsManager])
def list_variance_records(request):
    """List variance records, filterable by status/session/date range."""
    outlet = _resolve_outlet(request)

    qs = VarianceRecord.objects.select_related("item", "outlet", "resolved_by")
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)
    elif request.query_params.get("outlet"):
        qs = qs.filter(outlet_id=request.query_params["outlet"])

    session_id = request.query_params.get("session")
    if session_id:
        qs = qs.filter(session_id=session_id)

    # only_counted=1 hides rows where counted_qty is 0 or NULL. These are
    # "we haven't counted this item yet" false variances — they clutter the
    # reconciliation view and swamp the truly-counted differences. Every
    # UI surfacing variances (Daily Ops, Variance Reconciliation) should
    # opt into this filter.
    if request.query_params.get("only_counted") in ("1", "true", "True"):
        qs = qs.filter(counted_qty__gt=0)

    statuses = request.query_params.getlist("status")
    if statuses:
        qs = qs.filter(status__in=statuses)

    df = _parse_date(request.query_params.get("date_from"))
    dt = _parse_date(request.query_params.get("date_to"))
    if df:
        qs = qs.filter(count_date__gte=df)
    if dt:
        qs = qs.filter(count_date__lte=dt)

    search = (request.query_params.get("search") or "").strip()
    if search:
        qs = qs.filter(
            Q(item__item_code__icontains=search) | Q(item__item_name__icontains=search)
        )

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = min(int(request.query_params.get("page_size", 50)), 200)
    except (ValueError, TypeError):
        page_size = 50

    qs = qs.order_by("-count_date", "-id")
    total = qs.count()
    offset = (page - 1) * page_size
    page_qs = qs[offset: offset + page_size]

    data = VarianceRecordSerializer(page_qs, many=True).data
    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": data,
    })


VALID_RESOLVE_STATUSES = {
    VarianceRecord.Status.INVESTIGATING,
    VarianceRecord.Status.EXPLAINED,
    VarianceRecord.Status.ADJUSTED,
    VarianceRecord.Status.WRITTEN_OFF,
    VarianceRecord.Status.CLOSED,
}


@api_view(["POST"])
@permission_classes([IsManager])
def resolve_variance(request, record_id):
    """
    Resolve a variance record. Body:
      { "status": "explained|investigating|adjusted|written_off|closed",
        "note": "...", "adjustment_qty": <decimal optional> }
    """
    deny = _require_approve_permission(request)
    if deny:
        return deny

    rec = get_object_or_404(VarianceRecord, pk=record_id)

    outlet = _resolve_outlet(request)
    if outlet and rec.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Cross-outlet access denied."}, status=403)

    new_status = (request.data.get("status") or "").strip()
    if new_status not in VALID_RESOLVE_STATUSES:
        return Response({"detail": f"Invalid status. Allowed: {sorted(VALID_RESOLVE_STATUSES)}"}, status=400)

    note = (request.data.get("note") or "").strip()
    raw_adj = request.data.get("adjustment_qty")
    try:
        adjustment_qty = Decimal(str(raw_adj)) if raw_adj not in (None, "") else rec.adjustment_qty
    except Exception:
        return Response({"detail": "adjustment_qty must be numeric."}, status=400)

    before = snapshot_variance(rec)
    rec.status = new_status
    rec.resolution_note = note[:1000]
    rec.adjustment_qty = adjustment_qty
    rec.resolved_by = request.user
    rec.resolved_at = timezone.now()
    rec.save(update_fields=[
        "status", "resolution_note", "adjustment_qty", "resolved_by", "resolved_at", "updated_at",
    ])

    # If the manager chose "adjusted" and provided an adjustment qty, apply it
    # to the Item.on_hand ledger so the POS inventory tracks the correction.
    if new_status == VarianceRecord.Status.ADJUSTED and adjustment_qty and adjustment_qty != 0:
        from apps.items.inventory import apply_movement
        from apps.items.models import StockMovement
        try:
            apply_movement(
                item=rec.item, outlet=rec.outlet,
                kind=StockMovement.Kind.VARIANCE,
                qty_change=adjustment_qty,
                user=request.user,
                ref_type="VarianceRecord", ref_id=rec.id,
                note=f"Variance adjust {rec.item.item_code}: {note[:200]}",
            )
        except Exception as e:
            # Don't fail the status update just because inventory tracking fell over
            record_audit(user=request.user, action="variance.adjust_stock_failed",
                         entity=rec, extra={"error": str(e)})

    record_audit(
        user=request.user, action="variance.resolve", entity=rec,
        before=before, after=snapshot_variance(rec), reason=note,
    )
    return Response(VarianceRecordSerializer(rec).data)


@api_view(["POST"])
@permission_classes([IsManager])
def bulk_resolve_variance(request):
    """Bulk-resolve. Body: {"ids":[...], "status":"...", "note":"..."}"""
    deny = _require_approve_permission(request)
    if deny:
        return deny

    ids = request.data.get("ids") or []
    new_status = (request.data.get("status") or "").strip()
    note = (request.data.get("note") or "").strip()
    if not isinstance(ids, list) or not ids:
        return Response({"detail": "ids must be a non-empty list."}, status=400)
    if new_status not in VALID_RESOLVE_STATUSES:
        return Response({"detail": "Invalid status."}, status=400)

    qs = VarianceRecord.objects.filter(pk__in=ids)
    outlet = _resolve_outlet(request)
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)

    now = timezone.now()
    updated = []
    with transaction.atomic():
        for rec in qs.select_for_update():
            before = snapshot_variance(rec)
            rec.status = new_status
            rec.resolution_note = note[:1000]
            rec.resolved_by = request.user
            rec.resolved_at = now
            rec.save(update_fields=["status", "resolution_note", "resolved_by", "resolved_at", "updated_at"])
            record_audit(
                user=request.user, action="variance.bulk_resolve", entity=rec,
                before=before, after=snapshot_variance(rec), reason=note,
            )
            updated.append(rec.id)

    return Response({"resolved": updated, "count": len(updated)})


@api_view(["GET"])
@permission_classes([IsManager])
def coverage_by_day(request):
    """
    Day-by-day count coverage for an outlet.

    For each day in the range, return:
      - date
      - items_counted (distinct items with at least one non-rejected count)
      - approved_count (counts already approved, for variance)
      - submitted_count (counts still awaiting approval)
    Plus the constant total_items (active items in the outlet's master
    catalog at the time the report is run).

    Drives the Manager Dashboard's "Daily count coverage" panel — gives a
    manager a single-glance view of "did the team count today, and how
    does today compare to the last 14 days?"
    """
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    today = date.today()
    from_date = _parse_date(request.query_params.get("from_date")) or (today - timedelta(days=13))
    to_date = _parse_date(request.query_params.get("to_date")) or today
    if to_date < from_date:
        from_date, to_date = to_date, from_date

    total_items = Item.objects.filter(outlet=outlet, status=Item.Status.ACTIVE).count()

    rows = (
        StockCount.objects
        .filter(outlet=outlet, count_date__gte=from_date, count_date__lte=to_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("count_date", "approval_status")
        .annotate(items=Count("item_id", distinct=True), entries=Count("id"))
    )

    per_day = {}
    for r in rows:
        d = str(r["count_date"])
        slot = per_day.setdefault(d, {
            "date": d,
            "items_counted": 0,
            "approved_count": 0,
            "submitted_count": 0,
        })
        slot["items_counted"] = max(slot["items_counted"], r["items"])
        if r["approval_status"] == StockCount.ApprovalStatus.APPROVED:
            slot["approved_count"] = r["entries"]
        elif r["approval_status"] == StockCount.ApprovalStatus.SUBMITTED:
            slot["submitted_count"] = r["entries"]

    # The above max() under-reports items_counted when a day has counts in
    # multiple statuses — recompute it as one distinct-item query per day.
    distinct_per_day = (
        StockCount.objects
        .filter(outlet=outlet, count_date__gte=from_date, count_date__lte=to_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("count_date")
        .annotate(distinct_items=Count("item_id", distinct=True))
    )
    for r in distinct_per_day:
        d = str(r["count_date"])
        if d in per_day:
            per_day[d]["items_counted"] = r["distinct_items"]

    # Emit one row per day in range so the chart/table has no gaps.
    days = []
    cur = from_date
    while cur <= to_date:
        d = str(cur)
        slot = per_day.get(d, {
            "date": d,
            "items_counted": 0,
            "approved_count": 0,
            "submitted_count": 0,
        })
        slot["pct"] = round(slot["items_counted"] / total_items * 100, 1) if total_items else 0
        days.append(slot)
        cur += timedelta(days=1)

    return Response({
        "outlet_id": outlet.id,
        "outlet_name": outlet.outlet_name,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "total_items": total_items,
        "days": days,
    })


# =============================================================================
# Manager Dashboard v2 — three aggregate endpoints powering the redesigned page.
# All three respect the outlet the caller has scope for (manager: own outlet,
# admin: ?outlet= override) and a common time range (?from=&to=, default 14d).
# =============================================================================
def _dash_range(request, default_days=14):
    to_date = _parse_date(request.query_params.get("to", "")) or date.today()
    from_date = _parse_date(request.query_params.get("from", "")) or to_date - timedelta(days=default_days - 1)
    if from_date > to_date:
        from_date, to_date = to_date, from_date
    return from_date, to_date


@api_view(["GET"])
@permission_classes([IsManager])
def manager_summary(request):
    """
    One aggregate call that powers the KPI strip + alerts panel on the
    Manager Dashboard. Includes today's snapshot AND four alert counts.
    Every field degrades gracefully when the upstream data isn't
    uploaded (returns 0 or null, not an error).
    """
    from apps.uploads.models import SalesLine, SalesReturnLine
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    today = date.today()

    # --- Today's sales aggregates (SalesLine sum, minus returns if any) ---
    sales_agg = SalesLine.objects.filter(outlet=outlet, txn_date=today).aggregate(
        gross_sales=Sum("amount"),
        items_sold=Sum("qty"),
    )
    returns_val = SalesReturnLine.objects.filter(outlet=outlet, txn_date=today).aggregate(
        v=Sum("gross_value"),
    )["v"] or Decimal("0")

    gross_sales = sales_agg["gross_sales"] or Decimal("0")
    # SalesLine has no cost column so we approximate via matching PosSnapshot
    # cost_price for the invoice items. For MVP the GP calc is best-effort:
    # if we can't join, we hide the GP card. Cheap approximation via SUM.
    # Instead of expensive per-item join, use the outlet's average GP margin
    # from today's POS snapshot if available.
    snap_agg = PosSnapshot.objects.filter(outlet=outlet, snapshot_date=today).aggregate(
        cost_sum=Sum(ExpressionWrapper(
            F("cost_price") * F("pos_quantity"),
            output_field=DecimalField(max_digits=20, decimal_places=3),
        )),
        sell_sum=Sum(ExpressionWrapper(
            F("selling_price") * F("pos_quantity"),
            output_field=DecimalField(max_digits=20, decimal_places=3),
        )),
    )
    net_sales = gross_sales + returns_val  # returns stored negative
    gp_pct = None
    if snap_agg["sell_sum"] and snap_agg["cost_sum"] is not None and Decimal(snap_agg["sell_sum"]) > 0:
        # Approx GP margin from today's snapshot mix
        gp_pct = float((Decimal(snap_agg["sell_sum"]) - Decimal(snap_agg["cost_sum"])) / Decimal(snap_agg["sell_sum"]) * 100)

    # --- Count coverage today ---
    total_items = PosSnapshot.objects.filter(outlet=outlet, snapshot_date=today).count()
    counted = (
        StockCount.objects.filter(outlet=outlet, count_date=today)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id").distinct().count()
    )
    coverage_pct = round(counted / total_items * 100, 1) if total_items else 0

    # --- Variance today (Rs value, only counted items) ---
    variance_today = VarianceRecord.objects.filter(
        outlet=outlet, count_date=today, counted_qty__gt=0,
    ).aggregate(v=Sum("variance_value"))["v"] or Decimal("0")

    # --- Uploads done today ---
    from apps.uploads.models import (
        DamageUploadBatch, OfficeUploadBatch, VerificationUploadBatch,
        GrnUploadBatch, RtsUploadBatch, SalesUploadBatch, SalesReturnUploadBatch,
    )
    uploads_today = {
        "pos": total_items > 0,
        "damage": DamageUploadBatch.objects.filter(outlet=outlet, uploaded_at__date=today).exists(),
        "office": OfficeUploadBatch.objects.filter(outlet=outlet, uploaded_at__date=today).exists(),
        "verification": VerificationUploadBatch.objects.filter(outlet=outlet, uploaded_at__date=today).exists(),
        "grn": GrnUploadBatch.objects.filter(outlet=outlet, uploaded_at__date=today).exists(),
        "rts": RtsUploadBatch.objects.filter(outlet=outlet, uploaded_at__date=today).exists(),
        "sales": SalesUploadBatch.objects.filter(outlet=outlet, uploaded_at__date=today).exists(),
        "sales_returns": SalesReturnUploadBatch.objects.filter(outlet=outlet, uploaded_at__date=today).exists(),
    }

    # --- Alerts ---
    cutoff = today - timedelta(days=7)
    # Items whose latest count is > 7 days old (or never counted), among active items
    recent_counts = (
        StockCount.objects.filter(outlet=outlet)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .values("item_id").annotate(last_c=Max("count_date"))
    )
    recent_map = {r["item_id"]: r["last_c"] for r in recent_counts}
    active_item_ids = set(
        Item.objects.filter(outlet=outlet, status=Item.Status.ACTIVE).values_list("id", flat=True)
    )
    uncounted_7d = sum(1 for iid in active_item_ids if not recent_map.get(iid) or recent_map[iid] < cutoff)

    HIGH_VAL = Decimal("5000")
    high_value_variances = VarianceRecord.objects.filter(
        outlet=outlet, counted_qty__gt=0, status=VarianceRecord.Status.PENDING,
    ).exclude(variance_value__gt=-HIGH_VAL, variance_value__lt=HIGH_VAL).count()

    pending_reviews = PendingItem.objects.filter(
        first_seen_outlet=outlet, status=PendingItem.Status.PENDING,
    ).count()

    stale_sessions = CountSession.objects.filter(
        outlet=outlet, status=CountSession.Status.OPEN,
        started_at__lt=timezone.now() - timedelta(hours=24),
    ).count()

    return Response({
        "outlet_id": outlet.id,
        "outlet_name": outlet.outlet_name,
        "today": str(today),
        "kpi": {
            "sales_today": float(net_sales),
            "gp_pct_today": gp_pct,
            "coverage_pct_today": coverage_pct,
            "variance_today": float(variance_today),
            "uploads_today": uploads_today,
        },
        "alerts": {
            "uncounted_over_7d": uncounted_7d,
            "high_value_variances": high_value_variances,
            "pending_reviews": pending_reviews,
            "stale_sessions": stale_sessions,
        },
    })


@api_view(["GET"])
@permission_classes([IsManager])
def sales_and_shrinkage_trend(request):
    """
    Two daily series across a date range for the outlet:
      - sales:     SUM(SalesLine.amount + SalesReturnLine.gross_value) per day
      - shrinkage: SUM(VarianceRecord.variance_value) per day (only_counted)
    Emits a row per day so the chart has no gaps. Rows missing data show 0.
    """
    from apps.uploads.models import SalesLine, SalesReturnLine
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    from_date, to_date = _dash_range(request, default_days=14)

    sales_map = {
        r["txn_date"]: float(r["amount"] or 0)
        for r in SalesLine.objects
            .filter(outlet=outlet, txn_date__range=(from_date, to_date))
            .values("txn_date").annotate(amount=Sum("amount"))
    }
    returns_map = {
        r["txn_date"]: float(r["v"] or 0)
        for r in SalesReturnLine.objects
            .filter(outlet=outlet, txn_date__range=(from_date, to_date))
            .values("txn_date").annotate(v=Sum("gross_value"))
    }
    shrink_map = {
        r["count_date"]: float(r["v"] or 0)
        for r in VarianceRecord.objects
            .filter(outlet=outlet, count_date__range=(from_date, to_date), counted_qty__gt=0)
            .values("count_date").annotate(v=Sum("variance_value"))
    }

    days = []
    cur = from_date
    while cur <= to_date:
        days.append({
            "date": str(cur),
            "sales": sales_map.get(cur, 0) + returns_map.get(cur, 0),
            "shrinkage": shrink_map.get(cur, 0),
        })
        cur += timedelta(days=1)

    return Response({
        "outlet_id": outlet.id,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "days": days,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def category_performance(request):
    """
    Per-category aggregates for the outlet over a date range. Sales and cost
    come from SalesLine (joined to Item for category), variance from
    VarianceRecord. Top-10 by sales value.
    """
    from apps.uploads.models import SalesLine
    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    from_date, to_date = _dash_range(request, default_days=14)

    # Sales per category
    sales_rows = (
        SalesLine.objects
        .filter(outlet=outlet, txn_date__range=(from_date, to_date))
        .values("item__category")
        .annotate(
            sales=Sum("amount"),
            items=Sum("qty"),
            lines=Count("id"),
        )
    )
    sales_map = {r["item__category"] or "—": r for r in sales_rows}

    # Approximate cost using PosSnapshot cost_price × qty sold. Match by item_id.
    # For MVP: sum item.cost_price * qty from sales lines directly.
    cost_rows = (
        SalesLine.objects
        .filter(outlet=outlet, txn_date__range=(from_date, to_date))
        .values("item__category")
        .annotate(
            cost=Sum(ExpressionWrapper(
                F("item__cost_price") * F("qty"),
                output_field=DecimalField(max_digits=20, decimal_places=3),
            )),
        )
    )
    cost_map = {r["item__category"] or "—": r for r in cost_rows}

    # Variance per category
    variance_rows = (
        VarianceRecord.objects
        .filter(outlet=outlet, count_date__range=(from_date, to_date), counted_qty__gt=0)
        .values("item__category")
        .annotate(variance_value=Sum("variance_value"), variance_items=Count("id"))
    )
    variance_map = {r["item__category"] or "—": r for r in variance_rows}

    # Merge all keys
    all_cats = set(sales_map) | set(variance_map)
    results = []
    for cat in all_cats:
        s = sales_map.get(cat, {})
        c = cost_map.get(cat, {})
        v = variance_map.get(cat, {})
        sales_val = float(s.get("sales") or 0)
        cost_val = float(c.get("cost") or 0)
        gp_pct = round((sales_val - cost_val) / sales_val * 100, 1) if sales_val > 0 else None
        results.append({
            "category": cat,
            "sales": sales_val,
            "cost": cost_val,
            "gp_pct": gp_pct,
            "items_sold": float(s.get("items") or 0),
            "variance_value": float(v.get("variance_value") or 0),
            "variance_items": v.get("variance_items", 0),
        })
    results.sort(key=lambda r: r["sales"], reverse=True)

    return Response({
        "outlet_id": outlet.id,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "results": results[:10],
    })
