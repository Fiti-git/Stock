from datetime import date, timedelta, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

_SL_TZ = ZoneInfo("Asia/Colombo")


def _fmt_local(dt):
    """Format a UTC-aware datetime as HH:MM in Asia/Colombo (UTC+5:30)."""
    if dt is None:
        return ""
    return dt.astimezone(_SL_TZ).strftime("%H:%M")

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

    # Freeze the latest PosSnapshot (with snapshot_date <= count_date) at
    # submission time. This becomes the "AsatDate qty" the Item Count
    # History report will use, forever. Even if POS is re-uploaded later,
    # historical variance stays honest to what was known when we counted.
    frozen_snap = (
        PosSnapshot.objects.filter(
            outlet=outlet, item=item, snapshot_date__lte=count_date,
        )
        .order_by("-snapshot_date")
        .only("id", "pos_quantity")
        .first()
    )
    frozen_pos_qty = frozen_snap.pos_quantity if frozen_snap else None
    frozen_snap_id = frozen_snap.id if frozen_snap else None

    with transaction.atomic():
        session = _get_or_create_open_session(outlet, count_date, request.user)

        # Every submission always creates a new row — no upsert/overwrite.
        # Multiple counts of the same item+location are all kept so the full
        # counting history is visible in reports.
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
            pos_qty_at_count=frozen_pos_qty,
            pos_snapshot_at_count_id=frozen_snap_id,
        )
        try:
            from apps.dashboard.real_loss_freeze import freeze_stock_count
            freeze_stock_count(count, source="submit")
        except Exception:
            pass
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

    # Date-aware daily-count filter: use ItemDailyCountHistory so reports
    # for past dates reflect the flag state on that date, not "today". This
    # matters when an item was flagged DC in May 2025 but unflagged in Jan
    # 2026 — a query for Oct 2025 must still include it.
    from apps.items.models import daily_count_item_ids_on
    dc_item_ids = list(daily_count_item_ids_on(outlet.id, target_date))
    items_qs = (
        Item.objects
        .filter(outlet=outlet, status=Item.Status.ACTIVE, id__in=dc_item_ids)
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
        "id", "count_date", "counted_at", "actual_qty", "item_id", "counted_by_id",
        "location_tag", "device_uuid",
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

    # Prior on-hand: for each StockCount row, the running balance from
    # StockMovement just BEFORE the count's counted_at timestamp. One query
    # per count would kill the endpoint, so we bulk-fetch the last movement
    # for each (item, count_id) via a correlated subquery approach:
    # get every movement for these items in the range, group by item, then
    # per-count pick the latest movement with created_at <= count.counted_at.
    from apps.items.models import StockMovement
    prior_map = {}
    if count_list:
        # Movements for these items up to the last count time (with margin).
        latest_counted_at = max((c.counted_at for c in count_list if c.counted_at), default=None)
        if latest_counted_at:
            mv_qs = (
                StockMovement.objects
                .filter(outlet=outlet, item_id__in=item_ids, created_at__lte=latest_counted_at)
                .order_by("item_id", "created_at")
                .values("item_id", "created_at", "balance_after")
            )
            # Group by item, keep the movements list sorted by created_at asc.
            by_item = {}
            for mv in mv_qs:
                by_item.setdefault(mv["item_id"], []).append(mv)
            # For each count, binary-search the last movement <= counted_at.
            import bisect
            for c in count_list:
                movements = by_item.get(c.item_id)
                if not movements or not c.counted_at:
                    continue
                times = [m["created_at"] for m in movements]
                # bisect_right finds insertion point AFTER equal timestamps
                # (so we get the balance as of the count moment, not before).
                idx = bisect.bisect_right(times, c.counted_at) - 1
                if idx >= 0:
                    prior_map[c.id] = float(movements[idx]["balance_after"] or 0)

    # Date-aware "was daily-count?" per row — uses the ItemDailyCountHistory
    # helper so a count from May 2025 shows DC status as it was then, not now.
    from apps.items.models import was_daily_count_on

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
            "count_time": _fmt_local(c.counted_at),
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
            "location_tag": c.location_tag or "",
            "device": (c.device_uuid or "")[-6:],
            "was_daily_count": was_daily_count_on(c.item_id, c.count_date),
            "prior_on_hand": prior_map.get(c.id),
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
            "Count date", "Count time", "Code", "Name", "Category",
            "Counted qty", "Prior on-hand", "MyPOS qty", "Variance",
            "Cost price", "Loss/Surplus value",
            "Location", "Was daily-count", "Device", "Counted by",
        ]

        def iterator():
            for r in rows:
                yield [
                    r["count_date"], r["count_time"],
                    r["item_code"], r["item_name"], r["category"],
                    r["counted_qty"],
                    "" if r["prior_on_hand"] is None else r["prior_on_hand"],
                    r["mypos_qty"], r["variance"],
                    r["cost_price"], r["loss_value"],
                    r["location_tag"], "Y" if r["was_daily_count"] else "N",
                    r["device"], r["counted_by_name"],
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


ITEM_COUNT_HISTORY_SORT_KEYS = {
    "item_code":        lambda r: r["item_code"] or "",
    "item_name":        lambda r: (r["item_name"] or "").lower(),
    "counts_in_range":  lambda r: r["counts_in_range"],
    "latest_mypos_qty": lambda r: r["latest_mypos_qty"] or 0,
    "avg_counted":      lambda r: r["avg_counted"],
    "latest_count_date":lambda r: r["latest_count_date"] or "",
    "total_variance":   lambda r: r["total_variance"],
    "loss_value":       lambda r: r["loss_value"],
}


@api_view(["GET"])
@permission_classes([IsManager])
def item_count_history(request):
    """
    Per-item roll-up of counting activity over a date range.

    Unlike count_history_detail (one row per count event), this returns one
    row per item that was counted at least once in the range, with a nested
    `events` array holding every count for that item. Each event's variance
    is computed against the item's LATEST PosSnapshot (not the snapshot on
    the count's own date) — the question this report answers is "given
    what POS says today, how do our counts stack up?".

    Query params:
      outlet=<id>            admin override
      from=YYYY-MM-DD        range start (inclusive; default: today - 30d)
      to=YYYY-MM-DD          range end (inclusive; default: today)
      q                      search item_code / item_name
      only_variance=1        only items whose total_variance != 0
      sort_by, order         see ITEM_COUNT_HISTORY_SORT_KEYS
      page, page_size        standard pagination
      export=csv             stream all matching rows FLATTENED to one row
                             per count event
    """
    # "all" mode: admins can pass outlet=all to aggregate across every
    # outlet. Non-admins are pinned to their own outlet regardless of the
    # param (matches _resolve_outlet's contract).
    outlet_param = (request.query_params.get("outlet") or "").strip().lower()
    all_outlets_mode = (
        outlet_param == "all"
        and request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN)
    )

    if all_outlets_mode:
        outlet = None
        outlet_map = {
            o.id: o for o in Outlet.objects.all().only("id", "outlet_name")
        }
    else:
        outlet = _resolve_outlet(request)
        if not outlet:
            return Response({"detail": "No outlet."}, status=400)
        outlet_map = {outlet.id: outlet}

    to_date = _parse_date(request.query_params.get("to", "")) or date.today()
    from_date = _parse_date(request.query_params.get("from", "")) or (to_date - timedelta(days=30))
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    counts_qs = (
        StockCount.objects
        .filter(count_date__gte=from_date, count_date__lte=to_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .select_related("counted_by")
        .only("id", "count_date", "counted_at", "actual_qty", "item_id",
              "outlet_id", "counted_by_id", "location_tag", "pos_qty_at_count")
    )
    if not all_outlets_mode:
        counts_qs = counts_qs.filter(outlet=outlet)

    q = (request.query_params.get("q") or "").strip()
    if q:
        counts_qs = counts_qs.filter(
            Q(item__item_code__icontains=q) | Q(item__item_name__icontains=q)
        )

    count_list = list(counts_qs)

    item_ids = {c.item_id for c in count_list}
    # For all-outlets mode we need per-(outlet, item) lookups later. In
    # single-outlet mode this is just {outlet.id} × item_ids.
    outlet_item_pairs = {(c.outlet_id, c.item_id) for c in count_list}

    # Latest PosSnapshot per (outlet, item) — one entry per pair, newest date.
    # Keyed by (outlet_id, item_id) so all-outlets mode never leaks a
    # snapshot from outlet A into outlet B's rows for the same SKU.
    latest_snap_map = {}
    global_latest_snap_date = None
    if outlet_item_pairs:
        # Pull ordered by (outlet, item, -snapshot_date). First row per
        # (outlet, item) group is the latest.
        snap_filter = PosSnapshot.objects.filter(item_id__in=item_ids)
        if not all_outlets_mode:
            snap_filter = snap_filter.filter(outlet=outlet)
        snap_rows = (
            snap_filter
            .order_by("outlet_id", "item_id", "-snapshot_date")
            .values("outlet_id", "item_id", "snapshot_date", "pos_quantity", "cost_price")
        )
        seen = set()
        for r in snap_rows:
            pair = (r["outlet_id"], r["item_id"])
            if pair in seen:
                continue
            seen.add(pair)
            latest_snap_map[pair] = (
                float(r["pos_quantity"] or 0),
                r["snapshot_date"],
                float(r["cost_price"]) if r["cost_price"] is not None else None,
            )
            if global_latest_snap_date is None or r["snapshot_date"] > global_latest_snap_date:
                global_latest_snap_date = r["snapshot_date"]

    item_map = {
        it.id: it for it in Item.objects.filter(id__in=item_ids).only(
            "id", "item_code", "item_name", "category", "cost_price", "created_at"
        )
    }

    # All snapshots per (outlet, item) sorted ASC — used for per-event
    # "as-at" lookup. One SQL query for the whole page. Cache a parallel
    # list of dates so bisect doesn't rebuild it per call.
    snaps_by_pair = {}
    snap_dates_by_pair = {}
    if outlet_item_pairs:
        snap_filter = PosSnapshot.objects.filter(item_id__in=item_ids)
        if not all_outlets_mode:
            snap_filter = snap_filter.filter(outlet=outlet)
        for r in (
            snap_filter
            .order_by("outlet_id", "item_id", "snapshot_date")
            .values("outlet_id", "item_id", "snapshot_date", "pos_quantity")
        ):
            pair = (r["outlet_id"], r["item_id"])
            snaps_by_pair.setdefault(pair, []).append(r)
            snap_dates_by_pair.setdefault(pair, []).append(r["snapshot_date"])

    import bisect
    def asat_snapshot_for(pair, on_date):
        """
        Latest PosSnapshot for (outlet_id, item_id) with snapshot_date
        <= on_date. Returns (qty, date) or (None, None).
        """
        dates = snap_dates_by_pair.get(pair)
        if not dates:
            return None, None
        idx = bisect.bisect_right(dates, on_date) - 1
        if idx < 0:
            return None, None
        s = snaps_by_pair[pair][idx]
        return float(s["pos_quantity"] or 0), s["snapshot_date"]

    # Group counts by (outlet, item) so each (outlet, item) becomes one row.
    per_pair = {}
    for c in count_list:
        per_pair.setdefault((c.outlet_id, c.item_id), []).append(c)

    rows = []
    for (oid, iid), counts in per_pair.items():
        it = item_map.get(iid)
        if not it:
            continue
        latest = latest_snap_map.get((oid, iid))
        latest_mypos_qty = latest[0] if latest else None
        latest_mypos_date = latest[1] if latest else None
        latest_snap_cost = latest[2] if latest else None
        # Cost basis for ALL value math on this item: the cost recorded on
        # the LATEST PosSnapshot. Falls back to Item.cost_price only when
        # the snapshot itself has no cost. Applied uniformly to per-event
        # values and per-item totals so the numbers stay internally
        # consistent (no "row uses A, total uses B" mismatches).
        cost = (
            latest_snap_cost
            if latest_snap_cost is not None
            else float(it.cost_price or 0)
        )
        cost_source = "snapshot" if latest_snap_cost is not None else "item"
        # Stock age proxy: since GRNs aren't uploaded here, ItemBatch.received_at
        # is almost always empty. Fall back to Item.created_at — when the item
        # first entered the catalog. Not perfect but always populated and
        # honest ("how long has this SKU been on our books").
        item_created_date = it.created_at.date() if it.created_at else None

        # Sort events oldest → newest for the expanded panel.
        counts_sorted = sorted(counts, key=lambda x: (x.count_date, x.counted_at or x.count_date))

        # Group by count_date so we can compute variance ONCE per date
        # (multi-location split on same date shares one AsatDate qty).
        from collections import defaultdict
        counts_by_date = defaultdict(list)
        for c in counts_sorted:
            counts_by_date[c.count_date].append(c)

        events = []                          # per-count-event rows (for expanded panel)
        counted_sum_all = 0.0                # sum of all surviving events
        counted_sum_asat_only = 0.0          # only dates that had a frozen POS
        total_asat_qty = 0.0                 # sum of per-date AsatDate qty
        dates_with_asat = 0                  # count of DATES (not events)
        total_dates = len(counts_by_date)
        total_loss = 0.0
        total_surplus = 0.0
        total_stock_age = 0
        stock_age_count = 0

        for cdate, day_counts in sorted(counts_by_date.items()):
            # Frozen POS from ANY event on the date (they should all share
            # the same value since it's frozen at submit time from the same
            # snapshot; take the first as canonical). Fall back to the
            # historical bisect for pre-migration counts.
            frozen_vals = [
                float(c.pos_qty_at_count) for c in day_counts
                if c.pos_qty_at_count is not None
            ]
            if frozen_vals:
                date_asat_qty = frozen_vals[0]
                # asat_date: find the snapshot the frozen value came from.
                _, asat_date = asat_snapshot_for((oid, iid), cdate)
            else:
                date_asat_qty, asat_date = asat_snapshot_for((oid, iid), cdate)

            date_counted = sum(float(c.actual_qty or 0) for c in day_counts)
            if date_asat_qty is not None:
                date_variance = date_counted - date_asat_qty
                date_value = date_variance * cost
                total_asat_qty += date_asat_qty
                counted_sum_asat_only += date_counted
                dates_with_asat += 1
                if date_value < 0:
                    total_loss += date_value
                elif date_value > 0:
                    total_surplus += date_value
            else:
                date_variance = None
                date_value = None

            counted_sum_all += date_counted
            stock_age_days = (
                (cdate - item_created_date).days if item_created_date else None
            )
            if stock_age_days is not None:
                total_stock_age += stock_age_days
                stock_age_count += 1

            # Emit ONE event row per (date, location) — no more per-event
            # variance columns; per-row values are aggregated into a single
            # "date variance" that appears on the LAST row of the date
            # (so the expanded panel visually attaches the total to the
            # date group). Other rows in the date group leave variance blank.
            for idx, c in enumerate(day_counts):
                is_date_summary = idx == len(day_counts) - 1
                events.append({
                    "count_id": c.id,
                    "date": str(cdate),
                    "time": _fmt_local(c.counted_at),
                    "location": c.location_tag or "",
                    "counted": float(c.actual_qty or 0),
                    # AsatDate qty + date carried on the LAST row of the date
                    "asat_date_qty": date_asat_qty if is_date_summary else None,
                    "asat_date": str(asat_date) if (is_date_summary and asat_date) else None,
                    "stock_age_days": stock_age_days if is_date_summary else None,
                    # Variance / value likewise attached to the LAST row.
                    "variance": date_variance if is_date_summary and date_variance is not None else 0.0,
                    "variance_has_asat": is_date_summary and date_variance is not None,
                    "value": date_value if is_date_summary and date_value is not None else 0.0,
                    "is_date_summary": is_date_summary,
                    "date_locations_count": len(day_counts),
                    "counter": (
                        c.counted_by.username if c.counted_by_id and c.counted_by else ""
                    ),
                })

        # variance_sum = sum of per-date variances (already summed above).
        total_variance = (
            counted_sum_asat_only - total_asat_qty if dates_with_asat else 0.0
        )
        total_counted = counted_sum_all
        events_with_asat = dates_with_asat  # kept for UI backwards compat

        latest_event = counts_sorted[-1]
        avg_stock_age = (
            round(total_stock_age / stock_age_count, 1) if stock_age_count else None
        )
        _o = outlet_map.get(oid)
        rows.append({
            "outlet_id": oid,
            "outlet_name": _o.outlet_name if _o else "",
            "item_id": iid,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "category": it.category or "",
            # counts_in_range now = surviving (post-dedup) events shown in the
            # expanded panel. Dates count is separate.
            "counts_in_range": len(counts_sorted),
            "dates_counted": total_dates,
            "superseded_count": 0,
            "latest_mypos_qty": latest_mypos_qty,
            "latest_mypos_date": str(latest_mypos_date) if latest_mypos_date else None,
            "cost_price": cost,
            "cost_source": cost_source,
            "avg_counted": round(total_counted / total_dates, 2) if total_dates else 0,
            "latest_count_date": str(latest_event.count_date),
            "latest_count_qty": float(latest_event.actual_qty or 0),
            # Per-item sums (Excel-style totals) — now per-DATE not per-event
            "counted_sum": total_counted,
            "asat_date_sum": total_asat_qty if dates_with_asat else None,
            "variance_sum": total_variance,
            # How many DATES had a frozen POS. UI uses this to flag partial
            # coverage — matches the semantics of dates_counted.
            "events_with_asat": dates_with_asat,
            "avg_stock_age": avg_stock_age,
            # Value math — three flavours, all cast to the same cost basis
            # (latest snapshot cost) so a reader can pick the framing:
            #   net_value    = variance_sum × cost — one signed number, honest
            #                  net across the item (loss and surplus cancel)
            #   loss_value   = sum of NEGATIVE-value date events (gross loss)
            #   surplus_value= sum of POSITIVE-value date events (gross surplus)
            "net_value": total_variance * cost,
            "loss_value": total_loss,     # signed, <= 0
            "surplus_value": total_surplus,  # signed, >= 0
            # total_variance kept for backwards compat
            "total_variance": total_variance,
            "events": events,
        })

    if request.query_params.get("only_variance") in ("1", "true"):
        rows = [r for r in rows if abs(r["total_variance"]) > 0.001]

    summary = {
        "items_counted": len(rows),
        "total_events": sum(r["counts_in_range"] for r in rows),
        "latest_pos_snapshot_date": str(global_latest_snap_date) if global_latest_snap_date else None,
        # Gross totals: negative-value dates and positive-value dates summed
        # separately (not netted). Useful for shrinkage auditing.
        "gross_loss": sum(r["loss_value"] for r in rows),
        "gross_surplus": sum(r["surplus_value"] for r in rows),
        # Net value: variance × cost summed per item (signed single number).
        # Equivalent to gross_loss + gross_surplus but sourced from the
        # per-item net_value field directly for clarity.
        "net_value": sum(r["net_value"] for r in rows),
        # Legacy aliases retained for any older UI code paths.
        "total_loss": sum(r["loss_value"] for r in rows),
        "total_surplus": sum(r["surplus_value"] for r in rows),
        "range_days": (to_date - from_date).days + 1,
    }

    sort_by = request.query_params.get("sort_by", "counts_in_range")
    order = request.query_params.get("order", "desc")
    rows = _sort_rows(rows, sort_by, order, ITEM_COUNT_HISTORY_SORT_KEYS, "counts_in_range")

    if request.query_params.get("export") == "csv":
        header = [
            "Outlet",
            "Item code", "Item name", "Category",
            "Count date", "Count time", "Location", "Counted qty",
            "AsatDate qty", "Stock age (days)",
            "Latest MyPOS qty", "Latest MyPOS date",
            "Variance", "Cost price", "Value (gross)", "Counter",
            # Totals — populated only on the first row of each item
            "Counted SUM", "AsatDate SUM", "Variance SUM",
            "Net value", "Gross loss", "Gross surplus", "Avg stock age",
        ]

        def iterator():
            for r in rows:
                for i, e in enumerate(r["events"]):
                    is_first = i == 0
                    yield [
                        r.get("outlet_name", ""),
                        r["item_code"], r["item_name"], r["category"],
                        e["date"], e["time"], e["location"], e["counted"],
                        "" if e["asat_date_qty"] is None else e["asat_date_qty"],
                        "" if e["stock_age_days"] is None else e["stock_age_days"],
                        "" if r["latest_mypos_qty"] is None else r["latest_mypos_qty"],
                        r["latest_mypos_date"] or "",
                        e["variance"] if e["variance_has_asat"] else "",
                        r["cost_price"],
                        e["value"] if e["variance_has_asat"] else "",
                        e["counter"],
                        # Totals block — first row only, blank on the rest so
                        # Excel matches the client's spreadsheet layout
                        (r["counted_sum"] if is_first else ""),
                        ("" if not is_first or r["asat_date_sum"] is None else r["asat_date_sum"]),
                        (r["variance_sum"] if is_first else ""),
                        (r["net_value"] if is_first else ""),
                        (r["loss_value"] if is_first else ""),
                        (r["surplus_value"] if is_first else ""),
                        ("" if not is_first or r["avg_stock_age"] is None else r["avg_stock_age"]),
                    ]

        resp = _csv_stream(header, iterator())
        resp["Content-Disposition"] = (
            f'attachment; filename="item-count-history-{from_date}-to-{to_date}.csv"'
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
        "outlet_id": outlet.id if outlet else None,
        "all_outlets_mode": all_outlets_mode,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "summary": summary,
        "results": results,
    })


