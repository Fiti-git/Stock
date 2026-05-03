"""
Storefront read API. Public, anonymous-allowed, throttled.

Gated behind settings.STOREFRONT_API_ENABLED — when False (default), every
endpoint returns 503 so partial deploys can't accidentally expose a
half-built storefront.
"""
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.items.models import Item

from .models import ProductDescription, ProductImage
from .pricing import resolve_prices
from .serializers import ProductCardSerializer, ProductDetailSerializer


class StorefrontAnonThrottle(AnonRateThrottle):
    """Separate scope so storefront load doesn't starve admin requests."""
    scope = "storefront"


def _enabled():
    return getattr(settings, "STOREFRONT_API_ENABLED", False)


def _disabled_response():
    return Response(
        {"detail": "Storefront API is not enabled on this deployment."},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([StorefrontAnonThrottle])
def list_products(request):
    """
    GET /api/storefront/products/?category=&q=&page=&page_size=

    Returns published products with cover image and resolved storefront
    price. Items without a published ProductDescription are hidden.
    """
    if not _enabled():
        return _disabled_response()

    category = request.query_params.get("category", "").strip()
    q = request.query_params.get("q", "").strip()
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(60, max(1, int(request.query_params.get("page_size", 24))))
    except (TypeError, ValueError):
        page_size = 24

    published_item_ids = ProductDescription.objects.filter(
        is_published=True,
    ).values_list("item_id", flat=True)

    qs = Item.objects.filter(id__in=published_item_ids)
    if category:
        qs = qs.filter(category__iexact=category)
    if q:
        qs = qs.filter(item_name__icontains=q)
    qs = qs.order_by("item_name")

    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start:start + page_size])
    item_ids = [it.id for it in items]

    desc_by_item = {
        d.item_id: d for d in ProductDescription.objects.filter(item_id__in=item_ids)
    }
    images_by_item = {}
    for img in ProductImage.objects.filter(
        item_id__in=item_ids, is_active=True,
    ).order_by("item_id", "sort_order", "id"):
        images_by_item.setdefault(img.item_id, []).append(img)

    price_by_item = resolve_prices(item_ids)
    price_for_card = {iid: p.get("unit_price") for iid, p in price_by_item.items()}

    serializer = ProductCardSerializer(
        items, many=True,
        context={
            "request": request,
            "desc_by_item": desc_by_item,
            "images_by_item": images_by_item,
            "price_by_item": price_for_card,
        },
    )
    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": serializer.data,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([StorefrontAnonThrottle])
def product_detail(request, slug):
    """GET /api/storefront/products/<slug>/ — full product payload."""
    if not _enabled():
        return _disabled_response()

    desc = get_object_or_404(
        ProductDescription, slug=slug, is_published=True,
    )
    item = desc.item
    price_resolution = resolve_prices([item.id])
    serializer = ProductDetailSerializer(
        item, context={"request": request, "price_resolution": price_resolution},
    )
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([StorefrontAnonThrottle])
def list_categories(request):
    """
    GET /api/storefront/categories/

    Returns the distinct category names that have at least one published
    product. Cheap query; safe to hit on every storefront page.
    """
    if not _enabled():
        return _disabled_response()

    published_item_ids = ProductDescription.objects.filter(
        is_published=True,
    ).values_list("item_id", flat=True)

    rows = (
        Item.objects
        .filter(id__in=published_item_ids)
        .exclude(category="")
        .values_list("category", flat=True)
        .distinct()
        .order_by("category")
    )
    return Response({"results": [{"name": r} for r in rows]})


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([StorefrontAnonThrottle])
def health(request):
    """GET /api/storefront/health/ — used by smoke tests + storefront uptime."""
    return Response({
        "ok": True,
        "enabled": _enabled(),
    })


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([StorefrontAnonThrottle])
def list_outlets(request):
    """
    GET /api/storefront/outlets/ — public list of outlets that accept pickup.
    Used by the storefront's checkout page to render the pickup-location
    selector. Returns id + name + minimal contact info.
    """
    if not _enabled():
        return _disabled_response()
    from apps.outlets.models import Outlet
    rows = list(
        Outlet.objects.all().order_by("outlet_name")
        .values("id", "outlet_name", "address", "phone")
    )
    return Response({"results": rows})
