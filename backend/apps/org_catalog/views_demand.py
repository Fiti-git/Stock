"""
Demand dashboard endpoint. Reads from the pre-built DemandSnapshot rather
than aggregating SalesLine live, which keeps it fast for the whole catalog.
"""
from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsManager

from .models import DemandSnapshot


@api_view(["GET"])
@permission_classes([IsManager])
def demand_list(request):
    """
    GET /api/org/demand/?outlet_id=&category_id=&supplier_id=&q=&page=&page_size=
    """
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(500, int(request.query_params.get("page_size") or 100)))
    except (TypeError, ValueError):
        page_size = 100

    qs = DemandSnapshot.objects.select_related(
        "master_product", "master_product__category",
        "master_product__default_supplier", "outlet",
    )

    outlet_id = request.query_params.get("outlet_id")
    if outlet_id:
        qs = qs.filter(outlet_id=outlet_id)

    category_id = request.query_params.get("category_id")
    if category_id:
        qs = qs.filter(master_product__category_id=category_id)

    supplier_id = request.query_params.get("supplier_id")
    if supplier_id:
        qs = qs.filter(master_product__default_supplier_id=supplier_id)

    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(master_product__name__icontains=q) | qs.filter(
            master_product__master_code__icontains=q
        )

    qs = qs.order_by("-total_qty_30d")

    total = qs.count()
    offset = (page - 1) * page_size
    rows = qs[offset: offset + page_size]

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "rows": [
            {
                "master_product_id": r.master_product_id,
                "master_code": r.master_product.master_code,
                "master_name": r.master_product.name,
                "category_name": r.master_product.category.name if r.master_product.category_id else None,
                "default_supplier_code": r.master_product.default_supplier.code if r.master_product.default_supplier_id else None,
                "outlet_id": r.outlet_id,
                "outlet_name": r.outlet.outlet_name,
                "avg_daily_qty_7d": round(r.avg_daily_qty_7d, 3),
                "avg_daily_qty_30d": round(r.avg_daily_qty_30d, 3),
                "avg_daily_qty_90d": round(r.avg_daily_qty_90d, 3),
                "total_qty_30d": round(r.total_qty_30d, 3),
                "last_sale_date": r.last_sale_date.isoformat() if r.last_sale_date else None,
                "on_hand_qty": r.on_hand_qty,
                "computed_at": r.computed_at.isoformat() if r.computed_at else None,
            }
            for r in rows
        ],
    })


@api_view(["GET"])
@permission_classes([IsManager])
def demand_summary(request):
    """
    GET /api/org/demand/summary/
    Lightweight org-wide totals for dashboards.
    """
    totals = DemandSnapshot.objects.aggregate(total_qty_30d=Sum("total_qty_30d"))
    row_count = DemandSnapshot.objects.count()
    latest = DemandSnapshot.objects.order_by("-computed_at").values_list("computed_at", flat=True).first()
    return Response({
        "rows": row_count,
        "total_qty_30d": round(totals["total_qty_30d"] or 0, 3),
        "last_built_at": latest.isoformat() if latest else None,
    })
