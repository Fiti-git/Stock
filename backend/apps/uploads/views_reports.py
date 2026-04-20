"""
Super-admin operational reports derived purely from the transaction tables:

  1. daily_sales     — per-outlet × per-day sales summary (bills, gross, net after returns)
  2. item_rankings   — top / bottom N items by qty or revenue in a date window
  3. wastage_summary — damage + office + verification LKR per outlet in a window

All endpoints accept `from_date`, `to_date`, and optional `outlet_id`. They
use aggregate queries (one per table) with the existing `(outlet, txn_date)`
indexes, so response time is bounded by the number of (outlet × day) groups
in the window, not the raw row count of the detail tables.
"""

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Sum, Count, F, DecimalField, Q, ExpressionWrapper
from django.db.models.functions import Coalesce
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.outlets.models import Outlet

from .models import (
    SalesLine, SalesReturnLine,
    DamageLine, OfficeLine, VerificationLine,
    GrnLine,
)


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #
def _parse_range(request, default_days: int = 30):
    """Return (from_date, to_date, error_response | None)."""
    today = date.today()
    try:
        to_date = date.fromisoformat(
            request.query_params.get("to_date") or str(today)
        )
        from_date = date.fromisoformat(
            request.query_params.get("from_date") or str(today - timedelta(days=default_days - 1))
        )
    except ValueError:
        return None, None, Response(
            {"detail": "Invalid date. Use YYYY-MM-DD."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if to_date < from_date:
        return None, None, Response(
            {"detail": "to_date must be >= from_date."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    return from_date, to_date, None


def _outlet_filter(request, qs):
    outlet_id = request.query_params.get("outlet_id")
    if outlet_id:
        qs = qs.filter(outlet_id=outlet_id)
    return qs


# --------------------------------------------------------------------------- #
# 1. Daily Sales Summary                                                      #
# --------------------------------------------------------------------------- #
@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def daily_sales(request):
    """
    One row per (outlet, day). Columns:
      bills, items, lines, gross_sales, discount, returns_value, net_sales,
      avg_bill_value.

    'bills' is distinct invoice count within the day-outlet slice.
    'net_sales' = gross_sales + returns_value (returns are stored negative).
    """
    from_date, to_date, err = _parse_range(request, default_days=30)
    if err:
        return err

    sales_qs = _outlet_filter(
        request,
        SalesLine.objects.filter(txn_date__range=(from_date, to_date)),
    )
    sales_rows = (
        sales_qs
        .values("outlet_id", "outlet__outlet_name", "txn_date")
        .annotate(
            bills=Count("invoice_no", distinct=True),
            items=Sum("qty"),
            lines=Count("id"),
            gross_sales=Sum("amount"),
            discount=Sum("discount"),
        )
    )

    returns_qs = _outlet_filter(
        request,
        SalesReturnLine.objects.filter(txn_date__range=(from_date, to_date)),
    )
    returns_map = {
        (r["outlet_id"], r["txn_date"]): {
            "returns_value": float(r["returns_value"] or 0),
            "returns_lines": r["returns_lines"] or 0,
        }
        for r in returns_qs.values("outlet_id", "txn_date").annotate(
            returns_value=Sum("gross_value"),
            returns_lines=Count("id"),
        )
    }

    out = []
    for r in sales_rows:
        key = (r["outlet_id"], r["txn_date"])
        ret = returns_map.get(key, {"returns_value": 0.0, "returns_lines": 0})
        gross = float(r["gross_sales"] or 0)
        net = gross + ret["returns_value"]
        bills = r["bills"] or 0
        out.append({
            "outlet_id": r["outlet_id"],
            "outlet_name": r["outlet__outlet_name"],
            "date": str(r["txn_date"]),
            "bills": bills,
            "items": float(r["items"] or 0),
            "lines": r["lines"],
            "gross_sales": gross,
            "discount": float(r["discount"] or 0),
            "returns_value": ret["returns_value"],
            "returns_lines": ret["returns_lines"],
            "net_sales": round(net, 2),
            "avg_bill_value": round(gross / bills, 2) if bills else 0,
        })

    # Surface return-only rows (days where there were only refunds and no sales)
    seen = {(r["outlet_id"], r["date"]) for r in out}
    for (outlet_id, dt), ret in returns_map.items():
        if (outlet_id, str(dt)) in seen:
            continue
        outlet_name = Outlet.objects.filter(pk=outlet_id).values_list("outlet_name", flat=True).first()
        out.append({
            "outlet_id": outlet_id,
            "outlet_name": outlet_name,
            "date": str(dt),
            "bills": 0, "items": 0, "lines": 0,
            "gross_sales": 0, "discount": 0,
            "returns_value": ret["returns_value"],
            "returns_lines": ret["returns_lines"],
            "net_sales": ret["returns_value"],
            "avg_bill_value": 0,
        })

    out.sort(key=lambda r: (r["date"], r["outlet_name"] or ""), reverse=True)

    totals = {
        "bills": sum(r["bills"] for r in out),
        "gross_sales": round(sum(r["gross_sales"] for r in out), 2),
        "discount": round(sum(r["discount"] for r in out), 2),
        "returns_value": round(sum(r["returns_value"] for r in out), 2),
        "net_sales": round(sum(r["net_sales"] for r in out), 2),
    }

    return Response({
        "from_date": str(from_date),
        "to_date": str(to_date),
        "rows": out,
        "totals": totals,
    })


# --------------------------------------------------------------------------- #
# 2. Item Rankings (top sellers / dead stock)                                 #
# --------------------------------------------------------------------------- #
@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def item_rankings(request):
    """
    Rank items by sales performance in a date window.

      order   = top | bottom        (default: top)
      metric  = revenue | qty | margin   (default: revenue)
      limit   = 1..200              (default: 50)
      mode    = sold | dead         (default: sold)

        mode=sold  — items that appear in SalesLine; ranked by metric.
        mode=dead  — items present in GrnLine (bought this window) but
                     NOT in SalesLine — i.e. stock sitting unsold.
    """
    from_date, to_date, err = _parse_range(request, default_days=30)
    if err:
        return err

    order = (request.query_params.get("order") or "top").lower()
    metric = (request.query_params.get("metric") or "revenue").lower()
    mode = (request.query_params.get("mode") or "sold").lower()
    try:
        limit = max(1, min(200, int(request.query_params.get("limit") or 50)))
    except (TypeError, ValueError):
        limit = 50

    if mode == "dead":
        # Items purchased but unsold. Two simple queries + set difference.
        bought_qs = _outlet_filter(
            request,
            GrnLine.objects.filter(txn_date__range=(from_date, to_date)),
        )
        bought_rows = (
            bought_qs
            .values("item_code")
            .annotate(
                last_description=Count("id"),  # placeholder — replaced below
                bought_qty=Sum("qty"),
                bought_value=Sum("amount"),
                last_cost=Sum(F("amount")) * 0,  # placeholder, overwritten
            )
        )
        # Collect descriptions separately (cheapest = one pass)
        desc_map = {}
        for row in bought_qs.values("item_code", "description"):
            desc_map.setdefault(row["item_code"], row["description"])

        sold_codes = set(
            _outlet_filter(
                request,
                SalesLine.objects.filter(txn_date__range=(from_date, to_date)),
            ).values_list("item_code", flat=True).distinct()
        )

        dead = []
        for r in bought_rows:
            if r["item_code"] in sold_codes:
                continue
            dead.append({
                "item_code": r["item_code"],
                "description": desc_map.get(r["item_code"], ""),
                "bought_qty": float(r["bought_qty"] or 0),
                "bought_value": float(r["bought_value"] or 0),
                "sold_qty": 0,
                "sold_revenue": 0,
                "gross_margin": 0,
                "invoices": 0,
            })
        # Highest purchase value first — that's the most expensive dead stock.
        dead.sort(key=lambda r: r["bought_value"], reverse=True)
        return Response({
            "from_date": str(from_date),
            "to_date": str(to_date),
            "mode": "dead",
            "count": len(dead),
            "rows": dead[:limit],
        })

    # mode == sold
    cost_expr = ExpressionWrapper(F("cost_price") * F("qty"), output_field=DecimalField(max_digits=18, decimal_places=2))
    sales_qs = _outlet_filter(
        request,
        SalesLine.objects.filter(txn_date__range=(from_date, to_date)),
    )
    rows_qs = (
        sales_qs
        .values("item_code")
        .annotate(
            sold_qty=Sum("qty"),
            sold_revenue=Sum("amount"),
            total_cost=Coalesce(Sum(cost_expr), 0, output_field=DecimalField(max_digits=18, decimal_places=2)),
            invoices=Count("invoice_no", distinct=True),
        )
        .annotate(
            gross_margin=ExpressionWrapper(
                F("sold_revenue") - F("total_cost"),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            )
        )
    )

    sort_field = {
        "revenue": "sold_revenue",
        "qty": "sold_qty",
        "margin": "gross_margin",
    }.get(metric, "sold_revenue")
    rows_qs = rows_qs.order_by(sort_field if order == "bottom" else f"-{sort_field}")
    rows = list(rows_qs[:limit])

    # Attach descriptions in one extra query so the ranking query stays cheap.
    codes = [r["item_code"] for r in rows]
    desc_map = {}
    for r in SalesLine.objects.filter(item_code__in=codes).values("item_code", "description")[:limit * 3]:
        desc_map.setdefault(r["item_code"], r["description"])

    out = [
        {
            "item_code": r["item_code"],
            "description": desc_map.get(r["item_code"], ""),
            "sold_qty": float(r["sold_qty"] or 0),
            "sold_revenue": float(r["sold_revenue"] or 0),
            "total_cost": float(r["total_cost"] or 0),
            "gross_margin": float(r["gross_margin"] or 0),
            "invoices": r["invoices"],
        }
        for r in rows
    ]

    return Response({
        "from_date": str(from_date),
        "to_date": str(to_date),
        "order": order,
        "metric": metric,
        "mode": "sold",
        "count": len(out),
        "rows": out,
    })


# --------------------------------------------------------------------------- #
# 3. Wastage Summary                                                          #
# --------------------------------------------------------------------------- #
@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def wastage_summary(request):
    """
    Per-outlet wastage totals in the window, broken into:
      damage_value, office_value, verification_value, total_wastage.
    Plus GRN total for context → wastage_pct_of_purchases.
    """
    from_date, to_date, err = _parse_range(request, default_days=30)
    if err:
        return err

    def per_outlet_sum(Model, date_field="txn_date"):
        qs = _outlet_filter(
            request,
            Model.objects.filter(**{f"{date_field}__range": (from_date, to_date)}),
        )
        return {
            r["outlet_id"]: {
                "value": float(r["total"] or 0),
                "lines": r["n"] or 0,
            }
            for r in qs.values("outlet_id").annotate(total=Sum("amount"), n=Count("id"))
        }

    damage_map = per_outlet_sum(DamageLine)
    office_map = per_outlet_sum(OfficeLine)
    verification_map = per_outlet_sum(VerificationLine)
    grn_map = per_outlet_sum(GrnLine)

    # Only include active outlets; if outlet_id filter used, scope further.
    # Outlet has no is_active column in this project — every seeded row is
    # considered live. If we add a soft-delete flag later, filter here.
    outlets_qs = Outlet.objects.all().order_by("outlet_name")
    requested_outlet = request.query_params.get("outlet_id")
    if requested_outlet:
        outlets_qs = outlets_qs.filter(pk=requested_outlet)

    rows = []
    tot = {"damage": 0, "office": 0, "verification": 0, "grn": 0, "total_wastage": 0}
    for o in outlets_qs:
        d = damage_map.get(o.id, {"value": 0, "lines": 0})
        of = office_map.get(o.id, {"value": 0, "lines": 0})
        ver = verification_map.get(o.id, {"value": 0, "lines": 0})
        gr = grn_map.get(o.id, {"value": 0, "lines": 0})
        total_wastage = d["value"] + of["value"] + ver["value"]
        rows.append({
            "outlet_id": o.id,
            "outlet_name": o.outlet_name,
            "short_code": o.short_code,
            "damage_value": d["value"],
            "damage_lines": d["lines"],
            "office_value": of["value"],
            "office_lines": of["lines"],
            "verification_value": ver["value"],
            "verification_lines": ver["lines"],
            "total_wastage": round(total_wastage, 2),
            "grn_value": gr["value"],
            "wastage_pct_of_purchases": round(total_wastage / gr["value"] * 100, 2) if gr["value"] else None,
        })
        tot["damage"] += d["value"]
        tot["office"] += of["value"]
        tot["verification"] += ver["value"]
        tot["grn"] += gr["value"]
        tot["total_wastage"] += total_wastage

    # Sort: highest wastage first — operations wants to see the worst offenders.
    rows.sort(key=lambda r: r["total_wastage"], reverse=True)

    totals = {
        "damage_value": round(tot["damage"], 2),
        "office_value": round(tot["office"], 2),
        "verification_value": round(tot["verification"], 2),
        "total_wastage": round(tot["total_wastage"], 2),
        "grn_value": round(tot["grn"], 2),
        "wastage_pct_of_purchases": round(tot["total_wastage"] / tot["grn"] * 100, 2) if tot["grn"] else None,
    }

    return Response({
        "from_date": str(from_date),
        "to_date": str(to_date),
        "rows": rows,
        "totals": totals,
    })
