"""
Supplier master CRUD + Supplier Scorecard.

CRUD is admin-accessible (master data, same scope as Outlets/Users). The
scorecard is super-admin-only initially — move `nav.supplier_scorecard`
into admin defaults later if you want to open it up.
"""

from datetime import date, timedelta

from django.db import transaction
from django.db.models import Sum, Count, Max, Min, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin, IsSuperAdmin

from .models import Supplier, GrnLine, RtsLine, AuditLog


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #
def _supplier_dict(s: Supplier) -> dict:
    return {
        "id": s.id,
        "code": s.code,
        "name": s.name,
        "contact_phone": s.contact_phone,
        "contact_email": s.contact_email,
        "address": s.address,
        "tax_reg_no": s.tax_reg_no,
        "payment_terms": s.payment_terms,
        "notes": s.notes,
        "is_active": s.is_active,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
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


# --------------------------------------------------------------------------- #
# CRUD                                                                        #
# --------------------------------------------------------------------------- #
@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def supplier_list_create(request):
    """
    GET  /api/uploads/suppliers/?q=&active=&page=&page_size=
    POST /api/uploads/suppliers/    body: code, name, phone, email, ...
    """
    if request.method == "GET":
        page, page_size = _paginate(request)
        qs = Supplier.objects.all()
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q))
        active = request.query_params.get("active")
        if active in ("1", "true", "yes"):
            qs = qs.filter(is_active=True)
        elif active in ("0", "false", "no"):
            qs = qs.filter(is_active=False)

        total = qs.count()
        offset = (page - 1) * page_size
        rows = qs.order_by("code")[offset: offset + page_size]
        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "suppliers": [_supplier_dict(s) for s in rows],
        })

    # POST
    data = request.data or {}
    code = (data.get("code") or "").strip().upper()
    if not code:
        return Response({"detail": "code is required."}, status=status.HTTP_400_BAD_REQUEST)
    if Supplier.objects.filter(code=code).exists():
        return Response({"detail": f"Supplier '{code}' already exists."}, status=status.HTTP_409_CONFLICT)

    s = Supplier.objects.create(
        code=code,
        name=(data.get("name") or "").strip()[:200],
        contact_phone=(data.get("contact_phone") or "").strip()[:40],
        contact_email=(data.get("contact_email") or "").strip()[:255],
        address=(data.get("address") or "").strip()[:500],
        tax_reg_no=(data.get("tax_reg_no") or "").strip()[:60],
        payment_terms=(data.get("payment_terms") or "").strip()[:100],
        notes=data.get("notes") or "",
        is_active=bool(data.get("is_active", True)),
    )
    AuditLog.objects.create(
        user=request.user,
        action="supplier_created",
        entity_type="supplier",
        entity_id=str(s.id),
        details={"code": s.code, "name": s.name},
    )
    return Response(_supplier_dict(s), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdmin])
def supplier_detail(request, pk: int):
    s = get_object_or_404(Supplier, pk=pk)

    if request.method == "GET":
        return Response(_supplier_dict(s))

    if request.method == "PATCH":
        data = request.data or {}
        changes = {}
        for field in [
            "name", "contact_phone", "contact_email", "address",
            "tax_reg_no", "payment_terms", "notes",
        ]:
            if field in data:
                new_val = (data.get(field) or "")
                if field in {"name", "contact_phone", "contact_email", "address", "tax_reg_no", "payment_terms"}:
                    new_val = new_val.strip()
                current = getattr(s, field)
                if new_val != current:
                    changes[field] = {"old": current, "new": new_val}
                    setattr(s, field, new_val)
        if "is_active" in data:
            new_val = bool(data["is_active"])
            if new_val != s.is_active:
                changes["is_active"] = {"old": s.is_active, "new": new_val}
                s.is_active = new_val
        # `code` is intentionally not editable — it's the natural key that
        # links this supplier to historic GRN/RTS rows.
        if changes:
            s.save()
            AuditLog.objects.create(
                user=request.user,
                action="supplier_updated",
                entity_type="supplier",
                entity_id=str(s.id),
                details={"code": s.code, "changes": changes},
            )
        return Response(_supplier_dict(s))

    # DELETE
    # Guard: don't hard-delete a supplier that already has GRN/RTS activity —
    # soft-deactivate instead so historical rows still resolve to a name.
    has_activity = (
        GrnLine.objects.filter(supplier_code=s.code).exists()
        or RtsLine.objects.filter(supplier_code=s.code).exists()
    )
    if has_activity:
        s.is_active = False
        s.save(update_fields=["is_active"])
        AuditLog.objects.create(
            user=request.user,
            action="supplier_deactivated",
            entity_type="supplier",
            entity_id=str(s.id),
            details={"code": s.code, "reason": "has historical activity"},
        )
        return Response({"status": "deactivated", "id": s.id, "code": s.code})

    code = s.code
    s.delete()
    AuditLog.objects.create(
        user=request.user,
        action="supplier_deleted",
        entity_type="supplier",
        entity_id=str(pk),
        details={"code": code},
    )
    return Response({"status": "deleted", "code": code})


