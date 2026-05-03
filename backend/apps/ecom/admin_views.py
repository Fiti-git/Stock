"""
Admin-side ecom endpoints. Mounted at /api/ecom/admin/...

Used by the existing admin frontend (Phase 4 extension) to list orders,
edit product enrichment (descriptions + images), and manage price lists.
All endpoints are gated by IsAdmin (JWT) and the matching nav.ecom_*
permission codes; the frontend further hides routes whose codes the
logged-in user lacks.

Order-mutation endpoints (confirm-payment, cancel) live in views.py and
are also IsAdmin-gated — admin frontend calls those directly.
"""
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin
from apps.catalog_ext.models import (
    PriceList, PriceListItem, ProductDescription, ProductImage,
)
from apps.items.models import Item

from .models import EcomOrder
from .serializers import OrderSerializer


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_list_orders(request):
    """
    GET /api/ecom/admin/orders/?status=&outlet=&q=&page=&page_size=
    """
    qs = EcomOrder.objects.all().order_by("-created_at")

    if status_filter := request.query_params.get("status"):
        qs = qs.filter(status=status_filter)
    if outlet := request.query_params.get("outlet"):
        qs = qs.filter(outlet_id=outlet)
    if q := request.query_params.get("q"):
        from django.db.models import Q
        qs = qs.filter(
            Q(number__icontains=q) | Q(guest_name__icontains=q)
            | Q(guest_email__icontains=q) | Q(guest_phone__icontains=q)
            | Q(customer__name__icontains=q) | Q(customer__phone__icontains=q)
        )

    try:
        page = max(1, int(request.query_params.get("page", 1)))
        page_size = min(100, max(1, int(request.query_params.get("page_size", 25))))
    except (TypeError, ValueError):
        page, page_size = 1, 25

    total = qs.count()
    rows = list(qs[(page - 1) * page_size: page * page_size])
    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": OrderSerializer(rows, many=True).data,
    })


# ---------------------------------------------------------------------------
# Product enrichment — pick an Item + edit its catalog_ext rows
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_list_products(request):
    """
    GET /api/ecom/admin/products/?q=&outlet=&published=&page=&page_size=

    Returns Items with attached enrichment status flags so the operator can
    see at a glance which products still need slug / images / publish.
    """
    qs = Item.objects.all().order_by("item_code")
    if outlet := request.query_params.get("outlet"):
        qs = qs.filter(outlet_id=outlet)
    if q := request.query_params.get("q"):
        from django.db.models import Q
        qs = qs.filter(Q(item_code__icontains=q) | Q(item_name__icontains=q))

    published = request.query_params.get("published")
    if published == "true":
        qs = qs.filter(catalog_descriptions__is_published=True)
    elif published == "false":
        qs = qs.exclude(catalog_descriptions__is_published=True)

    try:
        page = max(1, int(request.query_params.get("page", 1)))
        page_size = min(100, max(1, int(request.query_params.get("page_size", 25))))
    except (TypeError, ValueError):
        page, page_size = 1, 25

    total = qs.count()
    items = list(qs[(page - 1) * page_size: page * page_size]
                 .values("id", "item_code", "item_name", "category", "outlet_id"))
    item_ids = [i["id"] for i in items]
    descs = {
        d.item_id: d for d in
        ProductDescription.objects.filter(item_id__in=item_ids)
    }
    image_counts = {}
    for img in ProductImage.objects.filter(item_id__in=item_ids, is_active=True):
        image_counts[img.item_id] = image_counts.get(img.item_id, 0) + 1

    for it in items:
        d = descs.get(it["id"])
        it["slug"] = d.slug if d else ""
        it["is_published"] = bool(d.is_published) if d else False
        it["short_description"] = d.short_description if d else ""
        it["image_count"] = image_counts.get(it["id"], 0)

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": items,
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_product_detail(request, item_id):
    item = get_object_or_404(Item, pk=item_id)
    desc = ProductDescription.objects.filter(item=item).first()
    images = list(
        ProductImage.objects.filter(item=item, is_active=True)
        .order_by("sort_order", "id")
        .values("id", "image", "alt_text", "sort_order")
    )
    for img in images:
        img["url"] = request.build_absolute_uri("/media/" + img["image"]) if img.get("image") else None
    return Response({
        "id": item.id,
        "item_code": item.item_code,
        "item_name": item.item_name,
        "category": item.category,
        "outlet_id": item.outlet_id,
        "description": (
            None if not desc else {
                "id": desc.id,
                "slug": desc.slug,
                "short_description": desc.short_description,
                "long_description": desc.long_description,
                "seo_title": desc.seo_title,
                "seo_description": desc.seo_description,
                "is_published": desc.is_published,
            }
        ),
        "images": images,
    })


@api_view(["PUT"])
@permission_classes([IsAdmin])
def admin_upsert_description(request, item_id):
    """
    PUT /api/ecom/admin/products/<item_id>/description/
    body: {slug, short_description, long_description, seo_title,
           seo_description, is_published}
    """
    item = get_object_or_404(Item, pk=item_id)
    payload = request.data
    slug = (payload.get("slug") or "").strip()
    if not slug:
        return Response({"detail": "slug is required."}, status=400)

    desc, _ = ProductDescription.objects.update_or_create(
        item=item,
        defaults={
            "slug": slug,
            "short_description": payload.get("short_description", "") or "",
            "long_description": payload.get("long_description", "") or "",
            "seo_title": payload.get("seo_title", "") or "",
            "seo_description": payload.get("seo_description", "") or "",
            "is_published": bool(payload.get("is_published", False)),
        },
    )
    return Response({
        "id": desc.id, "slug": desc.slug, "is_published": desc.is_published,
    })