REAL_LOSS_SORT_KEYS = {
    "item_code":         lambda r: r["item_code"] or "",
    "item_name":         lambda r: (r["item_name"] or "").lower(),
    "counts_in_range":   lambda r: r["counts_in_range"],
    "real_variance_sum": lambda r: r["real_variance_sum"],
    "real_net_value":    lambda r: r["real_net_value"],
    "real_loss":         lambda r: r["real_loss"],
}


@api_view(["POST"])
@permission_classes([IsManager])
def real_loss_rerun(request):
    """
    Re-freeze Real Loss reconciliation for the given StockCount ids using
    current DB state. Writes a RealLossRerunHistory row per count so the
    change is auditable. Body:  { "count_ids": [1,2,3, ...] }
    Cap: 500 counts per request (protects against runaway "rerun all" clicks).
    """
    from apps.dashboard.real_loss_freeze import freeze_stock_counts_bulk
    from apps.dashboard.models import RealLossRerunHistory
    import time as _time

    count_ids = request.data.get("count_ids") or []
    if not isinstance(count_ids, list) or not count_ids:
        return Response({"detail": "count_ids required (list)."}, status=400)
    if len(count_ids) > 500:
        return Response({"detail": "Max 500 counts per rerun."}, status=400)

    # Scope: managers can only rerun counts in their own outlet.
    qs = StockCount.objects.filter(id__in=count_ids)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=request.user.outlet)

    counts = list(qs.select_related("pos_snapshot_at_count"))
    if not counts:
        return Response({"updated": 0, "elapsed_ms": 0})

    t0 = _time.time()
    results = freeze_stock_counts_bulk(counts, source="rerun")
    audit_rows = [
        RealLossRerunHistory(
            count_id=cid, ran_by=request.user, source="rerun",
            prev_expected=prev["expected"], prev_variance=prev["variance"], prev_value=prev["value"],
            new_expected=new["expected"], new_variance=new["variance"], new_value=new["value"],
        )
        for cid, prev, new in results
    ]
    if audit_rows:
        RealLossRerunHistory.objects.bulk_create(audit_rows, batch_size=500)
    return Response({
        "updated": len(results),
        "elapsed_ms": int((_time.time() - t0) * 1000),
    })


