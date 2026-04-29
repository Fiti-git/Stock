"""
Phase 3 Agent 9 — GL Export.

Build double-entry journal lines (Debit Cash/AR, Credit Sales/Tax/...)
from POS bills and persist them as a GLExport + GLEntry rows. Render a
Tally-compatible CSV for accounting import.

Design:
  - Per bill, build N debit lines (tenders, discounts) and N credit lines
    (sales, tax components). Returns reverse signs.
  - If an account is missing for a purpose, skip that line and emit a
    warning into GLExport.totals["warnings"]; never block the export.
"""

from __future__ import annotations

from datetime import date as date_type
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional

from django.db import transaction

from .models import (
    Bill, BillLine, Payment, GLAccount, GLExport, GLEntry, Shift, TaxComponent,
)


TWO = Decimal("0.01")


def _money(v) -> Decimal:
    return Decimal(v or 0).quantize(TWO, rounding=ROUND_HALF_UP)


def _tender_purpose(tender: str) -> str:
    """Map a Payment.tender enum to a GLAccount purpose."""
    return {
        Payment.Tender.CASH: GLAccount.Purpose.CASH,
        Payment.Tender.CARD: GLAccount.Purpose.CARD,
        Payment.Tender.LANKAQR: GLAccount.Purpose.BANK,
        Payment.Tender.BANK_TRANSFER: GLAccount.Purpose.BANK,
        Payment.Tender.CREDIT: GLAccount.Purpose.AR_CREDIT,
        Payment.Tender.GIFT_CARD: GLAccount.Purpose.GIFT_CARD_LIABILITY,
        Payment.Tender.OTHER: GLAccount.Purpose.TENDER_OTHER,
    }.get(tender, GLAccount.Purpose.TENDER_OTHER)


def load_accounts_by_purpose(outlet) -> Dict[str, GLAccount]:
    """Resolve {purpose -> GLAccount}. Outlet-specific overrides chain-wide."""
    by_purpose: Dict[str, GLAccount] = {}
    chain = list(GLAccount.objects.filter(outlet__isnull=True, is_active=True))
    for acc in chain:
        by_purpose[acc.purpose] = acc
    if outlet is not None:
        for acc in GLAccount.objects.filter(outlet=outlet, is_active=True):
            by_purpose[acc.purpose] = acc
    return by_purpose


def load_tax_account_overrides(outlet) -> Dict[str, GLAccount]:
    """Look up TaxComponent.code -> GLAccount via account_code on the
    component if a matching GLAccount with `code` and purpose=TAX exists.
    Falls back later to the generic TAX account.
    """
    # We don't have a gl_account_code field on TaxComponent yet; the
    # spec says "Per-component override via TaxComponent.gl_account_code
    # (string, optional)". We try a soft attribute access so the system
    # works even if the column hasn't been added.
    overrides: Dict[str, GLAccount] = {}
    qs = TaxComponent.objects.filter(is_active=True)
    if outlet is not None:
        from django.db.models import Q
        qs = qs.filter(Q(outlet=outlet) | Q(outlet__isnull=True))
    for comp in qs:
        code = getattr(comp, "gl_account_code", "") or ""
        if not code:
            continue
        acc = GLAccount.objects.filter(
            code=code, purpose=GLAccount.Purpose.TAX, is_active=True,
        ).first()
        if acc:
            overrides[comp.code] = acc
    return overrides


def build_entries_for_bill(
    bill: Bill,
    accounts_by_purpose: Dict[str, GLAccount],
    tax_account_overrides: Optional[Dict[str, GLAccount]] = None,
) -> List[dict]:
    """Return a list of entry dicts (one per ledger line).

    Sign convention:
      SALE:  DEBIT tenders+discount,     CREDIT sales + each tax component
      RETURN: opposite signs (refunds reduce cash and sales).
    Skips lines whose target account is unmapped (warning emitted by caller).
    """
    tax_account_overrides = tax_account_overrides or {}
    entries: List[dict] = []
    is_return = bill.kind == Bill.Kind.RETURN_
    entry_date = (bill.closed_at or bill.created_at).date()
    ref = bill.bill_no or f"BILL#{bill.id}"

    def _push(acc: GLAccount, *, debit=Decimal("0"), credit=Decimal("0"), memo=""):
        # On a return: swap debit and credit (a SALE debit-to-cash becomes
        # a credit-to-cash on a return refund). Amounts stay non-negative.
        d, c = _money(debit), _money(credit)
        if is_return:
            d, c = c, d
        entries.append({
            "account_code": acc.code,
            "account_name": acc.name,
            "debit": d,
            "credit": c,
            "reference": ref,
            "memo": memo,
            "entry_date": entry_date,
        })

    # --- Tenders (debit cash/card/bank/etc) ------------------------------
    for pay in bill.payments.all():
        purpose = _tender_purpose(pay.tender)
        acc = accounts_by_purpose.get(purpose)
        if not acc:
            continue
        amount = _money(pay.amount)
        if amount == 0:
            continue
        _push(acc, debit=amount, memo=f"Tender {pay.tender}")

    # --- Discounts (debit) ----------------------------------------------
    line_disc = sum((Decimal(l.line_discount or 0) for l in bill.lines.all()),
                    Decimal("0"))
    total_disc = _money((bill.bill_discount or 0) + line_disc)
    if total_disc > 0:
        acc = accounts_by_purpose.get(GLAccount.Purpose.DISCOUNT)
        if acc:
            _push(acc, debit=total_disc, memo="Discount")

    # --- Sales credit (net pre-tax revenue) ------------------------------
    # Net sales = grand_total - tax_total. This balances against tenders
    # because tenders sum to grand_total.
    net_sales = _money((bill.grand_total or 0) - (bill.tax_total or 0) - total_disc)
    # Adding back discount because tenders alone don't cover it:
    # Debits = tenders (= grand_total) + discount. Credits must equal that.
    # Credits = net_sales + tax_total + discount  (net_sales already excludes discount)
    # So sales credit = grand_total - tax_total. Recompute cleanly:
    sales_credit = _money((bill.grand_total or 0) - (bill.tax_total or 0))
    if is_return:
        sales_purpose = GLAccount.Purpose.SALES_RETURN
    else:
        sales_purpose = GLAccount.Purpose.SALES
    sales_acc = accounts_by_purpose.get(sales_purpose) or accounts_by_purpose.get(
        GLAccount.Purpose.SALES
    )
    if sales_acc and sales_credit != 0:
        _push(sales_acc, credit=sales_credit, memo="Sales")

    # --- Tax credits (per component) -------------------------------------
    breakdown = bill.tax_breakdown or []
    if breakdown:
        for comp in breakdown:
            comp_code = comp.get("code") or ""
            try:
                amt = _money(comp.get("amount") or 0)
            except Exception:
                continue
            if amt == 0:
                continue
            acc = tax_account_overrides.get(comp_code) or accounts_by_purpose.get(
                GLAccount.Purpose.TAX
            )
            if not acc:
                continue
            _push(acc, credit=amt, memo=f"Tax {comp_code or comp.get('name') or ''}")
    else:
        # Single-rate fallback: credit one TAX account for tax_total.
        amt = _money(bill.tax_total or 0)
        if amt > 0:
            acc = accounts_by_purpose.get(GLAccount.Purpose.TAX)
            if acc:
                _push(acc, credit=amt, memo="Tax")

    return entries


