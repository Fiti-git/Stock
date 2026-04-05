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
    Returns items sorted by absolute variance descending.
    """
    outlet = _resolve_outlet(request)
    today = date.today()

    # Get latest snapshot date available
    latest_snapshot = (
        PosSnapshot.objects.filter(outlet=outlet)
        .order_by("-snapshot_date")
        .values_list("snapshot_date", flat=True)
        .first()
    )

    if not latest_snapshot:
        return Response([])

    snapshots = PosSnapshot.objects.filter(
        outlet=outlet, snapshot_date=latest_snapshot
    ).select_related("item")

    results = []
    for snap in snapshots:
        latest_count = (
            StockCount.objects.filter(outlet=outlet, item=snap.item)
            .order_by("-count_date")
            .first()
        )
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

    return Response(results)


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
    Items for the user's outlet from the latest POS snapshot,
    annotated with today's count if present. Uncounted items first.
    Admin may pass ?outlet=<id> to specify an outlet.
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

    latest_snapshot = (
        PosSnapshot.objects.filter(outlet=outlet)
        .order_by("-snapshot_date")
        .values_list("snapshot_date", flat=True)
        .first()
    )

    if not latest_snapshot:
        return Response([])

    snapshots = (
        PosSnapshot.objects.filter(outlet=outlet, snapshot_date=latest_snapshot)
        .select_related("item")
    )

    today = date.today()
    today_counts = {
        sc.item_id: sc
        for sc in StockCount.objects.filter(outlet=outlet, count_date=today).select_related("counted_by")
    }

    results = []
    for snap in snapshots:
        sc = today_counts.get(snap.item_id)
        results.append(
            {
                "item_id": snap.item.id,
                "item_code": snap.item.item_code,
                "item_name": snap.item.item_name,
                "category": snap.item.category,
                "barcode": snap.item.barcode,
                "pos_qty": float(snap.pos_quantity),
                "snapshot_date": str(latest_snapshot),
                "today_count_id": sc.id if sc else None,
                "today_actual_qty": float(sc.actual_qty) if sc else None,
                "today_location_tag": sc.location_tag if sc else "",
                "today_counted_by": sc.counted_by.username if sc and sc.counted_by else None,
            }
        )

    # Uncounted first, then by item_code
    results.sort(key=lambda x: (x["today_actual_qty"] is not None, x["item_code"]))
    return Response(results)


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
    count = StockCount.objects.create(
        outlet=outlet,
        item=item,
        count_date=date.today(),
        actual_qty=serializer.validated_data["actual_qty"],
        location_tag=serializer.validated_data.get("location_tag", ""),
        counted_by=request.user,
    )
    return Response(StockCountSerializer(count).data, status=201)
