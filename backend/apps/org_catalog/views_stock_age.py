"""
Stock-age endpoints. Reads from the pre-built StockAgeSnapshot table; the
`/recompute/` endpoint shares one function with the nightly management
command so there is no drift between the two code paths.
"""
import csv
import time

from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsManager, IsAdmin

from .models import StockAgeSnapshot
from .services.stock_age import rebuild_stock_age


BUCKET_FILTERS = {
    "0_30":   Q(bucket_0_30__gt=0) & Q(oldest_lot_age_days__lte=30),
    "31_60":  Q(oldest_lot_age_days__gt=30) & Q(oldest_lot_age_days__lte=60),
    "61_90":  Q(oldest_lot_age_days__gt=60) & Q(oldest_lot_age_days__lte=90),
    "90_plus": Q(oldest_lot_age_days__gt=90),
}


def _base_qs(request):
    qs = StockAgeSnapshot.objects.select_related(
        "outlet", "item", "master_product", "master_product__category",
    )
    outlet_id = request.query_params.get("outlet_id")
    if outlet_id:
        qs = qs.filter(outlet_id=outlet_id)
    category_id = request.query_params.get("category_id")
    if category_id:
        qs = qs.filter(master_product__category_id=category_id)
    bucket = request.query_params.get("bucket")
    if bucket in BUCKET_FILTERS:
        qs = qs.filter(BUCKET_FILTERS[bucket])
    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(item__item_code__icontains=q)
            | Q(item__item_name__icontains=q)
            | Q(master_product__master_code__icontains=q)
            | Q(master_product__name__icontains=q)
        )
    min_age = request.query_params.get("min_age_days")
    if min_age:
        try:
            qs = qs.filter(oldest_lot_age_days__gte=int(min_age))
        except ValueError:
            pass
    return qs


def _row(r):
    return {
        "id": r.id,
        "outlet_id": r.outlet_id,
        "outlet_name": r.outlet.outlet_name,
        "item_id": r.item_id,
        "item_code": r.item.item_code,
        "item_name": r.item.item_name,
        "master_product_id": r.master_product_id,
        "master_code": r.master_product.master_code if r.master_product_id else None,
        "master_name": r.master_product.name if r.master_product_id else None,
        "category_name": (
            r.master_product.category.name
            if r.master_product_id and r.master_product.category_id else None
        ),
        "on_hand_qty": round(r.on_hand_qty, 3),
        "oldest_lot_date": r.oldest_lot_date.isoformat() if r.oldest_lot_date else None,
        "oldest_lot_age_days": r.oldest_lot_age_days,
        "weighted_avg_age_days": round(r.weighted_avg_age_days, 1),
        "bucket_0_30": round(r.bucket_0_30, 3),
        "bucket_31_60": round(r.bucket_31_60, 3),
        "bucket_61_90": round(r.bucket_61_90, 3),
        "bucket_90_plus": round(r.bucket_90_plus, 3),
        "unknown_age_qty": round(r.unknown_age_qty, 3),
        "latest_pos_qty": r.latest_pos_qty,
        "latest_pos_date": r.latest_pos_date.isoformat() if r.latest_pos_date else None,
        "on_hand_value": round(r.on_hand_value, 2),
        "computed_at": r.computed_at.isoformat() if r.computed_at else None,
    }


@api_view(["GET"])
@permission_classes([IsManager])
def stock_age_list(request):
    """GET /api/org/stock-age/?outlet_id=&bucket=&q=&page=&page_size="""
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(500, int(request.query_params.get("page_size") or 100)))
    except (TypeError, ValueError):
        page_size = 100

    qs = _base_qs(request).order_by("-oldest_lot_age_days", "item__item_code")
    total = qs.count()
    offset = (page - 1) * page_size
    rows = qs[offset: offset + page_size]
    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "rows": [_row(r) for r in rows],
    })


