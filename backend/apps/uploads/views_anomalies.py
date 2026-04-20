"""
Anomaly detection dashboard — super-admin only. Surfaces actionable signals
derived solely from the 7 transaction tables (no POS snapshot needed):

    1. Sales Drop        — last 7 days down >= 20% vs the prior 7 days
    2. Damage Spike      — last 7 days >= 2x the prior-3-weeks weekly average
    3. Return Spike      — last 7 days of sales returns >= 2x rolling weekly avg
    4. High-Discount Cashiers — discount % > 5% of own gross, last 7 days
    5. Wastage % Red     — wastage / GRN > 3% over last 30 days per outlet

Everything is computed with aggregate-only queries. Each anomaly card ships
with its own row list for a click-to-drill-down UI.
"""

from datetime import date, timedelta

from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin

from .models import (
    SalesLine, SalesReturnLine,
    DamageLine, OfficeLine, VerificationLine,
    GrnLine,
)


# Tunable thresholds. Kept as module-level constants so the dashboard
# explains itself ("... dropped >= 20%"); tweak in one place.
SALES_DROP_PCT = 20           # recent vs prior week drop
DAMAGE_SPIKE_MULTIPLIER = 2.0  # recent / baseline
RETURN_SPIKE_MULTIPLIER = 2.0
DISCOUNT_PCT_WARN = 5.0
WASTAGE_PCT_WARN = 3.0
WASTAGE_PCT_ERROR = 5.0


