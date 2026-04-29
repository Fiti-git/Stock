"""
Phase 3 Agent 8 — Multi-component Tax Engine.

Each TaxComponent represents one tax (VAT, SVAT, SSCL, NBT, ...). Components
can be inclusive (price already includes the tax — extracted) or exclusive
(added on top of gross). Per-line application is filtered by item category
via TaxComponent.applies_to_categories / excluded_categories.

Opt-in: a caller checks get_active_components() — if empty, the legacy
single-rate fallback (Item.tax_rate_pct on each line) is used unchanged.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date as _date

from django.db.models import Q

TWO = Decimal("0.01")


def _money(v):
    return Decimal(v or 0).quantize(TWO, rounding=ROUND_HALF_UP)


def get_active_components(outlet, when=None):
    """
    Return TaxComponent rows applicable to `outlet` at date `when`
    (default: today), ordered by priority asc.

    Includes outlet-specific rows + chain-wide rows (outlet=None).
    """
    from .models import TaxComponent
    when = when or _date.today()
    qs = TaxComponent.objects.filter(is_active=True).filter(
        Q(outlet=outlet) | Q(outlet__isnull=True)
    ).filter(
        Q(starts_at__isnull=True) | Q(starts_at__lte=when)
    ).filter(
        Q(ends_at__isnull=True) | Q(ends_at__gte=when)
    ).order_by("priority", "code")
    return list(qs)


def line_taxable_components(line_item_category, components):
    """Filter components based on applies_to_categories / excluded_categories."""
    cat = (line_item_category or "").strip()
    out = []
    for c in components:
        applies = list(c.applies_to_categories or [])
        excluded = list(c.excluded_categories or [])
        if applies and cat not in applies:
            continue
        if excluded and cat in excluded:
            continue
        out.append(c)
    return out


def compute_line_taxes(*, gross, item_category, components, customer_tax_exempt=False):
    """
    Compute taxes for one bill line.

    gross = qty * unit_price - line_discount (Decimal)

    Returns dict:
      {
        "components": [{code, name, rate_pct, amount, inclusive}, ...],
        "tax_amount": Decimal,        # total tax for this line
        "net_amount": Decimal,        # gross with inclusive tax stripped if any
      }
    """
    gross = Decimal(gross or 0)
    if customer_tax_exempt:
        return {
            "components": [],
            "tax_amount": _money(0),
            "net_amount": _money(gross),
        }

    applicable = line_taxable_components(item_category, components)
    breakdown = []
    tax_amount = Decimal("0")
    inclusive_total = Decimal("0")

    for c in applicable:
        rate = Decimal(c.rate_pct or 0)
        if c.inclusive:
            # tax = gross - gross / (1 + rate/100)
            denom = (Decimal("1") + rate / Decimal("100"))
            base = gross / denom if denom else gross
            tax = _money(gross - base)
            inclusive_total += tax
        else:
            tax = _money(gross * rate / Decimal("100"))
        tax_amount += tax
        breakdown.append({
            "code": c.code,
            "name": c.name,
            "rate_pct": str(rate),
            "amount": str(tax),
            "inclusive": bool(c.inclusive),
        })

    net_amount = _money(gross - inclusive_total)
    return {
        "components": breakdown,
        "tax_amount": _money(tax_amount),
        "net_amount": net_amount,
    }


def aggregate_bill_breakdown(line_results):
    """
    Aggregate per-line component lists into a bill-level breakdown.

    Returns: list of {"code","name","rate_pct","amount","inclusive"} where
    `amount` is the summed tax for that code across all lines.
    """
    agg = {}   # code -> dict
    order = []
    for lr in line_results:
        for comp in (lr.get("components") or []):
            code = comp["code"]
            if code not in agg:
                agg[code] = {
                    "code": code,
                    "name": comp["name"],
                    "rate_pct": comp["rate_pct"],
                    "inclusive": comp["inclusive"],
                    "amount": Decimal("0"),
                }
                order.append(code)
            agg[code]["amount"] += Decimal(comp["amount"])
    out = []
    for code in order:
        row = agg[code]
        out.append({
            "code": row["code"],
            "name": row["name"],
            "rate_pct": row["rate_pct"],
            "amount": str(_money(row["amount"])),
            "inclusive": row["inclusive"],
        })
    return out