# --------------------------------------------------------------------------- #
# Scorecard                                                                   #
# --------------------------------------------------------------------------- #
@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def supplier_scorecard(request):
    """
    Per-supplier KPIs over a date window:
      grn_value, rts_value, rts_rate_pct, distinct_items, deliveries,
      avg_delivery_value, last_delivery_date.

    Query params: from_date, to_date (default last 90 days), outlet_id?.
    """
    today = date.today()
    try:
        to_date = date.fromisoformat(request.query_params.get("to_date") or str(today))
        from_date = date.fromisoformat(
            request.query_params.get("from_date") or str(today - timedelta(days=89))
        )
    except ValueError:
        return Response({"detail": "Invalid date."}, status=status.HTTP_400_BAD_REQUEST)

    outlet_id = request.query_params.get("outlet_id")

    grn_qs = GrnLine.objects.filter(txn_date__range=(from_date, to_date)).exclude(supplier_code="")
    rts_qs = RtsLine.objects.filter(txn_date__range=(from_date, to_date)).exclude(supplier_code="")
    if outlet_id:
        grn_qs = grn_qs.filter(outlet_id=outlet_id)
        rts_qs = rts_qs.filter(outlet_id=outlet_id)

    # GRN aggregates per supplier
    grn_rows = (
        grn_qs.values("supplier_code")
        .annotate(
            grn_value=Sum("amount"),
            distinct_items=Count("item_code", distinct=True),
            deliveries=Count("do_no", distinct=True),
            last_delivery=Max("txn_date"),
            first_delivery=Min("txn_date"),
        )
    )
    rts_rows = (
        rts_qs.values("supplier_code")
        .annotate(
            rts_value=Sum("amount"),
            rts_deliveries=Count("do_no", distinct=True),
        )
    )
    rts_map = {r["supplier_code"].strip().upper(): r for r in rts_rows}

    # Supplier master lookup (avoids an N+1 fetch per row)
    master = {s.code: s for s in Supplier.objects.all()}

    out = []
    for g in grn_rows:
        code = g["supplier_code"].strip().upper()
        r = rts_map.get(code, {})
        grn_v = float(g["grn_value"] or 0)
        rts_v = float(r.get("rts_value") or 0)
        deliveries = g["deliveries"] or 0
        m = master.get(code)
        out.append({
            "code": code,
            "name": m.name if m else "",
            "is_active": m.is_active if m else None,
            "supplier_id": m.id if m else None,
            "grn_value": round(grn_v, 2),
            "rts_value": round(rts_v, 2),
            "net_purchases": round(grn_v - rts_v, 2),
            "rts_rate_pct": round(rts_v / grn_v * 100, 2) if grn_v else 0,
            "distinct_items": g["distinct_items"] or 0,
            "deliveries": deliveries,
            "avg_delivery_value": round(grn_v / deliveries, 2) if deliveries else 0,
            "last_delivery": str(g["last_delivery"]) if g["last_delivery"] else None,
            "first_delivery": str(g["first_delivery"]) if g["first_delivery"] else None,
        })

    # Also surface suppliers who only had RTS activity (returns with no GRN in window).
    seen_codes = {r["code"] for r in out}
    for code, r in rts_map.items():
        if code in seen_codes:
            continue
        m = master.get(code)
        rts_v = float(r.get("rts_value") or 0)
        out.append({
            "code": code,
            "name": m.name if m else "",
            "is_active": m.is_active if m else None,
            "supplier_id": m.id if m else None,
            "grn_value": 0,
            "rts_value": round(rts_v, 2),
            "net_purchases": round(-rts_v, 2),
            "rts_rate_pct": None,
            "distinct_items": 0,
            "deliveries": 0,
            "avg_delivery_value": 0,
            "last_delivery": None,
            "first_delivery": None,
        })

    # Sort by net purchases descending — biggest partners first.
    out.sort(key=lambda r: r["net_purchases"], reverse=True)

    totals = {
        "suppliers": len(out),
        "grn_value": round(sum(r["grn_value"] for r in out), 2),
        "rts_value": round(sum(r["rts_value"] for r in out), 2),
        "net_purchases": round(sum(r["net_purchases"] for r in out), 2),
    }

    return Response({
        "from_date": str(from_date),
        "to_date": str(to_date),
        "suppliers": out,
        "totals": totals,
    })


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def supplier_detail_scorecard(request, code: str):
    """
    Drill-down scorecard for a single supplier: recent deliveries, top items
    supplied, cost trend per item (first vs last cost_price).
    """
    today = date.today()
    try:
        to_date = date.fromisoformat(request.query_params.get("to_date") or str(today))
        from_date = date.fromisoformat(
            request.query_params.get("from_date") or str(today - timedelta(days=89))
        )
    except ValueError:
        return Response({"detail": "Invalid date."}, status=status.HTTP_400_BAD_REQUEST)

    code_u = code.strip().upper()
    supplier = Supplier.objects.filter(code=code_u).first()

    grn_qs = GrnLine.objects.filter(
        supplier_code=code_u, txn_date__range=(from_date, to_date),
    )

    # Recent deliveries (one row per do_no)
    deliveries = (
        grn_qs.values("do_no", "txn_date", "invoice_no", "outlet_id", "outlet__outlet_name")
        .annotate(value=Sum("amount"), lines=Count("id"))
        .order_by("-txn_date")[:50]
    )

    # Top items supplied
    top_items = (
        grn_qs.values("item_code", "description")
        .annotate(qty=Sum("qty"), value=Sum("amount"), deliveries=Count("do_no", distinct=True))
        .order_by("-value")[:25]
    )

    # Cost drift — per item, first vs most recent cost_price
    cost_drift = []
    items_seen = set()
    for row in (
        grn_qs.exclude(cost_price__isnull=True)
        .order_by("item_code", "-txn_date")
        .values("item_code", "description", "cost_price", "txn_date")
    ):
        key = row["item_code"]
        if key in items_seen:
            continue
        items_seen.add(key)
        latest = {"cost": float(row["cost_price"]), "date": str(row["txn_date"])}
        # Fetch earliest
        first = (
            grn_qs.filter(item_code=key).exclude(cost_price__isnull=True)
            .order_by("txn_date").values("cost_price", "txn_date").first()
        )
        if not first:
            continue
        first_cost = float(first["cost_price"])
        if first_cost <= 0:
            continue
        pct = (latest["cost"] - first_cost) / first_cost * 100
        cost_drift.append({
            "item_code": key,
            "description": row["description"],
            "first_cost": first_cost,
            "first_date": str(first["txn_date"]),
            "latest_cost": latest["cost"],
            "latest_date": latest["date"],
            "drift_pct": round(pct, 2),
        })
    # Biggest price hikes first
    cost_drift.sort(key=lambda r: r["drift_pct"], reverse=True)
    cost_drift = cost_drift[:25]

    return Response({
        "from_date": str(from_date),
        "to_date": str(to_date),
        "supplier": _supplier_dict(supplier) if supplier else {"code": code_u, "name": "", "id": None},
        "deliveries": [
            {
                "do_no": d["do_no"],
                "txn_date": str(d["txn_date"]),
                "invoice_no": d["invoice_no"],
                "outlet_id": d["outlet_id"],
                "outlet_name": d["outlet__outlet_name"],
                "value": float(d["value"] or 0),
                "lines": d["lines"],
            }
            for d in deliveries
        ],
        "top_items": [
            {
                "item_code": r["item_code"],
                "description": r["description"],
                "qty": float(r["qty"] or 0),
                "value": float(r["value"] or 0),
                "deliveries": r["deliveries"],
            }
            for r in top_items
        ],
        "cost_drift": cost_drift,
    })
