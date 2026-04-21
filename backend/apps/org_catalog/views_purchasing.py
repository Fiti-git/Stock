"""
Purchasing Plan endpoints.

Draft generation reads DemandSnapshot (built nightly) and applies:
    need = target_days_of_cover * avg_daily_qty_30d - on_hand
    suggested = ceil(max(need, 0) / pack_multiple) * pack_multiple
    if 0 < suggested < min_order_qty: suggested = min_order_qty

Two modes:
  * PER_OUTLET — one line per (master, outlet) with outlet-specific qty.
  * CONSOLIDATED — one line per master summing across outlets, with the
    per-outlet split preserved in `allocation` so receipts can split back.
"""
import csv
import math
from io import StringIO

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin, IsManager
from apps.uploads.models import AuditLog, Supplier

from .models import DemandSnapshot, MasterProduct, PurchasePlan, PurchasePlanLine


def _plan_dict(plan: PurchasePlan, with_lines: bool = False) -> dict:
    out = {
        "id": plan.id,
        "name": plan.name,
        "mode": plan.mode,
        "status": plan.status,
        "supplier_id": plan.supplier_id,
        "supplier_code": plan.supplier.code if plan.supplier_id else None,
        "supplier_name": plan.supplier.name if plan.supplier_id else None,
        "created_by_id": plan.created_by_id,
        "created_by_name": plan.created_by.username if plan.created_by_id else None,
        "approved_by_id": plan.approved_by_id,
        "approved_at": plan.approved_at.isoformat() if plan.approved_at else None,
        "notes": plan.notes,
        "created_at": plan.created_at.isoformat(),
        "updated_at": plan.updated_at.isoformat(),
        "line_count": getattr(plan, "line_count", None),
        "total_qty": getattr(plan, "total_qty", None),
    }
    if with_lines:
        out["lines"] = [_line_dict(l) for l in plan.lines.select_related("master_product", "outlet").all()]
    return out


def _line_dict(line: PurchasePlanLine) -> dict:
    return {
        "id": line.id,
        "master_product_id": line.master_product_id,
        "master_code": line.master_product.master_code,
        "master_name": line.master_product.name,
        "outlet_id": line.outlet_id,
        "outlet_name": line.outlet.outlet_name if line.outlet_id else None,
        "suggested_qty": line.suggested_qty,
        "final_qty": line.final_qty,
        "unit_cost": float(line.unit_cost) if line.unit_cost is not None else None,
        "allocation": line.allocation or {},
        "notes": line.notes,
    }


def _suggested(demand_row, master: MasterProduct) -> float:
    on_hand = demand_row.on_hand_qty or 0
    need = master.target_days_of_cover * demand_row.avg_daily_qty_30d - on_hand
    if need <= 0:
        return 0
    pm = max(1, master.pack_multiple or 1)
    moq = max(1, master.min_order_qty or 1)
    qty = math.ceil(need / pm) * pm
    if 0 < qty < moq:
        qty = moq
    return float(qty)


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def plan_list_create(request):
    """
    GET  /api/org/purchase-plans/
    POST /api/org/purchase-plans/
      Body: {
        name, mode: "consolidated"|"per_outlet",
        supplier_id?, outlet_ids?: [int], category_id?, notes?
      }
    POST auto-generates draft lines from DemandSnapshot.
    """
    if request.method == "GET":
        qs = PurchasePlan.objects.select_related("supplier", "created_by").order_by("-created_at")
        return Response({
            "plans": [
                {
                    **_plan_dict(p),
                    "line_count": p.lines.count(),
                }
                for p in qs[:200]
            ],
        })

    data = request.data or {}
    name = (data.get("name") or "").strip()
    mode = data.get("mode") or PurchasePlan.Mode.CONSOLIDATED
    if not name:
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
    if mode not in PurchasePlan.Mode.values:
        return Response({"detail": f"mode must be one of {PurchasePlan.Mode.values}."}, status=status.HTTP_400_BAD_REQUEST)

    supplier = None
    if data.get("supplier_id"):
        try:
            supplier = Supplier.objects.get(pk=int(data["supplier_id"]))
        except (Supplier.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Supplier not found."}, status=status.HTTP_400_BAD_REQUEST)

    demand = DemandSnapshot.objects.select_related("master_product").all()
    if supplier:
        demand = demand.filter(master_product__default_supplier_id=supplier.id)
    if data.get("category_id"):
        demand = demand.filter(master_product__category_id=data["category_id"])
    outlet_ids = data.get("outlet_ids") or []
    if outlet_ids:
        demand = demand.filter(outlet_id__in=outlet_ids)

    with transaction.atomic():
        plan = PurchasePlan.objects.create(
            name=name[:200],
            mode=mode,
            supplier=supplier,
            status=PurchasePlan.Status.DRAFT,
            created_by=request.user,
            notes=(data.get("notes") or "")[:5000],
        )

        if mode == PurchasePlan.Mode.PER_OUTLET:
            lines = []
            for d in demand:
                qty = _suggested(d, d.master_product)
                if qty <= 0:
                    continue
                lines.append(PurchasePlanLine(
                    plan=plan,
                    master_product=d.master_product,
                    outlet_id=d.outlet_id,
                    suggested_qty=qty,
                    final_qty=qty,
                ))
            PurchasePlanLine.objects.bulk_create(lines, batch_size=500)
        else:
            # Consolidated: sum qty per master, keep per-outlet allocation.
            agg = {}
            for d in demand:
                qty = _suggested(d, d.master_product)
                if qty <= 0:
                    continue
                bucket = agg.setdefault(d.master_product_id, {
                    "master": d.master_product, "total": 0.0, "alloc": {}
                })
                bucket["total"] += qty
                bucket["alloc"][str(d.outlet_id)] = bucket["alloc"].get(str(d.outlet_id), 0.0) + qty
            lines = [
                PurchasePlanLine(
                    plan=plan,
                    master_product=v["master"],
                    outlet=None,
                    suggested_qty=v["total"],
                    final_qty=v["total"],
                    allocation=v["alloc"],
                )
                for v in agg.values()
            ]
            PurchasePlanLine.objects.bulk_create(lines, batch_size=500)

    AuditLog.objects.create(
        user=request.user,
        action="purchase_plan_created",
        entity_type="purchase_plan",
        entity_id=str(plan.id),
        details={"name": plan.name, "mode": plan.mode, "lines": plan.lines.count()},
    )
    plan.line_count = plan.lines.count()
    return Response(_plan_dict(plan), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdmin])