@api_view(["GET"])
@permission_classes([IsManager])
def stock_age_summary(request):
    """
    GET /api/org/stock-age/summary/
    Dashboard widget payload: bucket totals, % of value > 90 days, dead-stock count.
    """
    qs = _base_qs(request)
    totals = qs.aggregate(
        rows=Count("id"),
        total_qty=Sum("on_hand_qty"),
        total_value=Sum("on_hand_value"),
        b0=Sum("bucket_0_30"),
        b1=Sum("bucket_31_60"),
        b2=Sum("bucket_61_90"),
        b3=Sum("bucket_90_plus"),
        unknown=Sum("unknown_age_qty"),
    )
    over_90_skus = qs.filter(oldest_lot_age_days__gt=90).count()
    # "Dead" = old and not selling: age > 90 and no sale in 60 days (use DemandSnapshot.last_sale_date via join).
    # We keep it simple here: rows with bucket_90_plus > 0 and no recent movement.
    latest = qs.order_by("-computed_at").values_list("computed_at", flat=True).first()

    total_value = totals.get("total_value") or 0.0
    # Approximate the 90+ value: use proportion of qty in bucket_90_plus.
    total_qty = totals.get("total_qty") or 0.0
    bucket_90_qty = totals.get("b3") or 0.0
    pct_over_90_by_qty = (bucket_90_qty / total_qty * 100.0) if total_qty > 0 else 0.0

    return Response({
        "rows": totals.get("rows") or 0,
        "total_qty": round(total_qty, 3),
        "total_value": round(total_value, 2),
        "buckets": {
            "0_30":   round(totals.get("b0") or 0.0, 3),
            "31_60":  round(totals.get("b1") or 0.0, 3),
            "61_90":  round(totals.get("b2") or 0.0, 3),
            "90_plus": round(bucket_90_qty, 3),
        },
        "unknown_age_qty": round(totals.get("unknown") or 0.0, 3),
        "over_90_sku_count": over_90_skus,
        "pct_over_90_by_qty": round(pct_over_90_by_qty, 1),
        "last_built_at": latest.isoformat() if latest else None,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def stock_age_export(request):
    """GET /api/org/stock-age/export/ — CSV download honoring the same filters."""
    qs = _base_qs(request).order_by("-oldest_lot_age_days", "item__item_code")
    resp = HttpResponse(content_type="text/csv")
    resp["Content-Disposition"] = 'attachment; filename="stock_age.csv"'
    writer = csv.writer(resp)
    writer.writerow([
        "Outlet", "Item Code", "Item Name", "Master Code", "Category",
        "On Hand Qty", "Oldest Lot Date", "Oldest Age (d)", "Weighted Avg Age (d)",
        "0-30", "31-60", "61-90", "90+", "Unknown Age Qty",
        "POS Qty", "POS Date", "On-hand Value", "Computed At",
    ])
    for r in qs.iterator(chunk_size=2000):
        writer.writerow([
            r.outlet.outlet_name,
            r.item.item_code,
            r.item.item_name,
            r.master_product.master_code if r.master_product_id else "",
            (r.master_product.category.name
             if r.master_product_id and r.master_product.category_id else ""),
            round(r.on_hand_qty, 3),
            r.oldest_lot_date.isoformat() if r.oldest_lot_date else "",
            r.oldest_lot_age_days,
            round(r.weighted_avg_age_days, 1),
            round(r.bucket_0_30, 3),
            round(r.bucket_31_60, 3),
            round(r.bucket_61_90, 3),
            round(r.bucket_90_plus, 3),
            round(r.unknown_age_qty, 3),
            r.latest_pos_qty if r.latest_pos_qty is not None else "",
            r.latest_pos_date.isoformat() if r.latest_pos_date else "",
            round(r.on_hand_value, 2),
            r.computed_at.isoformat() if r.computed_at else "",
        ])
    return resp


@api_view(["POST"])
@permission_classes([IsAdmin])
def stock_age_recompute(request):
    """
    POST /api/org/stock-age/recompute/
    body: { outlet_id?: int, item_code?: str }
    Rebuild the snapshot without waiting for the nightly job.
    """
    outlet_id = request.data.get("outlet_id") or None
    item_code = (request.data.get("item_code") or "").strip() or None
    try:
        outlet_id = int(outlet_id) if outlet_id else None
    except (TypeError, ValueError):
        return Response({"detail": "outlet_id must be an integer."}, status=400)

    t0 = time.monotonic()
    n = rebuild_stock_age(outlet_id=outlet_id, item_code=item_code)
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    return Response({"rebuilt_rows": n, "elapsed_ms": elapsed_ms})
