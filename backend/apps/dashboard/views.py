from datetime import date, timedelta

from django.db.models import F, ExpressionWrapper, DecimalField, Count
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import IsManager, CanCount
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

    total_counted = StockCount.objects.filter(outlet=outlet, count_date=today).count()
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

    # Subquery: latest StockCount id per item for this outlet
    latest_count_sq = (
        StockCount.objects.filter(outlet=outlet, item=OuterRef("item"))
        .order_by("-count_date")
        .values("id")[:1]
    )

    snapshots = (
        PosSnapshot.objects.filter(outlet=outlet, snapshot_date=latest_snapshot)
        .select_related("item")
        .annotate(latest_count_id=Subquery(latest_count_sq))
    )

    # Fetch all relevant counts in one query
    count_ids = [s.latest_count_id for s in snapshots if s.latest_count_id is not None]
    counts_by_id = {
        c.id: c
        for c in StockCount.objects.filter(id__in=count_ids).select_related("counted_by")
    }

    results = []
    for snap in snapshots:
        latest_count = counts_by_id.get(snap.latest_count_id)
        actual_qty = float(latest_count.actual_qty) if latest_count else None
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
                "location_tag": latest_count.location_tag if latest_count else "",
                "last_counted": str(latest_count.count_date) if latest_count else None,
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

    date_counts = {
        sc.item_id: sc
        for sc in StockCount.objects.filter(outlet=outlet, count_date=count_date).select_related("counted_by")
    }

    results = []
    for snap in snapshots:
        sc = date_counts.get(snap.item_id)
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
                "today_actual_qty": float(sc.actual_qty) if sc else None,
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
        counted_today = StockCount.objects.filter(outlet=outlet, count_date=today).count()

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

    count, _ = StockCount.objects.update_or_create(
        outlet=outlet,
        item=item,
        count_date=count_date,
        defaults={
            "actual_qty": serializer.validated_data["actual_qty"],
            "location_tag": serializer.validated_data.get("location_tag", ""),
            "counted_by": request.user,
            "is_month_end": serializer.validated_data.get("is_month_end", False),
        },
    )
    return Response(StockCountSerializer(count).data, status=201)