def plan_detail(request, pk: int):
    plan = get_object_or_404(
        PurchasePlan.objects.select_related("supplier", "created_by", "approved_by"),
        pk=pk,
    )

    if request.method == "GET":
        return Response(_plan_dict(plan, with_lines=True))

    if request.method == "PATCH":
        data = request.data or {}
        if "name" in data:
            plan.name = (data["name"] or "").strip()[:200] or plan.name
        if "notes" in data:
            plan.notes = (data["notes"] or "")[:5000]
        if "status" in data and data["status"] in PurchasePlan.Status.values:
            plan.status = data["status"]
        plan.save()
        AuditLog.objects.create(
            user=request.user,
            action="purchase_plan_updated",
            entity_type="purchase_plan",
            entity_id=str(plan.id),
            details={"changes": list(data.keys())},
        )
        return Response(_plan_dict(plan, with_lines=True))

    # DELETE — cascade removes lines
    name = plan.name
    plan.delete()
    AuditLog.objects.create(
        user=request.user,
        action="purchase_plan_deleted",
        entity_type="purchase_plan",
        entity_id=str(pk),
        details={"name": name},
    )
    return Response({"status": "deleted"})


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAdmin])
def line_detail(request, pk: int, line_id: int):
    plan = get_object_or_404(PurchasePlan, pk=pk)
    line = get_object_or_404(PurchasePlanLine, pk=line_id, plan=plan)

    if request.method == "PATCH":
        data = request.data or {}
        if "final_qty" in data:
            try:
                line.final_qty = max(0.0, float(data["final_qty"]))
            except (ValueError, TypeError):
                return Response({"detail": "final_qty must be numeric."}, status=status.HTTP_400_BAD_REQUEST)
        if "unit_cost" in data:
            raw = data["unit_cost"]
            if raw in (None, ""):
                line.unit_cost = None
            else:
                try:
                    line.unit_cost = float(raw)
                except (ValueError, TypeError):
                    return Response({"detail": "unit_cost must be numeric."}, status=status.HTTP_400_BAD_REQUEST)
        if "notes" in data:
            line.notes = (data["notes"] or "")[:300]
        line.save()
        return Response(_line_dict(line))

    # DELETE
    line.delete()
    return Response({"status": "deleted"})


@api_view(["POST"])
@permission_classes([IsAdmin])
def plan_approve(request, pk: int):
    plan = get_object_or_404(PurchasePlan, pk=pk)
    if plan.status == PurchasePlan.Status.APPROVED:
        return Response({"detail": "Already approved."}, status=status.HTTP_400_BAD_REQUEST)
    plan.status = PurchasePlan.Status.APPROVED
    plan.approved_by = request.user
    plan.approved_at = timezone.now()
    plan.save()
    AuditLog.objects.create(
        user=request.user,
        action="purchase_plan_approved",
        entity_type="purchase_plan",
        entity_id=str(plan.id),
        details={"name": plan.name},
    )
    return Response(_plan_dict(plan, with_lines=True))


@api_view(["GET"])
@permission_classes([IsManager])
def plan_export_csv(request, pk: int):
    plan = get_object_or_404(PurchasePlan, pk=pk)
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "master_code", "master_name", "outlet", "suggested_qty", "final_qty",
        "unit_cost", "allocation", "notes",
    ])
    for l in plan.lines.select_related("master_product", "outlet").all():
        writer.writerow([
            l.master_product.master_code,
            l.master_product.name,
            l.outlet.outlet_name if l.outlet_id else "(consolidated)",
            l.suggested_qty,
            l.final_qty,
            l.unit_cost if l.unit_cost is not None else "",
            ";".join(f"{k}:{v}" for k, v in (l.allocation or {}).items()),
            l.notes,
        ])
    response = HttpResponse(buf.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="plan-{plan.id}-{plan.name}.csv"'
    return response
