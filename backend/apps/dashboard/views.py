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
    """Today's count progress for the manager's outlet."""
    outlet = _resolve_outlet(request)
    today = date.today()

    total_counted = StockCount.objects.filter(outlet=outlet, count_date=today).values("item_id").distinct().count()
    total_items = PosSnapshot.objects.filter(outlet=outlet, snapshot_date=today).count()
    pending_barcodes = PendingItem.objects.filter(
        first_seen_outlet=outlet, status=PendingItem.Status.PENDING
    ).count()

    return Response(
        {
            "today": str(today),
            "counted": total_counted,
            "total_items": total_items,
            "pending_barcodes": pending_barcodes,
            "has_upload_today": total_items > 0,
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
        .annotate(
            variance=ExpressionWrapper(
                F("actual_qty") - F("pos_quantity"),
                output_field=DecimalField(max_digits=14, decimal_places=3),
            ),
        )
        .annotate(
            # NULL variances (no count) sort last under DESC by giving them -1
            abs_variance=Coalesce(Abs(F("variance")), Value(Decimal("-1"))),
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
def shrinkage(request):
    """Shrinkage analytics over time."""
    from .analytics import compute_shrinkage

    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    today = date.today()
    period = request.query_params.get("period", "weekly")
    if period not in ("weekly", "monthly"):
        period = "weekly"

    from_date = _parse_date(request.query_params.get("from", ""), default=today - timedelta(weeks=4))
    to_date = _parse_date(request.query_params.get("to", ""), default=today)

    category = request.query_params.get("category") or None

    periods, summary = compute_shrinkage(outlet, from_date, to_date, period, category)
    return Response({"periods": periods, "summary": summary})


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
    """All StockCount records for an outlet on a given date range."""
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
        StockCount.objects.filter(
            outlet=outlet,
            count_date__gte=date_from,
            count_date__lte=date_to,
        )
        .select_related("item", "counted_by", "approved_by")
        .order_by("-count_date", "item__item_code", "counted_at")
    )

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

    snapshots = {
        s.item_id: s for s in
        PosSnapshot.objects.filter(outlet=session.outlet, snapshot_date=session.count_date)
        .select_related("item")
    }

    # SME fallback: synthesize pseudo-snapshots from Item.on_hand if none uploaded
    if not snapshots:
        from apps.items.models import Item as _Item
        active_items = _Item.objects.filter(outlet=session.outlet, status=_Item.Status.ACTIVE)

        class _Pseudo:
            def __init__(self, item):
                self.item_id = item.id
                self.item = item
                self.pos_quantity = item.on_hand or Decimal("0")
                self.cost_price = item.cost_price or None
                self.selling_price = item.sell_price or None

        snapshots = {it.id: _Pseudo(it) for it in active_items}

    summed = {
        row["item_id"]: row["total"] or Decimal("0")
        for row in StockCount.objects.filter(
            outlet=session.outlet,
            count_date=session.count_date,
            session=session,
            approval_status__in=[
                StockCount.ApprovalStatus.SUBMITTED,
                StockCount.ApprovalStatus.APPROVED,
            ],
        ).values("item_id").annotate(total=Sum("actual_qty"))
    }

    created = 0
    with transaction.atomic():
        before_session = snapshot_session(session)

        # Auto-approve any still-submitted counts at close time
        still_submitted = StockCount.objects.filter(
            session=session,
            approval_status=StockCount.ApprovalStatus.SUBMITTED,
        ).select_for_update()
        now = timezone.now()
        for sc in still_submitted:
            before = snapshot_stock_count(sc)
            sc.approval_status = StockCount.ApprovalStatus.APPROVED
            sc.approved_by = request.user
            sc.approved_at = now
            sc.save(update_fields=["approval_status", "approved_by", "approved_at"])
            record_audit(
                user=request.user, action="stock_count.approve_on_close", entity=sc,
                before=before, after=snapshot_stock_count(sc),
            )

        for item_id, snap in snapshots.items():
            counted_qty = summed.get(item_id, Decimal("0"))
            pos_qty = Decimal(snap.pos_quantity)
            variance_qty = counted_qty - pos_qty
            if variance_qty == 0:
                continue
            unit = snap.cost_price or snap.selling_price or Decimal("0")
            variance_value = variance_qty * Decimal(unit or 0)

            _, was_created = VarianceRecord.objects.update_or_create(
                session=session,
                item_id=item_id,
                defaults=dict(
                    outlet=session.outlet,
                    count_date=session.count_date,
                    pos_qty=pos_qty,
                    counted_qty=counted_qty,
                    variance_qty=variance_qty,
                    variance_value=variance_value,
                ),
            )
            if was_created:
                created += 1

        session.status = CountSession.Status.CLOSED
        session.closed_by = request.user
        session.closed_at = timezone.now()
        session.save(update_fields=["status", "closed_by", "closed_at"])
        record_audit(
            user=request.user, action="count_session.close", entity=session,
            before=before_session, after=snapshot_session(session),
            extra={"variance_records_created": created},
        )

    return Response({
        "session_id": session.id,
        "status": session.status,
        "variance_generated": VarianceRecord.objects.filter(session=session).count(),
        "variance_created_now": created,
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