@api_view(["GET"])
@permission_classes([IsManager])
def real_loss_rerun_history(request, count_id):
    """
    List all rerun events for a StockCount, newest first. Used by the UI
    to show the audit trail for a specific row.
    """
    from apps.dashboard.models import RealLossRerunHistory

    sc = StockCount.objects.filter(pk=count_id).first()
    if not sc:
        return Response({"detail": "Not found."}, status=404)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if sc.outlet_id != request.user.outlet_id:
            return Response({"detail": "Forbidden."}, status=403)
    rows = list(
        RealLossRerunHistory.objects
        .filter(count_id=count_id)
        .select_related("ran_by")
        .values(
            "id", "ran_at", "source",
            "prev_expected", "prev_variance", "prev_value",
            "new_expected", "new_variance", "new_value",
            "ran_by__username",
        )
    )
    for r in rows:
        r["ran_at"] = r["ran_at"].isoformat() if r["ran_at"] else None
        r["ran_by"] = r.pop("ran_by__username")
        for k in ("prev_expected", "prev_variance", "prev_value",
                  "new_expected", "new_variance", "new_value"):
            r[k] = float(r[k]) if r[k] is not None else None
    return Response({"results": rows})


@api_view(["GET"])
@permission_classes([IsManager])
def real_loss_report(request):
    """
    Real Loss — full stock reconciliation per counted item.

    For each StockCount, computes the "expected" qty at count moment by
    starting from the frozen anchor POS snapshot (the snapshot in effect
    just before the count, captured at submit time) and applying every
    signed transaction between the snapshot date and the count date.

    Signed movement table (positive = stock in, negative = stock out):
      GRN + Sales Returns + Verification (signed)  →  positive
      Sales + Damage + Office + RTS                →  negative

    Real variance = counted_qty − expected_qty. Real loss/surplus = variance
    × cost from the LATEST POS snapshot (matches Item Count History cost
    basis for continuity).

    This is the strictly-honest number: it explains 100% of variance IF
    every transaction is faithfully uploaded. Unexplained variance = real
    shrinkage OR missing uploads.
    """
    from apps.uploads.models import (
        SalesLine, SalesReturnLine, DamageLine, OfficeLine,
        VerificationLine, GrnLine, RtsLine,
    )

    # Outlet resolution (same pattern as item_count_history — supports all).
    outlet_param = (request.query_params.get("outlet") or "").strip().lower()
    all_outlets_mode = (
        outlet_param == "all"
        and request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN)
    )
    if all_outlets_mode:
        outlet = None
        outlet_map = {o.id: o for o in Outlet.objects.all().only("id", "outlet_name")}
    else:
        outlet = _resolve_outlet(request)
        if not outlet:
            return Response({"detail": "No outlet."}, status=400)
        outlet_map = {outlet.id: outlet}

    to_date = _parse_date(request.query_params.get("to", "")) or date.today()
    from_date = _parse_date(request.query_params.get("from", "")) or (to_date - timedelta(days=30))
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    # Pull all counts in range.
    counts_qs = (
        StockCount.objects
        .filter(count_date__gte=from_date, count_date__lte=to_date)
        .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
        .select_related("counted_by", "pos_snapshot_at_count")
        .only("id", "count_date", "counted_at", "actual_qty", "item_id",
              "outlet_id", "counted_by_id", "location_tag",
              "pos_qty_at_count", "pos_snapshot_at_count_id")
    )
    if not all_outlets_mode:
        counts_qs = counts_qs.filter(outlet=outlet)

    q = (request.query_params.get("q") or "").strip()
    if q:
        counts_qs = counts_qs.filter(
            Q(item__item_code__icontains=q) | Q(item__item_name__icontains=q)
        )

    count_list = list(counts_qs)

    if not count_list:
        return Response({
            "count": 0, "page": 1, "page_size": 25,
            "outlet_id": outlet.id if outlet else None,
            "all_outlets_mode": all_outlets_mode,
            "from_date": str(from_date), "to_date": str(to_date),
            "summary": {"items_counted": 0, "total_events": 0,
                        "real_net_value": 0, "real_loss": 0, "real_surplus": 0,
                        "range_days": (to_date - from_date).days + 1},
            "results": [],
        })

    item_ids = {c.item_id for c in count_list}
    outlet_item_pairs = {(c.outlet_id, c.item_id) for c in count_list}

    # Item lookup — need item_code for txn joins and cost_price fallback.
    item_map = {
        it.id: it for it in Item.objects.filter(id__in=item_ids).only(
            "id", "item_code", "item_name", "category", "cost_price", "created_at"
        )
    }
    # Reverse: (outlet_id, item_code) → item_id, for joining txn lines back.
    code_to_id = {}
    for c in count_list:
        it = item_map.get(c.item_id)
        if it:
            code_to_id[(c.outlet_id, it.item_code)] = c.item_id

    # Latest snapshot per (outlet, item) for cost + display fields.
    latest_snap_map = {}
    latest_snap_date_global = None
    snap_filter = PosSnapshot.objects.filter(item_id__in=item_ids)
    if not all_outlets_mode:
        snap_filter = snap_filter.filter(outlet=outlet)
    for r in (
        snap_filter
        .order_by("outlet_id", "item_id", "-snapshot_date")
        .values("outlet_id", "item_id", "snapshot_date", "pos_quantity", "cost_price")
    ):
        pair = (r["outlet_id"], r["item_id"])
        if pair in latest_snap_map:
            continue
        latest_snap_map[pair] = (
            float(r["pos_quantity"] or 0),
            r["snapshot_date"],
            float(r["cost_price"]) if r["cost_price"] is not None else None,
        )
        if latest_snap_date_global is None or r["snapshot_date"] > latest_snap_date_global:
            latest_snap_date_global = r["snapshot_date"]

    # Determine the earliest anchor date across all counts so we know how far
    # back to pull transactions. Anchor = pos_snapshot_at_count.snapshot_date.
    # For counts missing a frozen snapshot, use count_date - 1 as a safe upper
    # bound so we still capture some window.
    anchor_dates = []
    for c in count_list:
        anchor = c.pos_snapshot_at_count.snapshot_date if c.pos_snapshot_at_count_id else None
        anchor_dates.append(anchor if anchor else c.count_date)
    txn_from = min(anchor_dates) if anchor_dates else from_date
    txn_to = to_date

    # Bulk-fetch all transaction lines in the window. One query per type,
    # aggregated by (outlet_id, item_code, txn_date) → summed qty.
    # Store as dict: (outlet_id, item_id, txn_date) → {type: qty}
    # Note: line tables use item_code, so we translate via code_to_id.
    def _bulk_load(qs, qty_expr="qty"):
        """Aggregate qty by (outlet, item_code, txn_date) into a dict."""
        out = {}
        for row in qs.values("outlet_id", "item_code", "txn_date").annotate(_sum=Sum(qty_expr)):
            iid = code_to_id.get((row["outlet_id"], row["item_code"]))
            if iid is None:
                continue
            key = (row["outlet_id"], iid, row["txn_date"])
            out[key] = out.get(key, 0.0) + float(row["_sum"] or 0)
        return out

    outlet_filter_kw = {} if all_outlets_mode else {"outlet": outlet}
    date_filter_kw = {"txn_date__gte": txn_from, "txn_date__lte": txn_to}

    from django.db.models import F, Sum as _Sum
    sales_by_key = _bulk_load(
        SalesLine.objects.filter(**outlet_filter_kw, **date_filter_kw)
    )
    returns_by_key = _bulk_load(
        SalesReturnLine.objects.filter(**outlet_filter_kw, **date_filter_kw)
    )
    damage_by_key = _bulk_load(
        DamageLine.objects.filter(**outlet_filter_kw, **date_filter_kw)
    )
    office_by_key = _bulk_load(
        OfficeLine.objects.filter(**outlet_filter_kw, **date_filter_kw)
    )
    verification_by_key = _bulk_load(
        VerificationLine.objects.filter(**outlet_filter_kw, **date_filter_kw)
    )
    # GRN / RTS include free_qty as physical stock in/out — sum qty + free_qty.
    grn_by_key = {}
    for row in (
        GrnLine.objects.filter(**outlet_filter_kw, **date_filter_kw)
        .values("outlet_id", "item_code", "txn_date")
        .annotate(_sum_qty=_Sum("qty"), _sum_free=_Sum("free_qty"))
    ):
        iid = code_to_id.get((row["outlet_id"], row["item_code"]))
        if iid is None:
            continue
        key = (row["outlet_id"], iid, row["txn_date"])
        grn_by_key[key] = grn_by_key.get(key, 0.0) + float(row["_sum_qty"] or 0) + float(row["_sum_free"] or 0)
    rts_by_key = {}
    for row in (
        RtsLine.objects.filter(**outlet_filter_kw, **date_filter_kw)
        .values("outlet_id", "item_code", "txn_date")
        .annotate(_sum_qty=_Sum("qty"), _sum_free=_Sum("free_qty"))
    ):
        iid = code_to_id.get((row["outlet_id"], row["item_code"]))
        if iid is None:
            continue
        key = (row["outlet_id"], iid, row["txn_date"])
        rts_by_key[key] = rts_by_key.get(key, 0.0) + float(row["_sum_qty"] or 0) + float(row["_sum_free"] or 0)

    def _sum_between(by_key, oid, iid, day_from, day_to):
        """Sum qty for (outlet, item) across the inclusive date window."""
        if day_from > day_to:
            return 0.0
        # by_key is a dict; iterate is O(n txns) — for typical volume fine.
        # If needed later, pre-group by (outlet, item) into sorted-by-date list.
        total = 0.0
        for (o, i, d), v in by_key.items():
            if o == oid and i == iid and day_from <= d <= day_to:
                total += v
        return total

    # For efficiency, pre-index each txn dict by (outlet, item) → list of (date, qty).
    def _index_by_pair(by_key):
        idx = {}
        for (o, i, d), v in by_key.items():
            idx.setdefault((o, i), []).append((d, v))
        for k in idx:
            idx[k].sort()
        return idx

    sales_idx = _index_by_pair(sales_by_key)
    returns_idx = _index_by_pair(returns_by_key)
    damage_idx = _index_by_pair(damage_by_key)
    office_idx = _index_by_pair(office_by_key)
    verification_idx = _index_by_pair(verification_by_key)
    grn_idx = _index_by_pair(grn_by_key)
    rts_idx = _index_by_pair(rts_by_key)

    import bisect
    def _sum_window(idx, oid, iid, day_from, day_to):
        arr = idx.get((oid, iid))
        if not arr:
            return 0.0
        dates_only = [d for d, _ in arr]
        lo = bisect.bisect_left(dates_only, day_from)
        hi = bisect.bisect_right(dates_only, day_to)
        return sum(v for _, v in arr[lo:hi])

    # Group counts by (outlet, item).
    per_pair = {}
    for c in count_list:
        per_pair.setdefault((c.outlet_id, c.item_id), []).append(c)

    rows = []
    for (oid, iid), counts in per_pair.items():
        it = item_map.get(iid)
        if not it:
            continue
        latest = latest_snap_map.get((oid, iid))
        latest_snap_cost = latest[2] if latest else None
        latest_mypos_qty = latest[0] if latest else None
        latest_mypos_date = latest[1] if latest else None
        cost = (
            latest_snap_cost
            if latest_snap_cost is not None
            else float(it.cost_price or 0)
        )
        cost_source = "snapshot" if latest_snap_cost is not None else "item"

        counts_sorted = sorted(counts, key=lambda x: (x.count_date, x.counted_at or x.count_date))

        events = []
        real_variance_sum = 0.0
        real_loss_events = 0.0
        real_surplus_events = 0.0
        counted_sum_all = 0.0
        expected_sum = 0.0
        events_computable = 0

        # Roll-up totals of each txn type across the range (for the item row).
        item_sales = 0.0
        item_returns = 0.0
        item_grn = 0.0
        item_rts = 0.0
        item_damage = 0.0
        item_office = 0.0
        item_verification = 0.0

        # Group counts by count_date so multi-location counts on the same day
        # share one anchor + one txn delta window (avoids double-counting the
        # day's GRN/sales when the same item is counted in Rack + Store Room).
        from collections import defaultdict as _dd
        counts_by_date = _dd(list)
        for c in counts_sorted:
            counts_by_date[c.count_date].append(c)

        for cdate in sorted(counts_by_date.keys()):
            day_counts = counts_by_date[cdate]
            # Sum counted across all locations for the date — this is the
            # physical stock found for the item on that day.
            date_counted = sum(float(c.actual_qty or 0) for c in day_counts)
            counted_sum_all += date_counted

            # Pick a canonical anchor for the date. All same-day counts share
            # the same frozen anchor (both are frozen against latest snapshot
            # ≤ count_date), so grab the first non-null.
            canonical = next(
                (c for c in day_counts if c.pos_qty_at_count is not None and c.pos_snapshot_at_count_id),
                None
            )
            if canonical is None:
                # No usable anchor for any count on this date — emit each
                # location row with has_data=False so the UI can flag it.
                for c in day_counts:
                    events.append({
                        "count_id": c.id, "date": str(cdate),
                        "time": _fmt_local(c.counted_at),
                        "location": c.location_tag or "",
                        "counted": float(c.actual_qty or 0),
                        "anchor_qty": None, "anchor_date": None,
                        "sales": None, "returns": None, "grn": None, "rts": None,
                        "damage": None, "office": None, "verification": None,
                        "expected": None, "real_variance": None, "real_value": None,
                        "has_data": False,
                        "is_date_summary": False,
                        "date_locations_count": len(day_counts),
                        "counter": (c.counted_by.username if c.counted_by_id and c.counted_by else ""),
                        "freeze_at": c.real_freeze_at.isoformat() if c.real_freeze_at else None,
                        "freeze_source": c.real_freeze_source or "live",
                        "txn_breakdown": c.real_txn_breakdown if isinstance(c.real_txn_breakdown, dict) else None,
                    })
                continue

            anchor_qty = float(canonical.pos_qty_at_count)
            anchor_date = canonical.pos_snapshot_at_count.snapshot_date
            day_from = anchor_date  # inclusive: POS is start-of-day
            day_to = cdate

            # Prefer the canonical count's frozen breakdown for the txn totals
            # (all same-day counts of this item share identical txn totals
            # since the delta window is identical). Fall back to live compute.
            if (canonical.real_expected_qty is not None
                    and isinstance(canonical.real_txn_breakdown, dict)):
                totals = canonical.real_txn_breakdown.get("totals", {})
                sales_q = float(totals.get("sales", 0))
                returns_q = float(totals.get("returns", 0))
                grn_q = float(totals.get("grn", 0))
                rts_q = float(totals.get("rts", 0))
                damage_q = float(totals.get("damage", 0))
                office_q = float(totals.get("office", 0))
                verification_q = float(totals.get("verification", 0))
            else:
                sales_q = _sum_window(sales_idx, oid, iid, day_from, day_to)
                returns_q = _sum_window(returns_idx, oid, iid, day_from, day_to)
                grn_q = _sum_window(grn_idx, oid, iid, day_from, day_to)
                rts_q = _sum_window(rts_idx, oid, iid, day_from, day_to)
                damage_q = _sum_window(damage_idx, oid, iid, day_from, day_to)
                office_q = _sum_window(office_idx, oid, iid, day_from, day_to)
                verification_q = _sum_window(verification_idx, oid, iid, day_from, day_to)

            expected = (
                anchor_qty
                + grn_q + returns_q + verification_q
                - sales_q - rts_q - damage_q - office_q
            )
            real_variance = date_counted - expected
            real_value = real_variance * cost

            # Roll into item-level totals ONCE per date, not per location.
            real_variance_sum += real_variance
            expected_sum += expected
            events_computable += len(day_counts)  # every location row is "computable"
            if real_value < 0:
                real_loss_events += real_value
            elif real_value > 0:
                real_surplus_events += real_value

            item_sales += sales_q
            item_returns += returns_q
            item_grn += grn_q
            item_rts += rts_q
            item_damage += damage_q
            item_office += office_q
            item_verification += verification_q

            # Emit one row per (date, location). Only the LAST row of the
            # date carries the date-level totals (expected / variance / value)
            # — earlier rows blank those cells so the reader isn't misled into
            # thinking each location has its own reconciliation.
            for idx_i, c in enumerate(day_counts):
                is_date_summary = idx_i == len(day_counts) - 1
                events.append({
                    "count_id": c.id, "date": str(cdate),
                    "time": _fmt_local(c.counted_at),
                    "location": c.location_tag or "",
                    "counted": float(c.actual_qty or 0),
                    # Anchor + txn totals carried on the LAST location row so
                    # the UI shows them once per date, not repeated per row.
                    "anchor_qty": anchor_qty if is_date_summary else None,
                    "anchor_date": str(anchor_date) if is_date_summary else None,
                    "sales": sales_q if is_date_summary else None,
                    "returns": returns_q if is_date_summary else None,
                    "grn": grn_q if is_date_summary else None,
                    "rts": rts_q if is_date_summary else None,
                    "damage": damage_q if is_date_summary else None,
                    "office": office_q if is_date_summary else None,
                    "verification": verification_q if is_date_summary else None,
                    "expected": expected if is_date_summary else None,
                    "real_variance": real_variance if is_date_summary else None,
                    "real_value": real_value if is_date_summary else None,
                    "has_data": True,
                    "is_date_summary": is_date_summary,
                    "date_locations_count": len(day_counts),
                    "counter": (c.counted_by.username if c.counted_by_id and c.counted_by else ""),
                    "freeze_at": c.real_freeze_at.isoformat() if c.real_freeze_at else None,
                    "freeze_source": c.real_freeze_source or "live",
                    "txn_breakdown": canonical.real_txn_breakdown if is_date_summary and isinstance(canonical.real_txn_breakdown, dict) else None,
                })

        real_net_value = real_variance_sum * cost
        _o = outlet_map.get(oid)
        rows.append({
            "outlet_id": oid,
            "outlet_name": _o.outlet_name if _o else "",
            "item_id": iid,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "category": it.category or "",
            "counts_in_range": len(counts_sorted),
            "events_computable": events_computable,
            "latest_mypos_qty": latest_mypos_qty,
            "latest_mypos_date": str(latest_mypos_date) if latest_mypos_date else None,
            "cost_price": cost,
            "cost_source": cost_source,
            "counted_sum": counted_sum_all,
            "expected_sum": expected_sum if events_computable else None,
            "real_variance_sum": real_variance_sum,
            "real_net_value": real_net_value,
            "real_loss": real_loss_events,     # <= 0
            "real_surplus": real_surplus_events, # >= 0
            # Roll-up of txn types over the whole range for this item
            "sales_sum": item_sales,
            "returns_sum": item_returns,
            "grn_sum": item_grn,
            "rts_sum": item_rts,
            "damage_sum": item_damage,
            "office_sum": item_office,
            "verification_sum": item_verification,
            "events": events,
        })

    if request.query_params.get("only_variance") in ("1", "true"):
        rows = [r for r in rows if abs(r["real_variance_sum"]) > 0.001]

    summary = {
        "items_counted": len(rows),
        "total_events": sum(r["counts_in_range"] for r in rows),
        "events_computable": sum(r["events_computable"] for r in rows),
        "latest_pos_snapshot_date": str(latest_snap_date_global) if latest_snap_date_global else None,
        "real_loss": sum(r["real_loss"] for r in rows),
        "real_surplus": sum(r["real_surplus"] for r in rows),
        "real_net_value": sum(r["real_net_value"] for r in rows),
        "range_days": (to_date - from_date).days + 1,
    }

    sort_by = request.query_params.get("sort_by", "real_loss")
    order = request.query_params.get("order", "asc")
    rows = _sort_rows(rows, sort_by, order, REAL_LOSS_SORT_KEYS, "real_loss")

    if request.query_params.get("export") == "csv":
        header = [
            "Outlet", "Item code", "Item name", "Category",
            "Count date", "Count time", "Location", "Counted qty",
            "Anchor POS qty", "Anchor snapshot date",
            "GRN in", "Sales", "Returns", "Damage", "Office", "RTS", "Verification (signed)",
            "Expected qty", "Real variance", "Cost", "Real value (event)",
            "Counter",
            # First-row totals per item
            "Counted SUM", "Expected SUM",
            "Real variance SUM", "Real net value",
            "Real loss (gross)", "Real surplus (gross)",
        ]

        def iterator():
            for r in rows:
                for i, e in enumerate(r["events"]):
                    is_first = i == 0
                    yield [
                        r.get("outlet_name", ""),
                        r["item_code"], r["item_name"], r["category"],
                        e["date"], e["time"], e["location"], e["counted"],
                        "" if e["anchor_qty"] is None else e["anchor_qty"],
                        e["anchor_date"] or "",
                        "" if e["grn"] is None else e["grn"],
                        "" if e["sales"] is None else e["sales"],
                        "" if e["returns"] is None else e["returns"],
                        "" if e["damage"] is None else e["damage"],
                        "" if e["office"] is None else e["office"],
                        "" if e["rts"] is None else e["rts"],
                        "" if e["verification"] is None else e["verification"],
                        "" if e["expected"] is None else e["expected"],
                        "" if e["real_variance"] is None else e["real_variance"],
                        r["cost_price"],
                        "" if e["real_value"] is None else e["real_value"],
                        e["counter"],
                        (r["counted_sum"] if is_first else ""),
                        ("" if not is_first or r["expected_sum"] is None else r["expected_sum"]),
                        (r["real_variance_sum"] if is_first else ""),
                        (r["real_net_value"] if is_first else ""),
                        (r["real_loss"] if is_first else ""),
                        (r["real_surplus"] if is_first else ""),
                    ]

        resp = _csv_stream(header, iterator())
        resp["Content-Disposition"] = (
            f'attachment; filename="real-loss-{from_date}-to-{to_date}.csv"'
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
        "outlet_id": outlet.id if outlet else None,
        "all_outlets_mode": all_outlets_mode,
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

    # For items counted multiple times, fetch the latest single count qty.
    multi_item_ids = [iid for iid, r in count_map.items() if r["count_entries"] > 1]
    last_qty_map = {}
    if multi_item_ids:
        for sc in (
            StockCount.objects
            .filter(outlet_id=outlet_id, count_date__gte=from_date, count_date__lte=to_date,
                    item_id__in=multi_item_ids)
            .exclude(approval_status=StockCount.ApprovalStatus.REJECTED)
            .order_by("item_id", "-counted_at", "-id")
        ):
            if sc.item_id not in last_qty_map:
                last_qty_map[sc.item_id] = float(sc.actual_qty)

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
            entries = int(cnt["count_entries"] or 0)
            total = float(cnt["total_counted_qty"] or 0)
            avg = round(total / entries, 3) if entries else total
            last_qty = last_qty_map.get(it.id, total)
            counted_items.append({
                **base,
                "last_counted_date": str(cnt["last_counted_date"]) if cnt["last_counted_date"] else None,
                "last_counted_at": cnt["last_counted_at"].isoformat() if cnt["last_counted_at"] else None,
                "total_counted_qty": total,
                "avg_counted_qty": avg,
                "last_counted_qty": last_qty,
                "count_entries": entries,
                "multi_count": entries > 1,
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


# ---------------------------------------------------------------------------
# PO Planning — intelligent, velocity-based
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdmin])
def po_planning(request):
    """
    GET /api/dashboard/po-planning/

    Returns per-item purchase order suggestions driven by real SalesLine
    velocity + latest PosSnapshot stock levels.

    Query params:
      outlet=<id>             required (admin selects outlet)
      velocity_days=30|90     window for avg daily sales (default 30)
      cover_days=14           target days of stock to hold (default 14)
      filter=all|below_reorder|out_of_stock   (default below_reorder)
      q                       search item_code / item_name
      sort_by                 item_code|item_name|current_stock|days_cover|
                              avg_daily_30|avg_daily_90|suggested_qty|est_cost
      order=asc|desc
      export=csv
    """
    import csv as csv_mod
    import math
    from io import StringIO
    from django.http import HttpResponse
    from django.db.models import Sum
    from apps.uploads.models import SalesLine, SalesUploadBatch, PosSnapshot as PS

    outlet_id = request.query_params.get("outlet")
    if not outlet_id:
        return Response({"detail": "outlet param required."}, status=400)
    outlet = get_object_or_404(Outlet, pk=outlet_id)

    try:
        velocity_days = int(request.query_params.get("velocity_days") or 30)
        if velocity_days not in (7, 30, 90):
            velocity_days = 30
    except (ValueError, TypeError):
        velocity_days = 30

    try:
        cover_days = int(request.query_params.get("cover_days") or 14)
        cover_days = max(1, min(365, cover_days))
    except (ValueError, TypeError):
        cover_days = 14

    stock_filter = request.query_params.get("filter", "below_reorder")
    q = (request.query_params.get("q") or "").strip()
    sort_by = request.query_params.get("sort_by", "days_cover")
    order = request.query_params.get("order", "asc")

    today = date.today()

    # --- Sales velocity: aggregate SalesLine by item_code ---
    approved_batches = SalesUploadBatch.objects.filter(
        outlet=outlet,
        status=SalesUploadBatch.Status.SUCCESS,
        approval_status__in=(
            SalesUploadBatch.ApprovalStatus.AUTO,
            SalesUploadBatch.ApprovalStatus.APPROVED,
        ),
    ).values_list("id", flat=True)

    def _sales_agg(days):
        start = today - timedelta(days=days)
        return {
            row["item_code"]: float(row["qty"] or 0)
            for row in (
                SalesLine.objects
                .filter(batch_id__in=approved_batches, txn_date__gte=start, txn_date__lte=today)
                .values("item_code")
                .annotate(qty=Sum("qty"))
            )
        }

    sales_30 = _sales_agg(30)
    sales_90 = _sales_agg(90) if velocity_days == 90 else {}
    has_sales = bool(sales_30 or sales_90)

    # --- Latest PosSnapshot per item ---
    from django.db.models import Subquery, OuterRef
    latest_snap_date = (
        PS.objects
        .filter(outlet=outlet, item_id=OuterRef("item_id"))
        .order_by("-snapshot_date")
        .values("snapshot_date")[:1]
    )
    snaps = (
        PS.objects
        .filter(outlet=outlet)
        .annotate(_latest=Subquery(latest_snap_date))
        .filter(snapshot_date=F("_latest"))
        .select_related("item")
        .values("item_id", "item__item_code", "item__item_name",
                "item__category", "item__reorder_level", "item__cost_price",
                "pos_quantity", "snapshot_date")
    )

    # --- Build item map ---
    items_qs = Item.objects.filter(outlet=outlet)
    if q:
        items_qs = items_qs.filter(
            Q(item_code__icontains=q) | Q(item_name__icontains=q)
        )

    item_map = {i.item_code: i for i in items_qs}
    snap_map = {s["item__item_code"]: s for s in snaps}

    rows = []
    for code, item in item_map.items():
        snap = snap_map.get(code)
        current_stock = float(snap["pos_quantity"]) if snap else 0.0
        snap_date = str(snap["snapshot_date"]) if snap else None
        reorder_level = float(item.reorder_level or 0)
        cost_price = float(item.cost_price or 0)

        total_30 = sales_30.get(code, 0.0)
        avg_daily_30 = total_30 / 30.0
        total_90 = sales_90.get(code, total_30 * 3) if velocity_days == 90 else total_30 * 3
        avg_daily_90 = total_90 / 90.0 if velocity_days == 90 else total_30 / 30.0

        avg_daily = avg_daily_30 if velocity_days == 30 else avg_daily_90
        days_cover = (current_stock / avg_daily) if avg_daily > 0 else (999.0 if current_stock > 0 else 0.0)

        need = (cover_days * avg_daily) - current_stock
        suggested_qty = math.ceil(max(need, 0))
        est_cost = round(suggested_qty * cost_price, 2)

        # apply stock filter
        if stock_filter == "out_of_stock" and current_stock > 0:
            continue
        if stock_filter == "below_reorder" and current_stock > reorder_level:
            continue

        rows.append({
            "item_code": code,
            "item_name": item.item_name,
            "category": item.category or "",
            "reorder_level": reorder_level,
            "current_stock": round(current_stock, 3),
            "snap_date": snap_date,
            "avg_daily_30": round(avg_daily_30, 3),
            "avg_daily_90": round(avg_daily_90, 3),
            "total_30d": round(total_30, 3),
            "days_cover": round(days_cover, 1) if days_cover < 999 else None,
            "suggested_qty": suggested_qty,
            "cost_price": cost_price,
            "est_cost": est_cost,
            "has_sales_data": avg_daily_30 > 0,
        })

    # Sort
    SORT_KEYS = {
        "item_code": lambda r: r["item_code"],
        "item_name": lambda r: r["item_name"],
        "current_stock": lambda r: r["current_stock"],
        "days_cover": lambda r: (r["days_cover"] if r["days_cover"] is not None else 9999),
        "avg_daily_30": lambda r: r["avg_daily_30"],
        "avg_daily_90": lambda r: r["avg_daily_90"],
        "suggested_qty": lambda r: r["suggested_qty"],
        "est_cost": lambda r: r["est_cost"],
    }
    key_fn = SORT_KEYS.get(sort_by, SORT_KEYS["days_cover"])
    rows.sort(key=key_fn, reverse=(order == "desc"))

    if request.query_params.get("export") == "csv":
        buf = StringIO()
        writer = csv_mod.writer(buf)
        writer.writerow([
            "Item Code", "Item Name", "Category",
            "Reorder Level", "Current Stock", "Snapshot Date",
            "Avg Daily (30d)", "Avg Daily (90d)", "Total Sold (30d)",
            "Days Cover", "Suggested Order Qty", "Cost Price", "Est. Cost (LKR)",
        ])
        for r in rows:
            writer.writerow([
                r["item_code"], r["item_name"], r["category"],
                r["reorder_level"], r["current_stock"], r["snap_date"] or "",
                r["avg_daily_30"], r["avg_daily_90"], r["total_30d"],
                r["days_cover"] if r["days_cover"] is not None else "",
                r["suggested_qty"], r["cost_price"], r["est_cost"],
            ])
        resp = HttpResponse(buf.getvalue(), content_type="text/csv")
        resp["Content-Disposition"] = (
            f'attachment; filename="po-plan-{outlet.short_code}-{today}.csv"'
        )
        return resp

    return Response({
        "outlet_id": outlet.id,
        "outlet_name": outlet.outlet_name,
        "has_sales_data": has_sales,
        "velocity_days": velocity_days,
        "cover_days": cover_days,
        "as_of": str(today),
        "count": len(rows),
        "rows": rows,
    })
