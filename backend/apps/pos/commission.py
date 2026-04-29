"""Phase 3 Agent 10 — commission rule lookup + computation.

Rules are applied at report time, not at sale time, so editing rules later
re-prices commission on past bills (caller chooses by passing the active rule
set).
"""

from decimal import Decimal


def _specificity(rule, *, rep_id, category):
    """Higher score = more specific.

    Tier:
      4 — rep match + category match (exact)
      3 — rep match + blank category
      2 — null rep + category match
      1 — null rep + blank category
      0 — does not match
    """
    rep_ok = (rule.rep_id is None) or (rep_id is not None and rule.rep_id == rep_id)
    if not rep_ok:
        return 0
    cat = (rule.item_category or "").strip().lower()
    target_cat = (category or "").strip().lower()
    if cat:
        if cat != target_cat:
            return 0
        return 4 if rule.rep_id is not None else 2
    # blank category in rule = applies to all
    return 3 if rule.rep_id is not None else 1


def find_rule_for(*, rules, rep, category):
    """Pick the most specific active rule for the given rep/category.

    Among matches, lowest ``priority`` wins; ties broken by highest id.
    Returns the rule or None.
    """
    rep_id = getattr(rep, "id", None) if rep is not None else None
    best = None
    best_key = None
    for r in rules:
        if not r.is_active:
            continue
        score = _specificity(r, rep_id=rep_id, category=category)
        if score == 0:
            continue
        # Sort key: higher score first, then lower priority, then higher id.
        key = (score, -int(r.priority or 0), int(r.id or 0))
        if best_key is None or key > best_key:
            best, best_key = r, key
    return best


def compute_line_commission(*, line, rule):
    """Return Decimal commission amount for one BillLine under ``rule``."""
    if rule is None:
        return Decimal("0")
    rate = Decimal(rule.rate_pct or 0)
    qty = Decimal(line.qty or 0)
    if rule.basis == "line_qty":
        return (qty * rate).quantize(Decimal("0.01"))
    if rule.basis == "line_profit":
        unit_price = Decimal(line.unit_price or 0)
        unit_cost = Decimal(line.unit_cost or 0)
        profit = (unit_price - unit_cost) * qty
        return (profit * rate / Decimal("100")).quantize(Decimal("0.01"))
    # default → line_total
    line_total = Decimal(line.line_total or 0)
    return (line_total * rate / Decimal("100")).quantize(Decimal("0.01"))


def compute_bill_commissions(*, bill, rules):
    """Aggregate commission per rep across the bill's lines.

    Returns ``{rep_id: {"amount": Decimal, "breakdown": [...]}}``.
    Lines without an effective rep (no per-line rep AND no Bill.sales_rep)
    are skipped.
    """
    out = {}
    bill_rep_id = bill.sales_rep_id
    for ln in bill.lines.all().select_related("item"):
        rep_id = ln.sales_rep_id or bill_rep_id
        if not rep_id:
            continue
        # Build a stub rep object that find_rule_for can read .id from.
        class _Stub:
            pass
        stub = _Stub()
        stub.id = rep_id
        category = getattr(ln.item, "category", "") or ""
        rule = find_rule_for(rules=rules, rep=stub, category=category)
        if rule is None:
            continue
        amount = compute_line_commission(line=ln, rule=rule)
        if amount == 0:
            continue
        slot = out.setdefault(rep_id, {"amount": Decimal("0"), "breakdown": []})
        slot["amount"] += amount
        slot["breakdown"].append({
            "line_id": ln.id,
            "bill_id": bill.id,
            "bill_no": bill.bill_no,
            "category": category,
            "line_total": str(Decimal(ln.line_total or 0)),
            "rate_pct": str(Decimal(rule.rate_pct or 0)),
            "basis": rule.basis,
            "amount": str(amount),
        })
    return out