@api_view(["POST"])
@permission_classes([IsAdmin])
def admin_upload_image(request, item_id):
    """
    POST /api/ecom/admin/products/<item_id>/images/  multipart: image, alt_text, sort_order
    """
    item = get_object_or_404(Item, pk=item_id)
    f = request.FILES.get("image")
    if not f:
        return Response({"detail": "image file is required."}, status=400)
    try:
        sort_order = int(request.data.get("sort_order", 0))
    except (TypeError, ValueError):
        sort_order = 0
    img = ProductImage.objects.create(
        item=item,
        image=f,
        alt_text=(request.data.get("alt_text") or "")[:200],
        sort_order=sort_order,
    )
    return Response({
        "id": img.id,
        "url": request.build_absolute_uri(img.image.url) if img.image else None,
        "alt_text": img.alt_text,
        "sort_order": img.sort_order,
    }, status=201)


@api_view(["DELETE"])
@permission_classes([IsAdmin])
def admin_delete_image(request, item_id, image_id):
    img = get_object_or_404(ProductImage, pk=image_id, item_id=item_id)
    img.delete()
    return Response(status=204)


# ---------------------------------------------------------------------------
# Price lists
# ---------------------------------------------------------------------------
def _price_list_payload(pl):
    return {
        "id": pl.id, "code": pl.code, "name": pl.name,
        "currency": pl.currency, "priority": pl.priority,
        "is_active": pl.is_active,
        "starts_at": pl.starts_at, "ends_at": pl.ends_at,
        "item_count": pl.items.count(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def admin_price_lists(request):
    if request.method == "GET":
        qs = PriceList.objects.all().order_by("priority", "id")
        return Response([_price_list_payload(p) for p in qs])

    payload = request.data
    code = (payload.get("code") or "").strip()
    name = (payload.get("name") or "").strip()
    if not code or not name:
        return Response({"detail": "code and name are required."}, status=400)
    if PriceList.objects.filter(code=code).exists():
        return Response({"detail": f"PriceList code '{code}' already exists."}, status=409)
    pl = PriceList.objects.create(
        code=code, name=name,
        currency=payload.get("currency", "LKR"),
        priority=int(payload.get("priority", 100) or 100),
        is_active=bool(payload.get("is_active", True)),
    )
    return Response(_price_list_payload(pl), status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdmin])
def admin_price_list_detail(request, pk):
    pl = get_object_or_404(PriceList, pk=pk)
    if request.method == "DELETE":
        pl.delete()
        return Response(status=204)
    if request.method == "PATCH":
        for field in ("name", "currency"):
            if field in request.data:
                setattr(pl, field, request.data[field] or "")
        if "priority" in request.data:
            try:
                pl.priority = int(request.data["priority"])
            except (TypeError, ValueError):
                return Response({"detail": "priority must be an integer."}, status=400)
        if "is_active" in request.data:
            pl.is_active = bool(request.data["is_active"])
        pl.save()
    items = list(
        PriceListItem.objects.filter(price_list=pl)
        .select_related("item")
        .values("id", "item_id", "item__item_code", "item__item_name",
                "unit_price", "compare_at_price", "is_active")
    )
    return Response({**_price_list_payload(pl), "items": items})


@api_view(["POST"])
@permission_classes([IsAdmin])
def admin_set_price(request, pk):
    """
    POST /api/ecom/admin/price-lists/<pk>/items/
    body: {item_id, unit_price, compare_at_price?, is_active?}
    """
    pl = get_object_or_404(PriceList, pk=pk)
    payload = request.data
    try:
        item_id = int(payload["item_id"])
        unit_price = Decimal(str(payload["unit_price"]))
    except (KeyError, TypeError, ValueError, InvalidOperation):
        return Response({"detail": "item_id and unit_price are required."}, status=400)
    cap = payload.get("compare_at_price")
    try:
        cap_dec = Decimal(str(cap)) if cap not in (None, "") else None
    except (InvalidOperation, TypeError, ValueError):
        return Response({"detail": "compare_at_price must be a number."}, status=400)

    pli, _ = PriceListItem.objects.update_or_create(
        price_list=pl, item_id=item_id,
        defaults={
            "unit_price": unit_price,
            "compare_at_price": cap_dec,
            "is_active": bool(payload.get("is_active", True)),
        },
    )
    return Response({
        "id": pli.id, "item_id": pli.item_id,
        "unit_price": str(pli.unit_price),
        "compare_at_price": str(pli.compare_at_price) if pli.compare_at_price is not None else None,
        "is_active": pli.is_active,
    })


@api_view(["DELETE"])
@permission_classes([IsAdmin])
def admin_delete_price(request, pk, item_id):
    deleted, _ = PriceListItem.objects.filter(price_list_id=pk, item_id=item_id).delete()
    return Response(status=204 if deleted else 404)