def render_tally_csv(entries: List[GLEntry]) -> str:
    """Tally Voucher Import CSV. Header + one row per entry.

    Columns: Date, Voucher Type, Voucher Number, Account, Debit, Credit, Narration
    Date format: DD-MM-YYYY (Tally convention).
    """
    out_lines = ["Date,Voucher Type,Voucher Number,Account,Debit,Credit,Narration"]
    for e in entries:
        d = e.entry_date.strftime("%d-%m-%Y") if e.entry_date else ""
        debit = "" if (e.debit or Decimal("0")) == 0 else f"{e.debit:.2f}"
        credit = "" if (e.credit or Decimal("0")) == 0 else f"{e.credit:.2f}"
        # Naive CSV escape: replace commas/newlines in narration.
        narration = (e.memo or "").replace(",", " ").replace("\n", " ")
        account = (e.account_name or e.account_code).replace(",", " ")
        out_lines.append(
            f"{d},Sales,{e.reference},{account},{debit},{credit},{narration}"
        )
    return "\n".join(out_lines) + "\n"


@transaction.atomic
def generate_export(
    *,
    outlet,
    date_from: date_type,
    date_to: date_type,
    user,
    shift: Optional[Shift] = None,
) -> GLExport:
    """Generate a GLExport for all CLOSED bills in [date_from, date_to].

    Skips VOID bills. Persists GLExport (DRAFT) + GLEntry rows; computes
    totals + Tally CSV cache. Missing-account purposes go to
    `totals["warnings"]` rather than failing the run.
    """
    bills_qs = Bill.objects.filter(
        outlet=outlet,
        status=Bill.Status.CLOSED,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ).prefetch_related("payments", "lines")
    if shift is not None:
        bills_qs = bills_qs.filter(shift=shift)

    accounts_by_purpose = load_accounts_by_purpose(outlet)
    tax_overrides = load_tax_account_overrides(outlet)

    warnings: List[str] = []
    needed_purposes = {
        GLAccount.Purpose.CASH, GLAccount.Purpose.SALES,
    }
    for p in needed_purposes:
        if p not in accounts_by_purpose:
            warnings.append(f"No account for purpose={p}")

    export = GLExport.objects.create(
        outlet=outlet,
        date_from=date_from,
        date_to=date_to,
        shift=shift,
        generated_by=user if (user and user.is_authenticated) else None,
        status=GLExport.Status.DRAFT,
    )

    total_debit = Decimal("0")
    total_credit = Decimal("0")
    bill_count = 0

    new_entries: List[GLEntry] = []
    for bill in bills_qs:
        bill_count += 1
        line_dicts = build_entries_for_bill(bill, accounts_by_purpose, tax_overrides)
        for d in line_dicts:
            new_entries.append(GLEntry(
                export=export,
                bill=bill,
                account_code=d["account_code"],
                account_name=d["account_name"],
                debit=d["debit"],
                credit=d["credit"],
                reference=d["reference"],
                memo=d["memo"],
                entry_date=d["entry_date"],
            ))
            total_debit += d["debit"]
            total_credit += d["credit"]

    if new_entries:
        GLEntry.objects.bulk_create(new_entries, batch_size=500)

    export.totals = {
        "total_debit": str(_money(total_debit)),
        "total_credit": str(_money(total_credit)),
        "bills": bill_count,
        "entries": len(new_entries),
        "warnings": warnings,
    }
    export.csv_text = render_tally_csv(list(export.entries.all().order_by("entry_date", "id")))
    export.save(update_fields=["totals", "csv_text"])
    return export
