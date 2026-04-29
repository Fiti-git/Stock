"""
Phase 4 Agent 12 — Purchase Order endpoints.

A PO captures intent ("we will receive these goods from this supplier"). The
existing GRN endpoint (`pos.views.grn_entry`) is what records actual receipt;
when a GRN payload carries `purchase_order_id` + per-line `po_line_id`, the
GRN extends `qty_received` on the matching PO lines and may flip the PO from
OPEN → PARTIAL → CLOSED automatically.
"""
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.items.models import Item
from apps.uploads.models import AuditLog, Supplier

from .models import PurchaseOrder, PurchaseOrderLine
from .permissions import CanViewPosReports


def _user_outlet(request):
    return request.user.outlet if getattr(request.user, "outlet", None) else None


def _audit(user, action, entity, details=None):
    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        entity_type=entity.__class__.__name__ if entity else "",
        entity_id=str(getattr(entity, "pk", "") or ""),
        details=details or {},
    )


def _is_manager_plus(user):
    role = getattr(user, "role", "")
    return role in ("manager", "admin", "super_admin")


def _D(v, default="0"):
    try:
        return Decimal(str(v if v not in (None, "") else default))
    except Exception:
        return Decimal(default)


def _serialize_line(l):
    return {
        "id": l.id,
        "item_id": l.item_id,
        "item_code": l.item_code,
        "item_name": l.item_name,
        "qty_ordered": str(l.qty_ordered),
        "qty_received": str(l.qty_received),
        "qty_remaining": str((l.qty_ordered or Decimal("0")) - (l.qty_received or Decimal("0"))),
        "unit_cost": str(l.unit_cost),
        "tax_rate_pct": str(l.tax_rate_pct),
        "line_total": str(l.line_total),
        "note": l.note,
    }


def _serialize_po(po, with_lines=False):
    data = {
        "id": po.id,
        "po_no": po.po_no,
        "status": po.status,
        "outlet_id": po.outlet_id,
        "supplier_id": po.supplier_id,
        "supplier_name": po.supplier_name or (po.supplier.name if po.supplier_id else ""),
        "expected_on": po.expected_on.isoformat() if po.expected_on else None,
        "sub_total": str(po.sub_total),
        "tax_total": str(po.tax_total),
        "grand_total": str(po.grand_total),
        "note": po.note,
        "created_by_id": po.created_by_id,
        "created_at": po.created_at.isoformat() if po.created_at else None,
        "updated_at": po.updated_at.isoformat() if po.updated_at else None,
        "cancelled_at": po.cancelled_at.isoformat() if po.cancelled_at else None,
        "cancelled_reason": po.cancelled_reason,
    }
    if with_lines:
        data["lines"] = [_serialize_line(l) for l in po.lines.all().order_by("id")]
    return data


def _next_po_no():
    """Format: PO-YYYYMMDD-NNNN. Sequence is per-day across all outlets."""
    today = timezone.now().date()
    prefix = f"PO-{today.strftime('%Y%m%d')}-"
    with transaction.atomic():
        last = (
            PurchaseOrder.objects
            .select_for_update()
            .filter(po_no__startswith=prefix)
            .order_by("-po_no")
            .first()
        )
        if last:
            try:
                seq = int(last.po_no.rsplit("-", 1)[-1]) + 1
            except Exception:
                seq = 1
        else:
            seq = 1
        return f"{prefix}{seq:04d}"


def _compute_totals(lines):
    sub = Decimal("0")
    tax = Decimal("0")
    for l in lines:
        qty = _D(l.get("qty_ordered"))
        cost = _D(l.get("unit_cost"))
        rate = _D(l.get("tax_rate_pct"))
        line_sub = qty * cost
        sub += line_sub
        tax += line_sub * rate / Decimal("100")
    return sub, tax, sub + tax


def _save_lines(po, lines, items_by_id):
    """Replace all lines on a draft PO."""
    po.lines.all().delete()
    for l in lines:
        item = items_by_id[int(l["item_id"])]
        qty = _D(l.get("qty_ordered"))
        cost = _D(l.get("unit_cost"))
        rate = _D(l.get("tax_rate_pct"))
        PurchaseOrderLine.objects.create(
            po=po, item=item,
            item_code=item.item_code, item_name=item.item_name,
            qty_ordered=qty, unit_cost=cost,
            tax_rate_pct=rate,
            line_total=qty * cost,
            note=(l.get("note") or "")[:200],
        )


