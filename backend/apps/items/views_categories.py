"""
Category master — CRUD + bulk item assignment.

Admin + super-admin can manage; manager sees the dropdown options. Items keep
their free-text `category` field so existing reports/UI keep working; the new
`category_ref` FK runs alongside it and is authoritative going forward.
"""
from django.db import transaction
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin, IsManager
from apps.uploads.models import AuditLog
from .models import Category, Item


def _item_count_subquery():
    """Per-category item count without GROUP BY. Postgres rejects the
    naive .annotate(Count('items')) + Meta.ordering combination."""
    return Coalesce(
        Subquery(
            Item.objects
            .filter(category_ref=OuterRef("pk"))
            .order_by()
            .values("category_ref")
            .annotate(c=Count("id"))
            .values("c")[:1],
            output_field=IntegerField(),
        ),
        0,
    )


def _serialize(c, item_count=None):
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "sort_order": c.sort_order,
        "is_active": c.is_active,
        "item_count": item_count if item_count is not None else getattr(c, "item_count", 0),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def category_list_create(request):
    if request.method == "GET":
        qs = Category.objects.annotate(item_count=_item_count_subquery()).order_by("sort_order", "name")

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q))

        active = request.query_params.get("active")
        if active in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        elif active in ("0", "false", "False"):
            qs = qs.filter(is_active=False)

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1
        try:
            page_size = min(max(1, int(request.query_params.get("page_size", 100))), 500)
        except (ValueError, TypeError):
            page_size = 100

        total = qs.count()
        offset = (page - 1) * page_size
        rows = list(qs[offset: offset + page_size])

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "categories": [_serialize(c, c.item_count) for c in rows],
        })

    # POST — create
    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
    if Category.objects.filter(name__iexact=name).exists():
        return Response({"detail": f'Category "{name}" already exists.'}, status=status.HTTP_409_CONFLICT)

    c = Category.objects.create(
        name=name,
        description=(request.data.get("description") or "").strip(),
        sort_order=int(request.data.get("sort_order") or 0),
        is_active=bool(request.data.get("is_active", True)),
    )
    AuditLog.objects.create(
        user=request.user, action="create_category", entity_type="category",
        entity_id=str(c.id), details={"name": c.name},
    )
    return Response(_serialize(c, 0), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdmin])
def category_detail(request, pk):
    try:
        c = Category.objects.annotate(item_count=_item_count_subquery()).get(pk=pk)
    except Category.DoesNotExist:
        return Response({"detail": "Category not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_serialize(c, c.item_count))

    if request.method == "PATCH":
        data = request.data
        if "name" in data:
            new_name = (data.get("name") or "").strip()
            if not new_name:
                return Response({"detail": "name cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
            if Category.objects.filter(name__iexact=new_name).exclude(pk=c.pk).exists():
                return Response({"detail": f'Category "{new_name}" already exists.'}, status=status.HTTP_409_CONFLICT)
            c.name = new_name
        if "description" in data:
            c.description = (data.get("description") or "").strip()
        if "sort_order" in data:
            try:
                c.sort_order = int(data.get("sort_order") or 0)
            except (ValueError, TypeError):
                return Response({"detail": "sort_order must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        if "is_active" in data:
            c.is_active = bool(data.get("is_active"))
        c.save()
        AuditLog.objects.create(
            user=request.user, action="update_category", entity_type="category",
            entity_id=str(c.id), details={"name": c.name, "changes": dict(data)},
        )
        c.item_count = c.items.count()
        return Response(_serialize(c, c.item_count))

    # DELETE — soft-deactivate if items link to it; hard-delete otherwise.
    if c.items.exists():
        c.is_active = False
        c.save(update_fields=["is_active", "updated_at"])
        AuditLog.objects.create(
            user=request.user, action="deactivate_category", entity_type="category",
            entity_id=str(c.id), details={"name": c.name, "reason": "linked items exist"},
        )
        return Response({"status": "deactivated", "item_count": c.items.count()})
    name = c.name
    c.delete()
    AuditLog.objects.create(
        user=request.user, action="delete_category", entity_type="category",
        entity_id=str(pk), details={"name": name},
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAdmin])
def category_assign_items(request, pk):
    """
    Bulk-assign a set of items to this category.
    Body: { item_ids: [int], update_category_string: true|false }
    When update_category_string is true (default), also overwrites each
    Item.category CharField with this category's name so legacy reports that
    still read the string field stay in sync.
    """
    try:
        c = Category.objects.get(pk=pk)
    except Category.DoesNotExist:
        return Response({"detail": "Category not found."}, status=status.HTTP_404_NOT_FOUND)

    item_ids = request.data.get("item_ids") or []
    if not isinstance(item_ids, list) or not item_ids:
        return Response({"detail": "item_ids must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)
    update_string = bool(request.data.get("update_category_string", True))

    with transaction.atomic():
        qs = Item.objects.filter(pk__in=item_ids)
        updates = {"category_ref": c}
        if update_string:
            updates["category"] = c.name
        count = qs.update(**updates)

    AuditLog.objects.create(
        user=request.user, action="assign_category", entity_type="category",
        entity_id=str(c.id),
        details={"name": c.name, "item_count": count, "synced_string": update_string},
    )
    return Response({"updated": count, "category": _serialize(c, c.items.count())})


@api_view(["GET"])
@permission_classes([IsManager])
def category_options(request):
    """
    Light-weight list of active categories for dropdowns — no pagination.
    Used by the catalog filter and item edit dialog.
    """
    rows = Category.objects.filter(is_active=True).order_by("sort_order", "name").values(
        "id", "name"
    )
    return Response({"categories": list(rows)})
