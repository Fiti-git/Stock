"""
Phase 2 Agent 7 — Promotion + Coupon evaluation.

Pure(ish): only DB read is the Promotion.objects.filter() lookup. Returns a
plan describing what discounts / free lines the caller should apply.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from django.utils import timezone

from .models import Coupon, CouponRedemption, Promotion


TWO = Decimal("0.01")


def _money(v) -> Decimal:
    return Decimal(v).quantize(TWO)


def _parse_weekdays(csv: str) -> set[int]:
    out = set()
    for tok in (csv or "").split(","):
        tok = tok.strip()
        if not tok:
            continue
        try:
            n = int(tok)
            if 0 <= n <= 6:
                out.add(n)
        except ValueError:
            pass
    return out


def _within_happy_hour(promo: Promotion, now) -> bool:
    """now: aware datetime."""
    wds = _parse_weekdays(promo.weekdays)
    if wds and now.weekday() not in wds:
        return False
    if promo.time_from and promo.time_to:
        t = now.time()
        # Handle wraparound (e.g. 22:00 -> 02:00)
        if promo.time_from <= promo.time_to:
            return promo.time_from <= t <= promo.time_to
        return t >= promo.time_from or t <= promo.time_to
    return True


def evaluate_promotions(
    *,
    outlet,
    lines: list[dict],
    bill_subtotal: Decimal,
    customer=None,
    promotion_ids: list[int] | None = None,
    now=None,
) -> dict:
    """
    Evaluate selected promotions against the cart.

    `lines`: [{item_id, qty, unit_price, line_total, category?}, ...] —
    line_total is post line-discount, pre-tax.

    Returns:
      {
        "bill_discount_added": Decimal,
        "line_discounts": {idx: Decimal},
        "free_lines": [{item_id, qty, reason, source_promotion_id}],
        "applied_promotions": [id, ...],
        "messages": [str, ...]
      }
    """
    now = now or timezone.now()
    bill_subtotal = Decimal(bill_subtotal or 0)
    promotion_ids = promotion_ids or []

    out = {
        "bill_discount_added": Decimal("0.00"),
        "line_discounts": {},
        "free_lines": [],
        "applied_promotions": [],
        "messages": [],
    }
    if not promotion_ids:
        return out

    promos = list(
        Promotion.objects.filter(
            id__in=promotion_ids,
            outlet=outlet,
            is_active=True,
            starts_at__lte=now,
            ends_at__gte=now,
        ).prefetch_related("combo_items")
    )

    # Build cart helpers
    qty_by_item: dict[int, Decimal] = {}
    line_total_by_item: dict[int, Decimal] = {}
    line_idx_by_item: dict[int, list[int]] = {}
    for idx, ln in enumerate(lines):
        iid = int(ln["item_id"])
        qty = Decimal(str(ln.get("qty") or 0))
        lt = Decimal(str(ln.get("line_total") or 0))
        qty_by_item[iid] = qty_by_item.get(iid, Decimal("0")) + qty
        line_total_by_item[iid] = line_total_by_item.get(iid, Decimal("0")) + lt
        line_idx_by_item.setdefault(iid, []).append(idx)

    for p in promos:
        # min bill amount
        if p.min_bill_amount and bill_subtotal < p.min_bill_amount:
            out["messages"].append(f"{p.name}: min bill not met")
            continue
        # max usage
        if p.max_usage and p.usage_count >= p.max_usage:
            out["messages"].append(f"{p.name}: usage cap reached")
            continue
        if p.kind == Promotion.Kind.HAPPY_HOUR:
            if not _within_happy_hour(p, now):
                out["messages"].append(f"{p.name}: outside happy hour window")
                continue
            # Apply value as bill-level percent or amount
            if p.value:
                # treat value <=100 as percent, else amount? Use scope hint:
                # default to percent here (typical happy hour). Use bill-level.
                disc = bill_subtotal * (p.value / Decimal("100"))
                out["bill_discount_added"] += _money(disc)
            out["applied_promotions"].append(p.id)
            continue

        if p.kind == Promotion.Kind.PERCENT or p.kind == Promotion.Kind.AMOUNT:
            disc = Decimal("0")
            if p.scope == Promotion.Scope.BILL:
                base = bill_subtotal
                disc = (base * p.value / Decimal("100")) if p.kind == Promotion.Kind.PERCENT else p.value
                out["bill_discount_added"] += _money(min(disc, base))
            elif p.scope == Promotion.Scope.ITEM and p.item_id:
                base = line_total_by_item.get(p.item_id, Decimal("0"))
                if base <= 0:
                    continue
                line_disc = (base * p.value / Decimal("100")) if p.kind == Promotion.Kind.PERCENT else p.value
                line_disc = min(line_disc, base)
                # spread across lines for that item proportionally
                _spread_line_discount(out["line_discounts"], lines, p.item_id, line_disc)
            elif p.scope == Promotion.Scope.CATEGORY and p.category:
                cat_lines = [(i, ln) for i, ln in enumerate(lines)
                             if str(ln.get("category") or "") == p.category]
                base = sum((Decimal(str(ln.get("line_total") or 0)) for _, ln in cat_lines), Decimal("0"))
                if base <= 0:
                    continue
                line_disc_total = (base * p.value / Decimal("100")) if p.kind == Promotion.Kind.PERCENT else p.value
                line_disc_total = min(line_disc_total, base)
                if base > 0:
                    for i, ln in cat_lines:
                        share = (Decimal(str(ln.get("line_total") or 0)) / base) * line_disc_total
                        out["line_discounts"][i] = out["line_discounts"].get(i, Decimal("0")) + _money(share)
            out["applied_promotions"].append(p.id)
            continue

        if p.kind == Promotion.Kind.BOGO:
            if not p.item_id or p.buy_qty <= 0 or p.get_qty <= 0:
                continue
            have = qty_by_item.get(p.item_id, Decimal("0"))
            if have < p.buy_qty:
                continue
            bundles = int(have // p.buy_qty)
            free_item_id = p.get_item_id or p.item_id
            free_qty = Decimal(p.get_qty) * bundles
            if free_qty > 0:
                out["free_lines"].append({
                    "item_id": free_item_id,
                    "qty": free_qty,
                    "reason": "bogo",
                    "source_promotion_id": p.id,
                })
                out["applied_promotions"].append(p.id)
            continue

        if p.kind == Promotion.Kind.COMBO:
            combo_ids = [it.id for it in p.combo_items.all()]
            if not combo_ids:
                continue
            # bundle count = min qty across all combo items (integer)
            try:
                min_qty = min(int(qty_by_item.get(cid, Decimal("0"))) for cid in combo_ids)
            except ValueError:
                min_qty = 0
            if min_qty <= 0:
                continue
            # total of one bundle = sum line_total proportionally for one unit each
            bundle_value = Decimal("0")
            for cid in combo_ids:
                # avg unit_price for this item from cart
                tot = line_total_by_item.get(cid, Decimal("0"))
                qty = qty_by_item.get(cid, Decimal("0"))
                if qty > 0:
                    bundle_value += tot / qty
            total_value = bundle_value * Decimal(min_qty)
            combo_total_price = Decimal(p.combo_price) * Decimal(min_qty)
            if total_value > combo_total_price:
                out["bill_discount_added"] += _money(total_value - combo_total_price)
                out["applied_promotions"].append(p.id)
            continue

        if p.kind == Promotion.Kind.TIERED:
            if not p.item_id or not p.tiers:
                continue
            qty = qty_by_item.get(p.item_id, Decimal("0"))
            if qty <= 0:
                continue
            # sort tiers desc by min_qty
            try:
                sorted_tiers = sorted(
                    p.tiers, key=lambda t: Decimal(str(t.get("min_qty") or 0)), reverse=True,
                )
            except Exception:
                continue
            chosen = None
            for t in sorted_tiers:
                if qty >= Decimal(str(t.get("min_qty") or 0)):
                    chosen = t
                    break
            if not chosen:
                continue
            pct = Decimal(str(chosen.get("discount_pct") or 0))
            base = line_total_by_item.get(p.item_id, Decimal("0"))
            if base <= 0:
                continue
            disc = base * pct / Decimal("100")
            _spread_line_discount(out["line_discounts"], lines, p.item_id, _money(disc))
            out["applied_promotions"].append(p.id)
            continue

    out["bill_discount_added"] = _money(out["bill_discount_added"])
    return out


def _spread_line_discount(target: dict, lines: list[dict], item_id: int, total_disc: Decimal):
    """Spread `total_disc` proportionally across all lines of `item_id`."""
    base = Decimal("0")
    idxs = []
    for i, ln in enumerate(lines):
        if int(ln["item_id"]) == int(item_id):
            base += Decimal(str(ln.get("line_total") or 0))
            idxs.append(i)
    if base <= 0 or not idxs:
        return
    remaining = total_disc
    for i in idxs[:-1]:
        share = (Decimal(str(lines[i].get("line_total") or 0)) / base) * total_disc
        share = _money(share)
        target[i] = target.get(i, Decimal("0")) + share
        remaining -= share
    # last line absorbs remainder
    last = idxs[-1]
    target[last] = target.get(last, Decimal("0")) + _money(remaining)


def apply_coupon(*, code: str, customer=None, bill_subtotal: Decimal, now=None) -> dict:
    """
    Validate and compute discount for a coupon code.
    Returns {"coupon": Coupon, "discount": Decimal} or raises ValueError.

    Caller is responsible for writing the CouponRedemption row inside the
    bill's transaction and for incrementing Coupon.usage_count.
    """
    now = now or timezone.now()
    code = (code or "").strip()
    if not code:
        raise ValueError("Coupon code required")
    try:
        coupon = Coupon.objects.get(code=code)
    except Coupon.DoesNotExist:
        raise ValueError("Coupon not found")
    if not coupon.is_active:
        raise ValueError("Coupon inactive")
    if coupon.starts_at and coupon.starts_at > now:
        raise ValueError("Coupon not yet active")
    if coupon.ends_at and coupon.ends_at < now:
        raise ValueError("Coupon expired")
    bill_subtotal = Decimal(bill_subtotal or 0)
    if coupon.min_bill_amount and bill_subtotal < coupon.min_bill_amount:
        raise ValueError(f"Bill must be >= {coupon.min_bill_amount}")
    if coupon.max_usage and coupon.usage_count >= coupon.max_usage:
        raise ValueError("Coupon usage cap reached")
    if coupon.one_time and coupon.usage_count >= 1:
        raise ValueError("Coupon already used")
    if coupon.per_customer_limit and customer is not None:
        used = CouponRedemption.objects.filter(coupon=coupon, customer=customer).count()
        if used >= coupon.per_customer_limit:
            raise ValueError("Per-customer limit reached")
    # compute discount
    if coupon.discount_kind == Coupon.DiscountKind.PERCENT:
        disc = bill_subtotal * coupon.value / Decimal("100")
    else:
        disc = coupon.value
    disc = min(_money(disc), _money(bill_subtotal))
    return {"coupon": coupon, "discount": disc}