# -------------------------------------------------------------------
# List + create
# -------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([CanViewPosReports])
def purchase_orders(request):
    outlet = _user_outlet(request)
    if request.method == "GET":
        qs = PurchaseOrder.objects.select_related("supplier", "outlet").prefetch_related("lines")
        # Restrict to user's outlet unless admin/super_admin.
        if outlet and getattr(request.user, "role", "") not in ("admin", "super_admin"):
            qs = qs.filter(outlet=outlet)
        supplier_id = request.query_params.get("supplier")
        status_ = request.query_params.get("status")
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        if status_:
            statuses = [s.strip() for s in str(status_).split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        try:
            limit = min(int(request.query_params.get("limit", 100) or 100), 500)
        except Exception:
            limit = 100
        rows = [_serialize_po(po) for po in qs[:limit]]
        return Response({"count": len(rows), "results": rows})

    # POST -- create draft
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ required."}, status=403)
    if not outlet:
        return Response({"detail": "No outlet assigned."}, status=400)
    data = request.data or {}
    supplier_id = data.get("supplier_id")
    if not supplier_id:
        return Response({"detail": "supplier_id required."}, status=400)
    supplier = Supplier.objects.filter(pk=supplier_id).first()
    if not supplier:
        return Response({"detail": "Supplier not found."}, status=400)
    lines = data.get("lines") or []
    if not lines:
        return Response({"detail": "At least one line required."}, status=400)
    item_ids = [int(l["item_id"]) for l in lines if l.get("item_id")]
    items = {i.id: i for i in Item.objects.filter(pk__in=item_ids, outlet=outlet)}
    missing = [i for i in item_ids if i not in items]
    if missing:
        return Response({"detail": f"Items not found in outlet: {missing}"}, status=400)

    expected_on_raw = data.get("expected_on") or None
    expected_on = parse_date(expected_on_raw) if isinstance(expected_on_raw, str) and expected_on_raw.strip() else expected_on_raw
    note = (data.get("note") or "")[:500]
    sub, tax, grand = _compute_totals(lines)

    with transaction.atomic():
        po = PurchaseOrder.objects.create(
            outlet=outlet, supplier=supplier,
            supplier_name=supplier.name or "",
            po_no=f"DRAFT-{timezone.now().strftime('%Y%m%d%H%M%S%f')}",
            expected_on=expected_on,
            status=PurchaseOrder.Status.DRAFT,
            sub_total=sub, tax_total=tax, grand_total=grand,
            note=note,
            created_by=request.user if request.user.is_authenticated else None,
        )
        _save_lines(po, lines, items)
        _audit(request.user, "pos.po_create", po, {
            "supplier_id": supplier.id, "lines": len(lines),
            "grand_total": str(grand),
        })
    return Response(_serialize_po(po, with_lines=True), status=201)


# -------------------------------------------------------------------
# Detail / patch
# -------------------------------------------------------------------

@api_view(["GET", "PATCH"])
@permission_classes([CanViewPosReports])
def purchase_order_detail(request, po_id):
    po = get_object_or_404(PurchaseOrder.objects.select_related("supplier", "outlet"), pk=po_id)
    outlet = _user_outlet(request)
    if outlet and request.user.role not in ("admin", "super_admin") and po.outlet_id != outlet.id:
        return Response({"detail": "Outlet mismatch."}, status=403)

    if request.method == "GET":
        return Response(_serialize_po(po, with_lines=True))

    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ required."}, status=403)
    if po.status != PurchaseOrder.Status.DRAFT:
        return Response({"detail": "Only DRAFT POs can be edited."}, status=400)

    data = request.data or {}
    changes = {}
    if "expected_on" in data:
        raw = data["expected_on"] or None
        po.expected_on = parse_date(raw) if isinstance(raw, str) and raw.strip() else raw
        changes["expected_on"] = data["expected_on"]
    if "note" in data:
        po.note = (data.get("note") or "")[:500]
        changes["note"] = po.note
    if "supplier_id" in data and data["supplier_id"]:
        sup = Supplier.objects.filter(pk=data["supplier_id"]).first()
        if not sup:
            return Response({"detail": "Supplier not found."}, status=400)
        po.supplier = sup
        po.supplier_name = sup.name or ""
        changes["supplier_id"] = sup.id

    new_lines = data.get("lines")
    with transaction.atomic():
        if new_lines is not None:
            if not new_lines:
                return Response({"detail": "At least one line required."}, status=400)
            item_ids = [int(l["item_id"]) for l in new_lines if l.get("item_id")]
            items = {i.id: i for i in Item.objects.filter(pk__in=item_ids, outlet=po.outlet)}
            missing = [i for i in item_ids if i not in items]
            if missing:
                return Response({"detail": f"Items not found: {missing}"}, status=400)
            sub, tax, grand = _compute_totals(new_lines)
            po.sub_total = sub
            po.tax_total = tax
            po.grand_total = grand
            _save_lines(po, new_lines, items)
            changes["lines"] = len(new_lines)
        po.save()
        _audit(request.user, "pos.po_update", po, changes)
    return Response(_serialize_po(po, with_lines=True))


# -------------------------------------------------------------------
# State transitions
# -------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([CanViewPosReports])
def purchase_order_submit(request, po_id):
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ required."}, status=403)
    po = get_object_or_404(PurchaseOrder, pk=po_id)
    outlet = _user_outlet(request)
    if outlet and request.user.role not in ("admin", "super_admin") and po.outlet_id != outlet.id:
        return Response({"detail": "Outlet mismatch."}, status=403)
    if po.status != PurchaseOrder.Status.DRAFT:
        return Response({"detail": f"Cannot submit from status {po.status}."}, status=400)
    if not po.lines.exists():
        return Response({"detail": "PO has no lines."}, status=400)
    with transaction.atomic():
        po.po_no = _next_po_no()
        po.status = PurchaseOrder.Status.OPEN
        po.save(update_fields=["po_no", "status", "updated_at"])
        _audit(request.user, "pos.po_submit", po, {"po_no": po.po_no})
    return Response(_serialize_po(po, with_lines=True))


@api_view(["POST"])
@permission_classes([CanViewPosReports])
def purchase_order_cancel(request, po_id):
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ required."}, status=403)
    po = get_object_or_404(PurchaseOrder, pk=po_id)
    outlet = _user_outlet(request)
    if outlet and request.user.role not in ("admin", "super_admin") and po.outlet_id != outlet.id:
        return Response({"detail": "Outlet mismatch."}, status=403)
    if po.status not in (PurchaseOrder.Status.OPEN, PurchaseOrder.Status.PARTIAL,
                         PurchaseOrder.Status.DRAFT):
        return Response({"detail": f"Cannot cancel from status {po.status}."}, status=400)
    reason = (request.data.get("reason") or "")[:500]
    with transaction.atomic():
        po.status = PurchaseOrder.Status.CANCELLED
        po.cancelled_at = timezone.now()
        po.cancelled_reason = reason
        po.save(update_fields=["status", "cancelled_at", "cancelled_reason", "updated_at"])
        _audit(request.user, "pos.po_cancel", po, {"reason": reason})
    return Response(_serialize_po(po, with_lines=True))


@api_view(["POST"])
@permission_classes([CanViewPosReports])
def purchase_order_close(request, po_id):
    """Manual close — even if some lines have qty_received < qty_ordered."""
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ required."}, status=403)
    po = get_object_or_404(PurchaseOrder, pk=po_id)
    outlet = _user_outlet(request)
    if outlet and request.user.role not in ("admin", "super_admin") and po.outlet_id != outlet.id:
        return Response({"detail": "Outlet mismatch."}, status=403)
    if po.status not in (PurchaseOrder.Status.OPEN, PurchaseOrder.Status.PARTIAL):
        return Response({"detail": f"Cannot close from status {po.status}."}, status=400)
    with transaction.atomic():
        po.status = PurchaseOrder.Status.CLOSED
        po.save(update_fields=["status", "updated_at"])
        _audit(request.user, "pos.po_close", po, {
            "manual": True,
            "lines_received": [
                {"line_id": l.id, "qty_ordered": str(l.qty_ordered), "qty_received": str(l.qty_received)}
                for l in po.lines.all()
            ],
        })
    return Response(_serialize_po(po, with_lines=True))


# -------------------------------------------------------------------
# Outstanding lines lookup (used by GRN screen)
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanViewPosReports])
def purchase_order_lines(request, po_id):
    po = get_object_or_404(PurchaseOrder.objects.prefetch_related("lines"), pk=po_id)
    outlet = _user_outlet(request)
    if outlet and request.user.role not in ("admin", "super_admin") and po.outlet_id != outlet.id:
        return Response({"detail": "Outlet mismatch."}, status=403)
    status_filter = (request.query_params.get("status") or "").strip().lower()
    rows = []
    for l in po.lines.all().order_by("id"):
        remaining = (l.qty_ordered or Decimal("0")) - (l.qty_received or Decimal("0"))
        if status_filter == "outstanding" and remaining <= 0:
            continue
        d = _serialize_line(l)
        rows.append(d)
    return Response({
        "po_id": po.id, "po_no": po.po_no, "status": po.status,
        "supplier_id": po.supplier_id, "supplier_name": po.supplier_name,
        "lines": rows,
    })
