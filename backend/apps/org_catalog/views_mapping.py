"""
Item → MasterProduct mapping endpoints.

Unlinked Items are invisible to org-level aggregations, so mapping coverage is
a first-class metric. The suggestion engine ranks candidates by:
  1. Barcode collision against any Item already linked to a master → 1.0
  2. Name token-overlap (Jaccard) → 0.0–0.8
  3. Category match → +0.1
  4. Pack-size substring match → +0.05
"""
import re

from django.db import transaction
from django.db.models import Q, OuterRef, Exists
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin, IsManager
from apps.items.models import Item, ItemBarcode
from apps.uploads.models import AuditLog

from .models import MasterProduct, ItemMasterLink


_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set:
    if not text:
        return set()
    return set(_TOKEN_RE.findall(text.lower()))


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = a & b
    union = a | b
    return len(inter) / len(union) if union else 0.0


def _paginate(request, default_size=50, max_size=500):
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size") or default_size)
    except (TypeError, ValueError):
        page_size = default_size
    return page, max(1, min(max_size, page_size))


def _item_dict(item: Item, barcode: str | None = None) -> dict:
    return {
        "id": item.id,
        "outlet_id": item.outlet_id,
        "outlet_name": item.outlet.outlet_name if item.outlet_id else None,
        "item_code": item.item_code,
        "item_name": item.item_name,
        "barcode": barcode if barcode is not None else item.primary_barcode,
        "category": item.category,
    }


@api_view(["GET"])
@permission_classes([IsAdmin])
def unmapped_items(request):
    """
    GET /api/org/item-links/unmapped/?q=&outlet_id=&page=&page_size=
    Items with no ItemMasterLink row. Used by the mapping page.
    """
    page, page_size = _paginate(request)

    # Fast "has no link" filter — avoids a N+1 join.
    qs = (
        Item.objects.select_related("outlet")
        .annotate(
            has_link=Exists(
                ItemMasterLink.objects.filter(item_id=OuterRef("pk"))
            )
        )
        .filter(has_link=False)
    )

    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(item_code__icontains=q)
            | Q(item_name__icontains=q)
            | Q(barcode__icontains=q)
        )

    outlet_id = request.query_params.get("outlet_id")
    if outlet_id:
        qs = qs.filter(outlet_id=outlet_id)

    total = qs.count()
    offset = (page - 1) * page_size
    rows = list(qs.order_by("outlet_id", "item_code")[offset: offset + page_size])

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": [_item_dict(i) for i in rows],
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def mapping_stats(request):
    """
    GET /api/org/item-links/stats/
    Coverage metric for the admin landing page.
    """
    total = Item.objects.count()
    mapped = ItemMasterLink.objects.count()
    pct = round(mapped / total * 100, 1) if total else 0.0
    return Response({
        "total_items": total,
        "mapped_items": mapped,
        "unmapped_items": max(0, total - mapped),
        "mapped_pct": pct,
    })