def _outlet_sum(Model, start, end, field="amount"):
    return {
        r["outlet_id"]: {
            "name": r["outlet__outlet_name"],
            "value": float(r["s"] or 0),
        }
        for r in Model.objects
        .filter(txn_date__range=(start, end))
        .values("outlet_id", "outlet__outlet_name")
        .annotate(s=Sum(field))
    }


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def anomalies(request):
    today = date.today()
    # Recent = last 7 days inclusive of today
    recent_end = today
    recent_start = today - timedelta(days=6)
    # Prior = the 7 days before that
    prior_end = recent_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=6)
    # Baseline for spikes = 21 days prior to the recent window
    baseline_end = recent_start - timedelta(days=1)
    baseline_start = baseline_end - timedelta(days=20)
    # Wastage window = last 30 days
    wastage_start = today - timedelta(days=29)
    wastage_end = today

    cards = []

    # ---------------------------------------------------------------- #
    # 1. Sales Drop                                                    #
    # ---------------------------------------------------------------- #
    recent_sales = _outlet_sum(SalesLine, recent_start, recent_end)
    prior_sales = _outlet_sum(SalesLine, prior_start, prior_end)
    sales_drops = []
    for outlet_id, recent in recent_sales.items():
        prior = prior_sales.get(outlet_id, {"value": 0}).get("value", 0)
        if prior <= 0:
            continue
        delta_pct = (recent["value"] - prior) / prior * 100
        if delta_pct <= -SALES_DROP_PCT:
            sales_drops.append({
                "outlet_id": outlet_id,
                "outlet_name": recent["name"],
                "recent_lkr": round(recent["value"], 2),
                "prior_lkr": round(prior, 2),
                "delta_pct": round(delta_pct, 1),
            })
    sales_drops.sort(key=lambda r: r["delta_pct"])
    cards.append({
        "key": "sales_drop",
        "label": "Sales Drops",
        "description": f"Outlets where last-7-day sales fell \u2265 {SALES_DROP_PCT}% vs the prior 7 days.",
        "severity": "error" if sales_drops else "success",
        "count": len(sales_drops),
        "columns": [
            {"field": "outlet_name", "header": "Outlet"},
            {"field": "recent_lkr",  "header": "Last 7d", "numeric": True, "format": "lkr"},
            {"field": "prior_lkr",   "header": "Prior 7d", "numeric": True, "format": "lkr"},
            {"field": "delta_pct",   "header": "\u0394 %",  "numeric": True, "format": "pct"},
        ],
        "items": sales_drops,
    })

    # ---------------------------------------------------------------- #
    # 2. Damage Spike                                                  #
    # ---------------------------------------------------------------- #
    def _spike(Model, multiplier):
        recent = _outlet_sum(Model, recent_start, recent_end)
        baseline = _outlet_sum(Model, baseline_start, baseline_end)
        # baseline = 21 days → equivalent 7-day average
        spikes = []
        for outlet_id, r in recent.items():
            b_total = baseline.get(outlet_id, {"value": 0}).get("value", 0)
            b_week = b_total / 3.0  # 21 days → per-7-day
            if r["value"] <= 0 or b_week <= 0:
                continue
            if r["value"] >= b_week * multiplier:
                spikes.append({
                    "outlet_id": outlet_id,
                    "outlet_name": r["name"],
                    "recent_lkr": round(r["value"], 2),
                    "baseline_lkr": round(b_week, 2),
                    "delta_pct": round((r["value"] - b_week) / b_week * 100, 1),
                })
        spikes.sort(key=lambda x: x["delta_pct"], reverse=True)
        return spikes

    damage_spikes = _spike(DamageLine, DAMAGE_SPIKE_MULTIPLIER)
    cards.append({
        "key": "damage_spike",
        "label": "Damage Spikes",
        "description": f"Outlets where last-7-day damage is \u2265 {DAMAGE_SPIKE_MULTIPLIER:g}\u00d7 the prior-3-weeks average.",
        "severity": "error" if damage_spikes else "success",
        "count": len(damage_spikes),
        "columns": [
            {"field": "outlet_name",  "header": "Outlet"},
            {"field": "recent_lkr",   "header": "Last 7d",      "numeric": True, "format": "lkr"},
            {"field": "baseline_lkr", "header": "Baseline / wk", "numeric": True, "format": "lkr"},
            {"field": "delta_pct",    "header": "Spike %",      "numeric": True, "format": "pct"},
        ],
        "items": damage_spikes,
    })

    # ---------------------------------------------------------------- #
    # 3. Return Spike                                                  #
    # ---------------------------------------------------------------- #
    # Returns are stored as negative gross_value — use absolute magnitude.
    def _returns_outlet_sum(start, end):
        return {
            r["outlet_id"]: {
                "name": r["outlet__outlet_name"],
                "value": abs(float(r["s"] or 0)),
            }
            for r in SalesReturnLine.objects
            .filter(txn_date__range=(start, end))
            .values("outlet_id", "outlet__outlet_name")
            .annotate(s=Sum("gross_value"))
        }

    r_recent = _returns_outlet_sum(recent_start, recent_end)
    r_baseline = _returns_outlet_sum(baseline_start, baseline_end)
    return_spikes = []
    for outlet_id, r in r_recent.items():
        b_total = r_baseline.get(outlet_id, {"value": 0}).get("value", 0)
        b_week = b_total / 3.0
        if r["value"] <= 0 or b_week <= 0:
            continue
        if r["value"] >= b_week * RETURN_SPIKE_MULTIPLIER:
            return_spikes.append({
                "outlet_id": outlet_id,
                "outlet_name": r["name"],
                "recent_lkr": round(r["value"], 2),
                "baseline_lkr": round(b_week, 2),
                "delta_pct": round((r["value"] - b_week) / b_week * 100, 1),
            })
    return_spikes.sort(key=lambda x: x["delta_pct"], reverse=True)
    cards.append({
        "key": "return_spike",
        "label": "Return Spikes",
        "description": f"Outlets where last-7-day customer returns are \u2265 {RETURN_SPIKE_MULTIPLIER:g}\u00d7 the prior-3-weeks average.",
        "severity": "warning" if return_spikes else "success",
        "count": len(return_spikes),
        "columns": [
            {"field": "outlet_name",  "header": "Outlet"},
            {"field": "recent_lkr",   "header": "Last 7d",      "numeric": True, "format": "lkr"},
            {"field": "baseline_lkr", "header": "Baseline / wk", "numeric": True, "format": "lkr"},
            {"field": "delta_pct",    "header": "Spike %",      "numeric": True, "format": "pct"},
        ],
        "items": return_spikes,
    })

    # ---------------------------------------------------------------- #
    # 4. High-Discount Cashiers                                        #
    # ---------------------------------------------------------------- #
    cashier_rows = (
        SalesLine.objects
        .filter(txn_date__range=(recent_start, recent_end))
        .exclude(cashier="")
        .values("cashier", "outlet_id", "outlet__outlet_name")
        .annotate(gross=Sum("amount"), discount=Sum("discount"), lines=Count("id"))
    )
    discount_outliers = []
    for r in cashier_rows:
        gross = float(r["gross"] or 0)
        disc = float(r["discount"] or 0)
        if gross < 1000:   # not enough signal
            continue
        pct = (disc / gross * 100) if gross else 0
        if pct >= DISCOUNT_PCT_WARN:
            discount_outliers.append({
                "cashier": r["cashier"],
                "outlet_name": r["outlet__outlet_name"],
                "gross_lkr": round(gross, 2),
                "discount_lkr": round(disc, 2),
                "discount_pct": round(pct, 2),
                "lines": r["lines"],
            })
    discount_outliers.sort(key=lambda x: x["discount_pct"], reverse=True)
    cards.append({
        "key": "high_discount",
        "label": "High-Discount Cashiers",
        "description": f"Cashiers whose discount exceeded {DISCOUNT_PCT_WARN:g}% of their own gross sales in the last 7 days.",
        "severity": "warning" if discount_outliers else "success",
        "count": len(discount_outliers),
        "columns": [
            {"field": "cashier",       "header": "Cashier"},
            {"field": "outlet_name",   "header": "Outlet"},
            {"field": "gross_lkr",     "header": "Gross",      "numeric": True, "format": "lkr"},
            {"field": "discount_lkr",  "header": "Discount",   "numeric": True, "format": "lkr"},
            {"field": "discount_pct",  "header": "Discount %", "numeric": True, "format": "pct"},
            {"field": "lines",         "header": "Lines",      "numeric": True},
        ],
        "items": discount_outliers,
    })

    # ---------------------------------------------------------------- #
    # 5. Wastage % Red (last 30 days)                                  #
    # ---------------------------------------------------------------- #
    dmg_map  = _outlet_sum(DamageLine,       wastage_start, wastage_end)
    off_map  = _outlet_sum(OfficeLine,       wastage_start, wastage_end)
    ver_map  = _outlet_sum(VerificationLine, wastage_start, wastage_end)
    grn_map  = _outlet_sum(GrnLine,          wastage_start, wastage_end)

    wastage_flags = []
    all_ids = set(dmg_map) | set(off_map) | set(ver_map)
    for outlet_id in all_ids:
        name = (dmg_map.get(outlet_id) or off_map.get(outlet_id) or ver_map.get(outlet_id))["name"]
        dmg = dmg_map.get(outlet_id, {"value": 0})["value"]
        off = off_map.get(outlet_id, {"value": 0})["value"]
        ver = ver_map.get(outlet_id, {"value": 0})["value"]
        grn = grn_map.get(outlet_id, {"value": 0})["value"]
        total = dmg + off + ver
        if grn <= 0 or total <= 0:
            continue
        pct = total / grn * 100
        if pct < WASTAGE_PCT_WARN:
            continue
        wastage_flags.append({
            "outlet_id": outlet_id,
            "outlet_name": name,
            "damage_lkr": round(dmg, 2),
            "office_lkr": round(off, 2),
            "verification_lkr": round(ver, 2),
            "total_wastage_lkr": round(total, 2),
            "grn_lkr": round(grn, 2),
            "wastage_pct": round(pct, 2),
        })
    wastage_flags.sort(key=lambda x: x["wastage_pct"], reverse=True)
    severe = any(x["wastage_pct"] >= WASTAGE_PCT_ERROR for x in wastage_flags)
    cards.append({
        "key": "wastage_red",
        "label": "Wastage % High",
        "description": f"Outlets where damage + office + verification exceed {WASTAGE_PCT_WARN:g}% of purchases (last 30 days).",
        "severity": "error" if severe else ("warning" if wastage_flags else "success"),
        "count": len(wastage_flags),
        "columns": [
            {"field": "outlet_name",        "header": "Outlet"},
            {"field": "total_wastage_lkr",  "header": "Total Wastage", "numeric": True, "format": "lkr"},
            {"field": "grn_lkr",            "header": "Purchases",     "numeric": True, "format": "lkr"},
            {"field": "wastage_pct",        "header": "Wastage %",     "numeric": True, "format": "pct"},
        ],
        "items": wastage_flags,
    })

    return Response({
        "generated_at": timezone.now().isoformat(),
        "windows": {
            "recent": [str(recent_start), str(recent_end)],
            "prior":  [str(prior_start),  str(prior_end)],
            "baseline": [str(baseline_start), str(baseline_end)],
            "wastage": [str(wastage_start), str(wastage_end)],
        },
        "thresholds": {
            "sales_drop_pct": SALES_DROP_PCT,
            "damage_spike_multiplier": DAMAGE_SPIKE_MULTIPLIER,
            "return_spike_multiplier": RETURN_SPIKE_MULTIPLIER,
            "discount_pct_warn": DISCOUNT_PCT_WARN,
            "wastage_pct_warn": WASTAGE_PCT_WARN,
            "wastage_pct_error": WASTAGE_PCT_ERROR,
        },
        "cards": cards,
    })
