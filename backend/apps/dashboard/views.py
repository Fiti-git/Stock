from datetime import date, timedelta

from django.db.models import F, ExpressionWrapper, DecimalField, Count, Sum, Max
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User, MobileDevice
from apps.accounts.permissions import IsManager, CanCount, IsAdmin
from apps.outlets.models import Outlet
from apps.items.models import PendingItem
from apps.uploads.models import PosSnapshot, UploadLog
from .models import StockCount
from .serializers import VarianceSerializer, StockCountSerializer


def _resolve_outlet(request):
    """Return the outlet to operate on.

    Admins may override by passing ?outlet=<id>. All other roles are
    locked to their assigned outlet.
    """
    if request.user.role == User.Role.ADMIN and request.query_params.get("outlet"):
        return get_object_or_404(Outlet, pk=request.query_params["outlet"])
    return request.user.outlet


@api_view(["GET"])
@permission_classes([IsManager])
def count_progress(request):
    """Today's count progress for the manager's outlet."""
    outlet = _resolve_outlet(request)
    today = date.today()

    total_counted = StockCount.objects.filter(outlet=outlet, count_date=today).values("item_id").distinct().count()
    # Total items in today's POS snapshot
    total_items = PosSnapshot.objects.filter(outlet=outlet, snapshot_date=today).count()
    # Pending barcode items
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
    Returns items sorted by absolute variance descending, limited to top 200.

    Query params:
      limit — max rows to return (default 200, max 500)
    """
    from django.db.models import OuterRef, Subquery, FloatField

    outlet = _resolve_outlet(request)

    try:
        limit = min(int(request.query_params.get("limit", 200)), 500)
    except (TypeError, ValueError):
        limit = 200

    # Get latest snapshot date available
    latest_snapshot = (
        PosSnapshot.objects.filter(outlet=outlet)
        .order_by("-snapshot_date")
        .values_list("snapshot_date", flat=True)
        .first()
    )

    if not latest_snapshot:
        return Response([])

    # For each item: find the latest count_date, then SUM all location entries for that date
    # Step 1: latest count_date per item
    latest_date_by_item = {
        row["item_id"]: row["max_date"]
        for row in StockCount.objects.filter(outlet=outlet)
        .values("item_id")
        .annotate(max_date=Max("count_date"))
    }

    # Step 2: sum actual_qty per item for its latest count_date
    summed_counts = {}
    for row in (
        StockCount.objects
        .filter(outlet=outlet, item_id__in=latest_date_by_item.keys())
        .values("item_id", "count_date")
        .annotate(total_qty=Sum("actual_qty"))
    ):
        item_id = row["item_id"]
        if row["count_date"] == latest_date_by_item.get(item_id):
            summed_counts[item_id] = {
                "total_qty": float(row["total_qty"]),
                "count_date": row["count_date"],
            }

    snapshots = (
        PosSnapshot.objects.filter(outlet=outlet, snapshot_date=latest_snapshot)
        .select_related("item")
    )

    results = []
    for snap in snapshots:
        count_data = summed_counts.get(snap.item.id)
        actual_qty = count_data["total_qty"] if count_data else None
        pos_qty = float(snap.pos_quantity)
        variance = (actual_qty - pos_qty) if actual_qty is not None else None

        results.append(
            {
                "item_id": snap.item.id,
                "item_code": snap.item.item_code,
                "item_name": snap.item.item_name,
                "category": snap.item.category,
                "pos_qty": pos_qty,
                "actual_qty": actual_qty,
                "variance": variance,
                "location_tag": "",
                "last_counted": str(count_data["count_date"]) if count_data else None,
                "snapshot_date": str(latest_snapshot),
            }
        )

    # Sort by abs(variance) descending, uncounted items last
    results.sort(
        key=lambda x: abs(x["variance"]) if x["variance"] is not None else -999,
        reverse=True,
    )

    results = results[:limit]

    # Pagination
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(int(request.query_params.get("page_size", 50)), 200)
    except (TypeError, ValueError):
        page_size = 50

    total = len(results)
    offset = (page - 1) * page_size
    page_results = results[offset: offset + page_size]

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

    # Negative stock: POS quantity < 0
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

    # Missing upload check — last 7 days Mon–Sat
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

    # Pending barcodes count
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
    Items for the user's outlet from the POS snapshot for the requested date,
    annotated with that date's count if already entered. Uncounted items first.

    Query params:
      outlet     — outlet id (admin override)
      count_date — YYYY-MM-DD (default: today)
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

    # Resolve the count date (defaults to today)
    raw_date = request.query_params.get("count_date", "")
    try:
        from datetime import datetime
        count_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
    except ValueError:
        count_date = date.today()

    snapshots = (
        PosSnapshot.objects.filter(outlet=outlet, snapshot_date=count_date)
        .select_related("item")
    )

    if not snapshots.exists():
        return Response(
            {
                "detail": f"No POS upload found for {count_date}. Ask the manager to upload the XLS for this date first.",
                "no_upload": True,
                "count_date": str(count_date),
            },
            status=200,
        )

    # Aggregate all location counts per item for this date
    summed_date_counts = {
        row["item_id"]: row["total_qty"]
        for row in StockCount.objects.filter(outlet=outlet, count_date=count_date)
        .values("item_id")
        .annotate(total_qty=Sum("actual_qty"))
    }
    # For display: get the most recent count record per item (for counted_by info)
    last_count_per_item = {}
    for sc in StockCount.objects.filter(outlet=outlet, count_date=count_date).select_related("counted_by").order_by("item_id", "-counted_at"):
        if sc.item_id not in last_count_per_item:
            last_count_per_item[sc.item_id] = sc

    results = []
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
                "today_count_id": sc.id if sc else None,
                "today_actual_qty": float(total_qty) if total_qty is not None else None,
                "today_location_tag": sc.location_tag if sc else "",
                "today_counted_by": sc.counted_by.username if sc and sc.counted_by else None,
            }
        )

    # Uncounted first, then by item_code
    results.sort(key=lambda x: (x["today_actual_qty"] is not None, x["item_code"]))

    counted_count = sum(1 for r in results if r["today_actual_qty"] is not None)

    # Pagination
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
    """
    Shrinkage analytics over time.

    Query params:
      outlet   — outlet id (admin override)
      period   — 'weekly' (default) or 'monthly'
      from     — start date YYYY-MM-DD (default: 4 weeks ago)
      to       — end date YYYY-MM-DD (default: today)
      category — optional category filter
    """
    from datetime import datetime
    from .analytics import compute_shrinkage

    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    today = date.today()
    period = request.query_params.get("period", "weekly")
    if period not in ("weekly", "monthly"):
        period = "weekly"

    try:
        from_date = datetime.strptime(request.query_params.get("from", ""), "%Y-%m-%d").date()
    except ValueError:
        from_date = today - timedelta(weeks=4)

    try:
        to_date = datetime.strptime(request.query_params.get("to", ""), "%Y-%m-%d").date()
    except ValueError:
        to_date = today

    category = request.query_params.get("category") or None

    periods, summary = compute_shrinkage(outlet, from_date, to_date, period, category)
    return Response({"periods": periods, "summary": summary})


@api_view(["GET"])
@permission_classes([IsManager])
def admin_summary(request):
    """
    Cross-outlet summary for admins. Returns per-outlet status rows + system totals.
    Admin-only; managers receive 403.
    """
    if request.user.role != "admin":
        from rest_framework.response import Response as R
        return R({"detail": "Admin only."}, status=403)

    today = date.today()
    outlets = Outlet.objects.all().order_by("outlet_name")

    # Uploaded today: outlet_ids with a successful upload for today
    uploaded_today_ids = set(
        UploadLog.objects.filter(status=UploadLog.Status.SUCCESS, snapshot_date=today)
        .values_list("outlet_id", flat=True)
    )

    # Item counts per outlet (from latest snapshot)
    from django.db.models import Max
    from apps.items.models import Item

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

    return Response({
        "today": str(today),
        "outlet_count": len(rows),
        "total_items": total_items,
        "total_pending_barcodes": total_pending,
        "total_negative_today": total_negative,
        "outlets": rows,
    })


@api_view(["POST"])
@permission_classes([CanCount])
def submit_count(request):
    """Submit a physical stock count for an item."""
    from .serializers import SubmitCountSerializer
    from apps.accounts.device_utils import touch_device, get_device_uuid

    serializer = SubmitCountSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    from apps.items.models import Item

    try:
        item = Item.objects.get(pk=serializer.validated_data["item_id"])
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=404)

    outlet = request.user.outlet

    raw_date = request.data.get("count_date", "")
    try:
        from datetime import datetime
        count_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        count_date = date.today()

    device_uuid = get_device_uuid(request)
    touch_device(request, action="count")

    count = StockCount.objects.create(
        outlet=outlet,
        item=item,
        count_date=count_date,
        actual_qty=serializer.validated_data["actual_qty"],
        location_tag=serializer.validated_data.get("location_tag", ""),
        counted_by=request.user,
        is_month_end=serializer.validated_data.get("is_month_end", False),
        device_uuid=device_uuid,
    )
    return Response(StockCountSerializer(count).data, status=201)


@api_view(["GET"])
@permission_classes([IsManager])
def daily_counts(request):
    """
    All StockCount records for an outlet on a given date, with item details.
    Useful for reviewing what was counted, where, and by whom.

    Query params:
      date_from  — YYYY-MM-DD (inclusive, default: today)
      date_to    — YYYY-MM-DD (inclusive, default: date_from)
      count_date — YYYY-MM-DD (legacy single-day; used as both bounds if set)
      outlet     — outlet id (admin override)
      search     — filter by item code or name
      page, page_size
    """
    from datetime import datetime

    outlet = _resolve_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    def _parse(raw):
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None

    legacy = _parse(request.query_params.get("count_date", ""))
    date_from = _parse(request.query_params.get("date_from", "")) or legacy or date.today()
    date_to = _parse(request.query_params.get("date_to", "")) or legacy or date_from
    if date_to < date_from:
        date_from, date_to = date_to, date_from

    search = request.query_params.get("search", "").strip()

    qs = (
        StockCount.objects.filter(
            outlet=outlet,
            count_date__gte=date_from,
            count_date__lte=date_to,
        )
        .select_related("item", "counted_by")
        .order_by("-count_date", "item__item_code", "counted_at")
    )

    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(item__item_code__icontains=search) | Q(item__item_name__icontains=search)
        )

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
    page_qs = qs[offset: offset + page_size]

    results = [
        {
            "id": sc.id,
            "item_code": sc.item.item_code,
            "item_name": sc.item.item_name,
            "category": sc.item.category,
            "location_tag": sc.location_tag,
            "actual_qty": float(sc.actual_qty),
            "counted_by_username": sc.counted_by.username if sc.counted_by else None,
            "counted_at": sc.counted_at.isoformat(),
            "count_date": str(sc.count_date),
            "is_month_end": sc.is_month_end,
        }
        for sc in page_qs
    ]

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
    """
    Per-outlet-per-date aggregation of daily uploads.

    Query params:
      from_date — YYYY-MM-DD (default: 7 days ago)
      to_date   — YYYY-MM-DD (default: today)
      outlet    — outlet id (optional, filter to one outlet)

    Response: one row per (outlet, snapshot_date) with totals and a negative-items block.
    """
    from datetime import datetime
    from decimal import Decimal
    from django.db.models import Q, DecimalField, ExpressionWrapper
    from django.db.models.functions import Coalesce

    def _parse_date(raw, default):
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return default

    today = date.today()
    from_date = _parse_date(request.query_params.get("from_date"), today - timedelta(days=7))
    to_date = _parse_date(request.query_params.get("to_date"), today)
    outlet_filter = request.query_params.get("outlet")

    # Aggregate PosSnapshot rows by (outlet, snapshot_date) in a single query.
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

    # All-items aggregation
    all_agg = (
        snap_qs
        .values("outlet_id", "snapshot_date")
        .annotate(
            total_items=Count("id"),
            total_cost_value=Sum(line_value),
            total_selling_value=Sum(line_sell),
        )
    )

    # Negative-items aggregation (pos_quantity < 0)
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

    # UploadLog for new_items_count
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

    # Outlet name lookup
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

    return Response({
        "from_date": str(from_date),
        "to_date": str(to_date),
        "results": rows,
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def mobile_devices_report(request):
    """
    Admin report: all mobile devices that have interacted with the system, with
    activity counters and first/last-seen timestamps.

    Query params:
      q      — search by uuid / username / outlet name
      outlet — filter to devices whose last_outlet matches
    """
    from django.db.models import Q
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
