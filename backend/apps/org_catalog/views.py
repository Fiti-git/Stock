"""
Organization catalog CRUD.

Stage 1: MasterProduct. Follows the same `@api_view` + manual-serialization
pattern used by suppliers/categories elsewhere in the codebase.
"""
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin, IsManager
from apps.uploads.models import AuditLog, Supplier
from apps.items.models import Category

from .models import MasterProduct


def _master_dict(m: MasterProduct) -> dict:
    return {
        "id": m.id,
        "master_code": m.master_code,
        "name": m.name,
        "brand": m.brand,
        "pack_size": m.pack_size,
        "unit": m.unit,
        "category_id": m.category_id,
        "category_name": m.category.name if m.category_id else None,
        "default_supplier_id": m.default_supplier_id,
        "default_supplier_code": m.default_supplier.code if m.default_supplier_id else None,
        "default_supplier_name": m.default_supplier.name if m.default_supplier_id else None,
        "min_order_qty": m.min_order_qty,
        "pack_multiple": m.pack_multiple,
        "target_days_of_cover": m.target_days_of_cover,
        "is_active": m.is_active,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


def _paginate(request, default_size=50, max_size=200):
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size") or default_size)
    except (TypeError, ValueError):
        page_size = default_size
    return page, max(1, min(max_size, page_size))


def _resolve_fk(data, key, model, field_label):
    """Pull an FK id out of request data and return (instance_or_None, error_response)."""
    raw = data.get(key, ...)
    if raw is ... or raw in (None, ""):
        return None, None
    try:
        return model.objects.get(pk=int(raw)), None
    except (model.DoesNotExist, ValueError, TypeError):
        return None, Response(
            {"detail": f"{field_label} not found."},
            status=status.HTTP_400_BAD_REQUEST,
        )


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def master_product_list_create(request):
    """
    GET  /api/org/master-products/?q=&active=&category_id=&supplier_id=&page=&page_size=
    POST /api/org/master-products/
    """
    if request.method == "GET":
        page, page_size = _paginate(request)
        qs = MasterProduct.objects.select_related("category", "default_supplier")

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(master_code__icontains=q)
                | Q(name__icontains=q)
                | Q(brand__icontains=q)
            )

        active = request.query_params.get("active")
        if active in ("1", "true", "yes"):
            qs = qs.filter(is_active=True)
        elif active in ("0", "false", "no"):
            qs = qs.filter(is_active=False)

        category_id = request.query_params.get("category_id")
        if category_id:
            qs = qs.filter(category_id=category_id)

        supplier_id = request.query_params.get("supplier_id")
        if supplier_id:
            qs = qs.filter(default_supplier_id=supplier_id)

        total = qs.count()
        offset = (page - 1) * page_size
        rows = qs.order_by("master_code")[offset: offset + page_size]
        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "master_products": [_master_dict(m) for m in rows],
        })

    # POST
    data = request.data or {}
    master_code = (data.get("master_code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    if not master_code:
        return Response({"detail": "master_code is required."}, status=status.HTTP_400_BAD_REQUEST)
    if not name:
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
    if MasterProduct.objects.filter(master_code=master_code).exists():
        return Response(
            {"detail": f"Master product '{master_code}' already exists."},
            status=status.HTTP_409_CONFLICT,
        )

    category, err = _resolve_fk(data, "category_id", Category, "Category")
    if err:
        return err
    supplier, err = _resolve_fk(data, "default_supplier_id", Supplier, "Supplier")
    if err:
        return err

    unit = (data.get("unit") or MasterProduct.Unit.EACH).strip().upper()
    if unit not in MasterProduct.Unit.values:
        return Response(
            {"detail": f"Unit must be one of {MasterProduct.Unit.values}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        m = MasterProduct.objects.create(
            master_code=master_code,
            name=name[:300],
            brand=(data.get("brand") or "").strip()[:200],
            pack_size=(data.get("pack_size") or "").strip()[:50],
            unit=unit,
            category=category,
            default_supplier=supplier,
            min_order_qty=max(1, int(data.get("min_order_qty") or 1)),
            pack_multiple=max(1, int(data.get("pack_multiple") or 1)),
            target_days_of_cover=max(1, int(data.get("target_days_of_cover") or 14)),
            is_active=bool(data.get("is_active", True)),
        )
    except (ValueError, TypeError):
        return Response(
            {"detail": "min_order_qty, pack_multiple, target_days_of_cover must be integers."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except IntegrityError:
        return Response(
            {"detail": "Could not create master product."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    AuditLog.objects.create(
        user=request.user,
        action="master_product_created",
        entity_type="master_product",
        entity_id=str(m.id),
        details={"master_code": m.master_code, "name": m.name},
    )
    return Response(_master_dict(m), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdmin])
def master_product_detail(request, pk: int):
    m = get_object_or_404(
        MasterProduct.objects.select_related("category", "default_supplier"),
        pk=pk,
    )

    if request.method == "GET":
        return Response(_master_dict(m))

    if request.method == "PATCH":
        data = request.data or {}
        changes = {}

        text_fields = {
            "name": 300,
            "brand": 200,
            "pack_size": 50,
        }
        for field, max_len in text_fields.items():
            if field in data:
                new_val = (data.get(field) or "").strip()[:max_len]
                current = getattr(m, field)
                if new_val != current:
                    changes[field] = {"old": current, "new": new_val}
                    setattr(m, field, new_val)

        if "unit" in data:
            new_val = (data.get("unit") or "").strip().upper()
            if new_val not in MasterProduct.Unit.values:
                return Response(
                    {"detail": f"Unit must be one of {MasterProduct.Unit.values}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if new_val != m.unit:
                changes["unit"] = {"old": m.unit, "new": new_val}
                m.unit = new_val

        if "category_id" in data:
            category, err = _resolve_fk(data, "category_id", Category, "Category")
            if err:
                return err
            if (category.id if category else None) != m.category_id:
                changes["category_id"] = {"old": m.category_id, "new": category.id if category else None}
                m.category = category

        if "default_supplier_id" in data:
            supplier, err = _resolve_fk(data, "default_supplier_id", Supplier, "Supplier")
            if err:
                return err
            if (supplier.id if supplier else None) != m.default_supplier_id:
                changes["default_supplier_id"] = {
                    "old": m.default_supplier_id,
                    "new": supplier.id if supplier else None,
                }
                m.default_supplier = supplier

        int_fields = ("min_order_qty", "pack_multiple", "target_days_of_cover")
        for field in int_fields:
            if field in data:
                try:
                    new_val = max(1, int(data.get(field) or 1))
                except (ValueError, TypeError):
                    return Response(
                        {"detail": f"{field} must be an integer."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                current = getattr(m, field)
                if new_val != current:
                    changes[field] = {"old": current, "new": new_val}
                    setattr(m, field, new_val)

        if "is_active" in data:
            new_val = bool(data.get("is_active"))
            if new_val != m.is_active:
                changes["is_active"] = {"old": m.is_active, "new": new_val}
                m.is_active = new_val

        # master_code is the natural key and not editable post-create, matching
        # the Supplier.code convention elsewhere in the app.
        if changes:
            m.save()
            AuditLog.objects.create(
                user=request.user,
                action="master_product_updated",
                entity_type="master_product",
                entity_id=str(m.id),
                details={"master_code": m.master_code, "changes": changes},
            )
        return Response(_master_dict(m))

    # DELETE — soft-deactivate if anything already links here; hard-delete otherwise.
    has_links = m.item_links.exists() if hasattr(m, "item_links") else False
    if has_links:
        m.is_active = False
        m.save(update_fields=["is_active", "updated_at"])
        AuditLog.objects.create(
            user=request.user,
            action="master_product_deactivated",
            entity_type="master_product",
            entity_id=str(m.id),
            details={"master_code": m.master_code, "reason": "has linked items"},
        )
        return Response({"status": "deactivated", "id": m.id, "master_code": m.master_code})

    code = m.master_code
    m.delete()
    AuditLog.objects.create(
        user=request.user,
        action="master_product_deleted",
        entity_type="master_product",
        entity_id=str(pk),
        details={"master_code": code},
    )
    return Response({"status": "deleted", "master_code": code})


@api_view(["GET"])
@permission_classes([IsManager])
def master_product_options(request):
    """Light dropdown source — active masters only, no pagination."""
    rows = MasterProduct.objects.filter(is_active=True).order_by("master_code").values(
        "id", "master_code", "name"
    )
    return Response({"master_products": list(rows)})