@api_view(["GET"])
@permission_classes([IsAdmin])
def suggest_masters(request):
    """
    GET /api/org/master-products/suggest/?item_id=<id>&limit=5
    Ranked MasterProduct candidates for a given Item.
    """
    item_id = request.query_params.get("item_id")
    if not item_id:
        return Response({"detail": "item_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    item = get_object_or_404(Item.objects.select_related("category_ref"), pk=item_id)

    try:
        limit = max(1, min(20, int(request.query_params.get("limit") or 5)))
    except (ValueError, TypeError):
        limit = 5

    # Gather candidate barcodes for this item (primary + all linked).
    item_barcodes = set(
        b.strip()
        for b in ItemBarcode.objects.filter(item=item).values_list("barcode", flat=True)
        if b and b.strip()
    )
    if item.barcode:
        item_barcodes.add(item.barcode.strip())

    # Barcode → master_id via any other Item linked to that master.
    barcode_hit_master_ids = set()
    if item_barcodes:
        barcode_hit_master_ids = set(
            ItemMasterLink.objects.filter(
                item__barcodes__barcode__in=item_barcodes
            ).values_list("master_product_id", flat=True)
        )
        barcode_hit_master_ids |= set(
            ItemMasterLink.objects.filter(
                item__barcode__in=item_barcodes
            ).values_list("master_product_id", flat=True)
        )

    item_tokens = _tokens(item.item_name)
    item_cat_id = item.category_ref_id
    item_pack_lower = ""  # Items don't carry a pack_size field — skip unless we add it.

    # Short-list candidate masters: any active master is eligible, but we cap
    # the scan to keep things fast. Prefer candidates matching barcode or
    # sharing at least one name token (rough token search via icontains on
    # each distinct longer token).
    candidates = MasterProduct.objects.filter(is_active=True).select_related(
        "category", "default_supplier"
    )

    # Narrow by name tokens (>=4 chars) to keep the scan bounded on large catalogs.
    long_tokens = [t for t in item_tokens if len(t) >= 4]
    if long_tokens or barcode_hit_master_ids:
        token_q = Q()
        for t in long_tokens[:5]:
            token_q |= Q(name__icontains=t) | Q(brand__icontains=t) | Q(master_code__icontains=t)
        if barcode_hit_master_ids:
            token_q |= Q(id__in=barcode_hit_master_ids)
        candidates = candidates.filter(token_q)

    candidates = list(candidates[:200])

    scored = []
    for m in candidates:
        score = 0.0
        reasons = []

        if m.id in barcode_hit_master_ids:
            score = 1.0
            reasons.append("barcode match")
        else:
            m_tokens = _tokens(m.name) | _tokens(m.brand)
            name_score = _jaccard(item_tokens, m_tokens) * 0.8
            if name_score:
                score += name_score
                reasons.append(f"name {round(name_score, 2)}")

            if item_cat_id and m.category_id == item_cat_id:
                score += 0.1
                reasons.append("same category")

            if m.pack_size and item_pack_lower and m.pack_size.lower() in item_pack_lower:
                score += 0.05
                reasons.append("pack size")

        if score <= 0:
            continue

        scored.append({
            "id": m.id,
            "master_code": m.master_code,
            "name": m.name,
            "brand": m.brand,
            "pack_size": m.pack_size,
            "unit": m.unit,
            "category_name": m.category.name if m.category_id else None,
            "default_supplier_code": m.default_supplier.code if m.default_supplier_id else None,
            "score": round(min(score, 1.0), 3),
            "reasons": reasons,
        })

    scored.sort(key=lambda r: r["score"], reverse=True)
    return Response({
        "item": _item_dict(item),
        "suggestions": scored[:limit],
    })


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def item_links(request):
    """
    GET  /api/org/item-links/?master_id=
    POST /api/org/item-links/    body: {item_id, master_product_id, confidence?}
    """
    if request.method == "GET":
        qs = ItemMasterLink.objects.select_related(
            "item", "item__outlet", "master_product"
        )
        master_id = request.query_params.get("master_id")
        if master_id:
            qs = qs.filter(master_product_id=master_id)
        return Response({
            "links": [
                {
                    "id": l.id,
                    "item_id": l.item_id,
                    "item_code": l.item.item_code,
                    "item_name": l.item.item_name,
                    "outlet_id": l.item.outlet_id,
                    "outlet_name": l.item.outlet.outlet_name if l.item.outlet_id else None,
                    "master_product_id": l.master_product_id,
                    "master_code": l.master_product.master_code,
                    "master_name": l.master_product.name,
                    "confidence": l.confidence,
                    "linked_at": l.linked_at.isoformat(),
                }
                for l in qs[:500]
            ],
        })

    # POST — create a single link
    data = request.data or {}
    item_id = data.get("item_id")
    master_id = data.get("master_product_id")
    if not item_id or not master_id:
        return Response(
            {"detail": "item_id and master_product_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    item = get_object_or_404(Item, pk=item_id)
    master = get_object_or_404(MasterProduct, pk=master_id)
    confidence = data.get("confidence")
    try:
        confidence = float(confidence) if confidence is not None else None
    except (ValueError, TypeError):
        confidence = None

    with transaction.atomic():
        link, created = ItemMasterLink.objects.update_or_create(
            item=item,
            defaults={
                "master_product": master,
                "linked_by": request.user,
                "confidence": confidence,
            },
        )

    AuditLog.objects.create(
        user=request.user,
        action="item_master_linked" if created else "item_master_relinked",
        entity_type="item_master_link",
        entity_id=str(link.id),
        details={
            "item_id": item.id,
            "item_code": item.item_code,
            "master_id": master.id,
            "master_code": master.master_code,
            "confidence": confidence,
        },
    )
    return Response(
        {
            "id": link.id,
            "item_id": link.item_id,
            "master_product_id": link.master_product_id,
            "confidence": link.confidence,
            "created": created,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAdmin])
def item_links_bulk(request):
    """
    POST /api/org/item-links/bulk/
    body: {links: [{item_id, master_product_id, confidence?}, ...]}
    Idempotent upsert — useful for "Apply top suggestion" across many items.
    """
    payload = request.data or {}
    links = payload.get("links") or []
    if not isinstance(links, list) or not links:
        return Response(
            {"detail": "links must be a non-empty list."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_count = 0
    updated_count = 0
    errors = []

    master_ids = {int(l["master_product_id"]) for l in links if l.get("master_product_id")}
    item_ids = {int(l["item_id"]) for l in links if l.get("item_id")}
    valid_masters = set(
        MasterProduct.objects.filter(id__in=master_ids).values_list("id", flat=True)
    )
    valid_items = set(Item.objects.filter(id__in=item_ids).values_list("id", flat=True))

    with transaction.atomic():
        for entry in links:
            try:
                iid = int(entry["item_id"])
                mid = int(entry["master_product_id"])
            except (KeyError, TypeError, ValueError):
                errors.append({"entry": entry, "reason": "bad payload"})
                continue
            if iid not in valid_items or mid not in valid_masters:
                errors.append({"entry": entry, "reason": "unknown item or master"})
                continue
            try:
                confidence = float(entry.get("confidence")) if entry.get("confidence") is not None else None
            except (ValueError, TypeError):
                confidence = None
            _, created = ItemMasterLink.objects.update_or_create(
                item_id=iid,
                defaults={
                    "master_product_id": mid,
                    "linked_by": request.user,
                    "confidence": confidence,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

    AuditLog.objects.create(
        user=request.user,
        action="item_master_bulk_link",
        entity_type="item_master_link",
        entity_id="",
        details={
            "created": created_count,
            "updated": updated_count,
            "errors": len(errors),
        },
    )
    return Response({
        "created": created_count,
        "updated": updated_count,
        "errors": errors,
    })


@api_view(["DELETE"])
@permission_classes([IsAdmin])
def item_link_detail(request, pk: int):
    """DELETE /api/org/item-links/<id>/  — unlink."""
    link = get_object_or_404(ItemMasterLink, pk=pk)
    item_id = link.item_id
    master_code = link.master_product.master_code
    link.delete()
    AuditLog.objects.create(
        user=request.user,
        action="item_master_unlinked",
        entity_type="item_master_link",
        entity_id=str(pk),
        details={"item_id": item_id, "master_code": master_code},
    )
    return Response({"status": "deleted"})
