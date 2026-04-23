"""
POS endpoints — shift lifecycle, billing, reports.

A single POST /api/pos/bills/ closes a bill atomically in one call:
  - the client builds the cart on-screen
  - sends the final lines + payments in one request
  - server creates Bill + lines + payments + assigns bill_no
This keeps the UX snappy and avoids half-finalized bills in the DB.
"""

from datetime import date, timedelta, datetime
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum, Count, Q, F, DecimalField
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.items.models import Item, ItemBarcode, StockMovement, ItemPriceHistory
from apps.items.inventory import apply_movement
from apps.items.pricing import set_prices
from apps.outlets.models import Outlet
from apps.accounts.models import User
from apps.uploads.models import AuditLog, PosSnapshot, Supplier
from apps.accounts.device_utils import touch_device, get_device_uuid

from .models import Shift, Bill, BillLine, Payment, Customer, CustomerCreditTxn, Promotion
from .credit import apply_credit
from .serializers import (
    ShiftSerializer, BillSerializer, PaymentSerializer,
    CreateBillInput, OpenShiftInput, CloseShiftInput,
    CustomerSerializer, PromotionSerializer, PromotionInput,
)
from .permissions import CanSell, CanOpenShift, CanCloseShift, CanVoidBill, CanViewPosReports

LOYALTY_POINTS_PER_LKR = Decimal("0.01")   # 1 point per LKR 100 spent

TWO = Decimal("0.01")
THREE = Decimal("0.001")


def _money(v):
    return Decimal(v).quantize(TWO, rounding=ROUND_HALF_UP)


def _qty(v):
    return Decimal(v).quantize(THREE, rounding=ROUND_HALF_UP)


def _user_outlet(request):
    if not request.user.outlet:
        return None
    return request.user.outlet


def _audit(user, action, entity, details=None):
    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        entity_type=entity.__class__.__name__ if entity else "",
        entity_id=str(getattr(entity, "pk", "") or ""),
        details=details or {},
    )


# -------------------------------------------------------------------
# Shift lifecycle
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_open_shift(request):
    """Return the cashier's open shift (if any)."""
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet assigned."}, status=400)
    shift = Shift.objects.filter(outlet=outlet, opened_by=request.user, status=Shift.Status.OPEN).first()
    if not shift:
        return Response(None)
    return Response(_annotate_shift(shift))


@api_view(["POST"])
@permission_classes([CanOpenShift])
def open_shift(request):
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet assigned."}, status=400)

    ser = OpenShiftInput(data=request.data)
    ser.is_valid(raise_exception=True)

    if Shift.objects.filter(outlet=outlet, opened_by=request.user, status=Shift.Status.OPEN).exists():
        return Response({"detail": "You already have an open shift — close it first."}, status=400)

    touch_device(request, action="pos_open_shift")
    shift = Shift.objects.create(
        outlet=outlet,
        opened_by=request.user,
        opening_cash=_money(ser.validated_data.get("opening_cash", 0)),
        device_uuid=get_device_uuid(request),
    )
    _audit(request.user, "pos.shift_open", shift, {"opening_cash": str(shift.opening_cash)})
    return Response(_annotate_shift(shift), status=201)


@api_view(["POST"])
@permission_classes([CanCloseShift])
def close_shift(request, shift_id):
    shift = get_object_or_404(Shift, pk=shift_id)
    if shift.status != Shift.Status.OPEN:
        return Response({"detail": "Shift is already closed."}, status=400)
    if shift.opened_by_id != request.user.id and request.user.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Only the cashier who opened the shift (or a manager) can close it."}, status=403)

    ser = CloseShiftInput(data=request.data)
    ser.is_valid(raise_exception=True)

    shift.counted_cash = _money(ser.validated_data["counted_cash"])
    shift.closing_note = ser.validated_data.get("closing_note", "")
    shift.closed_by = request.user
    shift.closed_at = timezone.now()
    shift.status = Shift.Status.CLOSED
    shift.save(update_fields=["counted_cash", "closing_note", "closed_by", "closed_at", "status"])
    _audit(request.user, "pos.shift_close", shift, {
        "counted_cash": str(shift.counted_cash),
        "note": shift.closing_note,
    })
    return Response(_annotate_shift(shift))


def _shift_aggregates(shift):
    bills = Bill.objects.filter(shift=shift, status=Bill.Status.CLOSED)
    bill_count = bills.count()

    # Sum payments per tender
    pay_rows = (
        Payment.objects.filter(bill__shift=shift, bill__status=Bill.Status.CLOSED)
        .values("tender").annotate(total=Sum("amount"))
    )
    cash_sales = Decimal("0")
    non_cash_sales = Decimal("0")
    for r in pay_rows:
        if r["tender"] == Payment.Tender.CASH:
            cash_sales += r["total"] or 0
        else:
            non_cash_sales += r["total"] or 0

    expected_cash = (shift.opening_cash or Decimal("0")) + cash_sales
    variance = None
    if shift.counted_cash is not None:
        variance = shift.counted_cash - expected_cash
    return {
        "bill_count": bill_count,
        "cash_sales": cash_sales,
        "non_cash_sales": non_cash_sales,
        "expected_cash": expected_cash,
        "cash_variance": variance,
    }


def _annotate_shift(shift):
    data = ShiftSerializer(shift).data
    data.update({k: (str(v) if isinstance(v, Decimal) else v) for k, v in _shift_aggregates(shift).items()})
    return data


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def list_shifts(request):
    outlet = _user_outlet(request)
    qs = Shift.objects.select_related("outlet", "opened_by", "closed_by")
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)
    elif request.query_params.get("outlet"):
        qs = qs.filter(outlet_id=request.query_params["outlet"])

    status_ = request.query_params.get("status")
    if status_:
        qs = qs.filter(status=status_)

    results = [_annotate_shift(s) for s in qs[:200]]
    return Response({"count": len(results), "results": results})


# -------------------------------------------------------------------
# Product lookup for billing
# -------------------------------------------------------------------

def _serialize_item(it, snap_price=None):
    price = it.sell_price if it.sell_price and it.sell_price > 0 else (snap_price or Decimal("0"))
    return {
        "id": it.id,
        "item_code": it.item_code,
        "item_name": it.item_name,
        "barcode": it.barcode,
        "selling_price": str(price),
        "tax_rate_pct": str(it.tax_rate_pct or 0),
        "on_hand": str(it.on_hand or 0),
    }


@api_view(["GET"])
@permission_classes([CanSell])
def product_search(request):
    """Quick product search for the POS screen — by code/barcode/name."""
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    q = (request.query_params.get("q") or "").strip()
    if not q:
        return Response([])

    items = list(Item.objects.filter(outlet=outlet).filter(
        Q(item_code__iexact=q) | Q(barcode=q) |
        Q(item_code__icontains=q) | Q(item_name__icontains=q)
    )[:25])

    if not items:
        bc = ItemBarcode.objects.filter(barcode=q, item__outlet=outlet).select_related("item").first()
        if bc:
            items = [bc.item]

    latest_prices = {
        row["item_id"]: row["selling_price"] for row in
        PosSnapshot.objects.filter(outlet=outlet, item_id__in=[i.id for i in items])
        .order_by("item_id", "-snapshot_date")
        .values("item_id", "selling_price")
    }
    return Response([_serialize_item(it, latest_prices.get(it.id)) for it in items])


@api_view(["GET"])
@permission_classes([CanSell])
def quick_products(request):
    """
    Top N (default 12) items by qty sold in the last 30 days for this outlet.
    Falls back to most-recently-added items if there are no sales yet.
    """
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    try:
        limit = min(int(request.query_params.get("limit", 12) or 12), 48)
    except Exception:
        limit = 12

    since = timezone.now() - timedelta(days=30)
    top = (BillLine.objects.filter(
            bill__outlet=outlet, bill__status=Bill.Status.CLOSED,
            bill__created_at__gte=since,
        )
        .values("item_id").annotate(qty=Sum("qty"))
        .order_by("-qty")[:limit])

    ids = [r["item_id"] for r in top]
    items = {i.id: i for i in Item.objects.filter(pk__in=ids, outlet=outlet)}
    out = [items[i] for i in ids if i in items]

    if len(out) < limit:
        extras = Item.objects.filter(outlet=outlet, status=Item.Status.ACTIVE).exclude(pk__in=ids).order_by("-created_at")[:limit - len(out)]
        out.extend(extras)

    latest_prices = {
        r["item_id"]: r["selling_price"] for r in
        PosSnapshot.objects.filter(outlet=outlet, item_id__in=[i.id for i in out])
        .order_by("item_id", "-snapshot_date").values("item_id", "selling_price")
    }
    return Response([_serialize_item(it, latest_prices.get(it.id)) for it in out])


@api_view(["GET"])
@permission_classes([CanSell])
def product_by_barcode(request):
    outlet = _user_outlet(request)
    code = (request.query_params.get("barcode") or "").strip()
    if not outlet or not code:
        return Response({"detail": "barcode required."}, status=400)

    item = Item.objects.filter(outlet=outlet).filter(Q(barcode=code) | Q(barcodes__barcode=code)).distinct().first()
    if not item:
        return Response({"detail": "Not found."}, status=404)
    p = PosSnapshot.objects.filter(outlet=outlet, item=item).order_by("-snapshot_date").first()
    return Response(_serialize_item(item, p.selling_price if p else None))


# -------------------------------------------------------------------
# Bill creation
# -------------------------------------------------------------------

def _next_bill_no(outlet):
    today = date.today().strftime("%y%m%d")
    prefix = f"B{outlet.id:02d}{today}"
    last = (
        Bill.objects.filter(bill_no__startswith=prefix)
        .order_by("-bill_no").values_list("bill_no", flat=True).first()
    )
    if last:
        try:
            seq = int(last[len(prefix):]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


@api_view(["POST"])
@permission_classes([CanSell])
def park_bill(request):
    """
    Park (hold) a cart. Same payload as create_bill but without payments.
    Returns the draft Bill + lines. Cashier can reopen it later.
    """
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    shift = Shift.objects.filter(outlet=outlet, opened_by=request.user, status=Shift.Status.OPEN).first()
    if not shift:
        return Response({"detail": "Open a shift first."}, status=400)

    lines = request.data.get("lines") or []
    if not lines:
        return Response({"detail": "Cart is empty."}, status=400)

    item_ids = [ln.get("item_id") for ln in lines]
    items = {i.id: i for i in Item.objects.filter(pk__in=item_ids, outlet=outlet)}

    with transaction.atomic():
        bill = Bill.objects.create(
            shift=shift, outlet=outlet, cashier=request.user,
            kind=Bill.Kind.SALE, status=Bill.Status.DRAFT,
            bill_no=_next_bill_no(outlet) + "-D",   # -D suffix to distinguish
            customer_name=(request.data.get("customer_name") or "").strip(),
            customer_phone=(request.data.get("customer_phone") or "").strip(),
        )
        for ln in lines:
            item = items.get(ln.get("item_id"))
            if not item:
                continue
            qty = _qty(ln.get("qty") or 0)
            unit_price = _money(ln.get("unit_price") or 0)
            BillLine.objects.create(
                bill=bill, item=item,
                item_code=item.item_code, item_name=item.item_name,
                qty=qty, unit_price=unit_price,
                unit_cost=item.cost_price or Decimal("0"),
                line_discount=_money(ln.get("line_discount") or 0),
                tax_rate_pct=Decimal(str(ln.get("tax_rate_pct") or 0)),
                line_total=_money(qty * unit_price - _money(ln.get("line_discount") or 0)),
                note=ln.get("note") or "",
            )
        _audit(request.user, "pos.bill_park", bill, {"line_count": len(lines)})
    return Response(BillSerializer(bill).data, status=201)


@api_view(["GET"])
@permission_classes([CanSell])
def parked_bills(request):
    """List the current user's parked (DRAFT) bills for the open shift."""
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    shift = Shift.objects.filter(outlet=outlet, opened_by=request.user, status=Shift.Status.OPEN).first()
    qs = Bill.objects.filter(outlet=outlet, status=Bill.Status.DRAFT, cashier=request.user)
    if shift:
        qs = qs.filter(shift=shift)
    return Response({"count": qs.count(), "results": BillSerializer(qs.order_by("-created_at"), many=True).data})


@api_view(["DELETE"])
@permission_classes([CanSell])
def discard_parked_bill(request, bill_id):
    b = get_object_or_404(Bill, pk=bill_id)
    if b.cashier_id != request.user.id and request.user.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)
    if b.status != Bill.Status.DRAFT:
        return Response({"detail": "Only drafts can be discarded."}, status=400)
    _audit(request.user, "pos.bill_discard_draft", b)
    b.delete()
    return Response(status=204)


@api_view(["POST"])
@permission_classes([CanSell])
def create_bill(request):
    """
    Atomically close a cart into a Bill + BillLines + Payments.
    Body:
      {
        "lines": [{ "item_id":1, "qty":"2", "unit_price":"100", "line_discount":"0", "tax_rate_pct":"0" }, ...],
        "payments": [{ "tender":"cash", "amount":"200", "reference":"" }, ...],
        "bill_discount": "0",
        "customer_name": "", "customer_phone": "",
        "kind": "sale" | "return", "returns_bill_id": null
      }
    """
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet assigned."}, status=400)

    shift = Shift.objects.filter(outlet=outlet, opened_by=request.user, status=Shift.Status.OPEN).first()
    if not shift:
        return Response({"detail": "Open a shift before billing."}, status=400)

    ser = CreateBillInput(data=request.data)
    ser.is_valid(raise_exception=True)
    v = ser.validated_data

    if not v["lines"]:
        return Response({"detail": "Bill must have at least one line."}, status=400)
    if not v["payments"]:
        return Response({"detail": "Bill must have at least one payment."}, status=400)

    item_ids = [ln["item_id"] for ln in v["lines"]]
    items = {i.id: i for i in Item.objects.filter(pk__in=item_ids, outlet=outlet)}
    missing = [i for i in item_ids if i not in items]
    if missing:
        return Response({"detail": f"Items not found or not in this outlet: {missing}"}, status=400)

    kind = v.get("kind", Bill.Kind.SALE)
    returns_bill = None
    if kind == Bill.Kind.RETURN_:
        rb_id = v.get("returns_bill_id")
        if not rb_id:
            return Response({"detail": "returns_bill_id required for returns."}, status=400)
        returns_bill = get_object_or_404(Bill, pk=rb_id, outlet=outlet, status=Bill.Status.CLOSED)

    # Upsert customer (auto-created from phone if not found)
    customer = None
    cust_name = (v.get("customer_name") or "").strip()
    cust_phone = (v.get("customer_phone") or "").strip()
    if cust_phone:
        customer = Customer.objects.filter(outlet=outlet, phone=cust_phone).first()
        if not customer:
            customer = Customer.objects.create(
                outlet=outlet, phone=cust_phone,
                name=cust_name or f"Customer {cust_phone}",
            )
        elif cust_name and customer.name != cust_name:
            customer.name = cust_name
            customer.save(update_fields=["name"])

    # Validate credit tender against customer balance before we open a txn
    credit_used = Decimal("0")
    for p in v["payments"]:
        if p["tender"] == "credit":
            credit_used += _money(p["amount"])
    if credit_used > 0:
        if not customer:
            return Response({"detail": "Credit tender requires a customer (phone)."}, status=400)
        if (customer.credit_balance or Decimal("0")) < credit_used:
            return Response({
                "detail": f"Insufficient customer credit. Balance: {customer.credit_balance}, requested: {credit_used}.",
            }, status=400)

    with transaction.atomic():
        bill = Bill.objects.create(
            shift=shift, outlet=outlet, cashier=request.user,
            kind=kind, status=Bill.Status.DRAFT,
            bill_no=_next_bill_no(outlet),
            customer=customer,
            customer_name=cust_name,
            customer_phone=cust_phone,
            returns_bill=returns_bill,
        )

        subtotal = Decimal("0")
        tax_total = Decimal("0")
        sign = Decimal("-1") if kind == Bill.Kind.RETURN_ else Decimal("1")

        for ln in v["lines"]:
            item = items[ln["item_id"]]
            qty = _qty(ln["qty"])
            unit_price = _money(ln.get("unit_price") or 0)
            if unit_price == 0:
                snap = PosSnapshot.objects.filter(outlet=outlet, item=item).order_by("-snapshot_date").first()
                unit_price = _money(snap.selling_price if snap and snap.selling_price else 0)
            line_disc = _money(ln.get("line_discount") or 0)
            tax_pct = Decimal(ln.get("tax_rate_pct") or 0)
            gross = (qty * unit_price) - line_disc
            tax_amt = _money(gross * tax_pct / Decimal("100"))
            line_total = _money(gross + tax_amt) * sign

            # Snapshot unit cost at sale time for profit reporting
            unit_cost = item.cost_price or Decimal("0")
            BillLine.objects.create(
                bill=bill, item=item,
                item_code=item.item_code, item_name=item.item_name,
                qty=qty * sign, unit_price=unit_price, unit_cost=unit_cost,
                line_discount=line_disc, tax_rate_pct=tax_pct,
                tax_amount=tax_amt * sign, line_total=line_total,
                note=ln.get("note", ""),
            )
            subtotal += gross * sign
            tax_total += tax_amt * sign

        bill_discount = _money(v.get("bill_discount") or 0) * sign
        grand_total = _money(subtotal - bill_discount + tax_total)

        paid_total = Decimal("0")
        for p in v["payments"]:
            amt = _money(p["amount"]) * sign
            Payment.objects.create(
                bill=bill, tender=p["tender"], amount=amt,
                reference=p.get("reference", ""),
            )
            paid_total += amt

        change_due = Decimal("0")
        if kind == Bill.Kind.SALE:
            if paid_total < grand_total:
                transaction.set_rollback(True)
                return Response({
                    "detail": f"Payments ({paid_total}) do not cover grand total ({grand_total}).",
                }, status=400)
            change_due = _money(paid_total - grand_total)
        # Returns: paid_total is negative (refund out), equality check skipped

        # Stock movements — sale decrements, return increments
        for ln in bill.lines.all():
            movement_kind = StockMovement.Kind.RETURN if kind == Bill.Kind.RETURN_ else StockMovement.Kind.SALE
            # qty is already signed on BillLine (negative for returns). Stock change = -qty on sale, +abs(qty) on return.
            stock_delta = -ln.qty if kind == Bill.Kind.SALE else -ln.qty  # for return, ln.qty is negative, so -qty is positive
            apply_movement(
                item=ln.item, outlet=outlet,
                kind=movement_kind,
                qty_change=stock_delta,
                user=request.user,
                unit_cost=ln.unit_price,
                ref_type="Bill", ref_id=bill.id,
                note=f"{bill.bill_no} / {ln.item_code}",
            )

        bill.subtotal = _money(subtotal)
        bill.bill_discount = bill_discount
        bill.tax_total = _money(tax_total)
        bill.grand_total = grand_total
        bill.paid_total = paid_total
        bill.change_due = change_due
        bill.status = Bill.Status.CLOSED
        bill.closed_at = timezone.now()

        # Loyalty: accrue points on sales (1 pt per LKR 100). Credit redemption is
        # its own ledger now.
        if customer and kind == Bill.Kind.SALE:
            earned = int(grand_total * LOYALTY_POINTS_PER_LKR)
            bill.loyalty_points_earned = earned
            Customer.objects.filter(pk=customer.pk).update(
                loyalty_points=F_expr_add("loyalty_points", earned),
            )

        # Customer credit ledger — apply each credit-tender leg
        if customer and credit_used > 0 and kind == Bill.Kind.SALE:
            apply_credit(
                customer=customer, amount=-credit_used,
                kind=CustomerCreditTxn.Kind.REDEEM,
                user=request.user,
                ref_type="Bill", ref_id=bill.id,
                note=f"Redeemed on {bill.bill_no}",
            )
        # Returns with credit tender = refund credited back
        if customer and kind == Bill.Kind.RETURN_:
            refund_to_credit = Decimal("0")
            for p in v["payments"]:
                if p["tender"] == "credit":
                    refund_to_credit += _money(p["amount"])
            # On return, payments are negative, so refund_to_credit is negative; flip sign to credit the customer
            if refund_to_credit < 0:
                apply_credit(
                    customer=customer, amount=-refund_to_credit,
                    kind=CustomerCreditTxn.Kind.REFUND,
                    user=request.user,
                    ref_type="Bill", ref_id=bill.id,
                    note=f"Refund on {bill.bill_no}",
                )

        bill.save()

        # Increment promotion usage counts
        promo_ids = v.get("promotion_ids") or []
        if promo_ids:
            Promotion.objects.filter(pk__in=promo_ids, outlet=outlet).update(usage_count=F("usage_count") + 1)

        _audit(request.user, "pos.bill_create", bill, {
            "bill_no": bill.bill_no,
            "grand_total": str(bill.grand_total),
            "line_count": len(v["lines"]),
            "kind": kind,
            "customer_id": customer.id if customer else None,
            "promotion_ids": promo_ids,
        })

    return Response(BillSerializer(bill).data, status=201)


def F_expr_add(field, n):
    # Helper so we can atomically add negative or positive ints to loyalty_points
    return F(field) + n


@api_view(["POST"])
@permission_classes([CanVoidBill])
def void_bill(request, bill_id):
    bill = get_object_or_404(Bill, pk=bill_id)
    reason = (request.data.get("reason") or "").strip()
    if not reason:
        return Response({"detail": "Reason required to void a bill."}, status=400)
    if bill.status == Bill.Status.VOID:
        return Response({"detail": "Already void."}, status=400)
    if bill.status == Bill.Status.RETURNED:
        return Response({"detail": "Bill already has returns — void not allowed."}, status=400)
    if bill.status != Bill.Status.CLOSED and bill.status != Bill.Status.DRAFT:
        return Response({"detail": f"Cannot void bill in status {bill.status}."}, status=400)

    # Managers can void any closed bill; cashiers only their own shift same-day
    if request.user.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if bill.cashier_id != request.user.id or bill.created_at.date() != date.today():
            return Response({"detail": "Only managers can void bills outside your current shift."}, status=403)

    with transaction.atomic():
        # Reverse stock movements
        if bill.status == Bill.Status.CLOSED:
            for ln in bill.lines.all():
                # Original movement was -ln.qty; reversal is +ln.qty (putting stock back).
                apply_movement(
                    item=ln.item, outlet=bill.outlet,
                    kind=StockMovement.Kind.VOID,
                    qty_change=ln.qty,
                    user=request.user,
                    ref_type="Bill", ref_id=bill.id,
                    note=f"VOID {bill.bill_no} / {ln.item_code}",
                )
            # Reverse loyalty
            if bill.customer_id and bill.loyalty_points_earned:
                Customer.objects.filter(pk=bill.customer_id).update(
                    loyalty_points=F_expr_add("loyalty_points", -bill.loyalty_points_earned)
                )
            # Reverse customer-credit redemption (put the credit back)
            if bill.customer_id:
                redeemed_total = sum(
                    (p.amount for p in bill.payments.all() if p.tender == Payment.Tender.CREDIT),
                    Decimal("0"),
                )
                if redeemed_total < 0:  # redemption was stored as negative credit movement
                    customer = Customer.objects.get(pk=bill.customer_id)
                    try:
                        apply_credit(
                            customer=customer, amount=-redeemed_total,   # -(-x) = +x
                            kind=CustomerCreditTxn.Kind.REVERSAL,
                            user=request.user,
                            ref_type="Bill", ref_id=bill.id,
                            note=f"VOID restored credit for {bill.bill_no}",
                        )
                    except Exception:
                        pass

        bill.status = Bill.Status.VOID
        bill.void_reason = reason[:500]
        bill.voided_by = request.user
        bill.voided_at = timezone.now()
        bill.save(update_fields=["status", "void_reason", "voided_by", "voided_at"])
        _audit(request.user, "pos.bill_void", bill, {"reason": reason})
    return Response(BillSerializer(bill).data)


# -------------------------------------------------------------------
# Reads
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bill_detail(request, bill_id):
    bill = get_object_or_404(Bill, pk=bill_id)
    if bill.outlet_id != (request.user.outlet_id or 0) and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)
    return Response(BillSerializer(bill).data)


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def list_bills(request):
    outlet = _user_outlet(request)
    qs = Bill.objects.select_related("outlet", "cashier", "shift").prefetch_related("payments")
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)
    elif request.query_params.get("outlet"):
        qs = qs.filter(outlet_id=request.query_params["outlet"])

    status_ = request.query_params.get("status")
    if status_:
        qs = qs.filter(status=status_)
    shift_id = request.query_params.get("shift")
    if shift_id:
        qs = qs.filter(shift_id=shift_id)
    search = (request.query_params.get("search") or "").strip()
    if search:
        qs = qs.filter(Q(bill_no__icontains=search) | Q(customer_name__icontains=search) | Q(customer_phone__icontains=search))

    def _parse(raw):
        try: return datetime.strptime(raw, "%Y-%m-%d").date()
        except Exception: return None
    df = _parse(request.query_params.get("date_from") or "")
    dt = _parse(request.query_params.get("date_to") or "")
    if df: qs = qs.filter(created_at__date__gte=df)
    if dt: qs = qs.filter(created_at__date__lte=dt)

    try: page = max(1, int(request.query_params.get("page", 1)))
    except Exception: page = 1
    try: page_size = min(int(request.query_params.get("page_size", 25)), 100)
    except Exception: page_size = 25

    total = qs.count()
    offset = (page - 1) * page_size
    data = BillSerializer(qs[offset: offset + page_size], many=True).data
    return Response({
        "count": total, "page": page, "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": data,
    })


# -------------------------------------------------------------------
# Customers
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanSell])
def customer_search(request):
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    q = (request.query_params.get("q") or "").strip()
    qs = Customer.objects.filter(outlet=outlet, is_active=True)
    if q:
        qs = qs.filter(Q(phone__icontains=q) | Q(name__icontains=q))
    return Response(CustomerSerializer(qs[:25], many=True).data)


@api_view(["GET", "POST"])
@permission_classes([CanSell])
def customers(request):
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    if request.method == "GET":
        qs = Customer.objects.filter(outlet=outlet).order_by("name")
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(phone__icontains=q) | Q(name__icontains=q))
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except Exception:
            page = 1
        page_size = 50
        total = qs.count()
        offset = (page - 1) * page_size
        data = CustomerSerializer(qs[offset: offset + page_size], many=True).data
        return Response({
            "count": total, "page": page, "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "results": data,
        })

    ser = CustomerSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    phone = ser.validated_data.get("phone", "")
    if phone and Customer.objects.filter(outlet=outlet, phone=phone).exists():
        return Response({"detail": "A customer with this phone already exists."}, status=400)
    cust = Customer.objects.create(outlet=outlet, **ser.validated_data)
    _audit(request.user, "pos.customer_create", cust, {"name": cust.name, "phone": cust.phone})
    return Response(CustomerSerializer(cust).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([CanSell])
def customer_detail(request, customer_id):
    outlet = _user_outlet(request)
    cust = get_object_or_404(Customer, pk=customer_id)
    if cust.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)
    if request.method == "GET":
        return Response(CustomerSerializer(cust).data)
    if request.method == "DELETE":
        cust.is_active = False
        cust.save(update_fields=["is_active"])
        _audit(request.user, "pos.customer_deactivate", cust)
        return Response(status=204)
    ser = CustomerSerializer(cust, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    _audit(request.user, "pos.customer_update", cust, {"changes": list(request.data.keys())})
    return Response(CustomerSerializer(cust).data)


# -------------------------------------------------------------------
# Stock movements (read-only)
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanViewPosReports])
def stock_movements(request):
    outlet = _user_outlet(request)
    qs = StockMovement.objects.select_related("item", "outlet", "created_by")
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)
    item_id = request.query_params.get("item")
    if item_id:
        qs = qs.filter(item_id=item_id)
    kind = request.query_params.get("kind")
    if kind:
        qs = qs.filter(kind=kind)

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except Exception:
        page = 1
    page_size = min(int(request.query_params.get("page_size", 50) or 50), 200)
    total = qs.count()
    offset = (page - 1) * page_size
    rows = [{
        "id": m.id,
        "item_code": m.item.item_code,
        "item_name": m.item.item_name,
        "kind": m.kind,
        "qty_change": str(m.qty_change),
        "balance_after": str(m.balance_after),
        "unit_cost": str(m.unit_cost) if m.unit_cost is not None else None,
        "ref_type": m.ref_type, "ref_id": m.ref_id,
        "note": m.note,
        "created_by": m.created_by.username if m.created_by else None,
        "created_at": m.created_at.isoformat(),
    } for m in qs[offset: offset + page_size]]
    return Response({
        "count": total, "page": page, "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": rows,
    })


@api_view(["POST"])
@permission_classes([CanViewPosReports])
def stock_adjust(request):
    """Manual inventory adjustment. Body: {item_id, qty_change, note}"""
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    try:
        item = Item.objects.get(pk=request.data.get("item_id"), outlet=outlet)
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=404)
    try:
        qty_change = Decimal(str(request.data.get("qty_change")))
    except Exception:
        return Response({"detail": "qty_change must be numeric."}, status=400)
    note = (request.data.get("note") or "").strip() or "Manual adjustment"
    mv = apply_movement(item=item, outlet=outlet,
                        kind=StockMovement.Kind.ADJUSTMENT,
                        qty_change=qty_change, user=request.user, note=note)
    _audit(request.user, "pos.stock_adjust", item, {"qty_change": str(qty_change), "note": note, "balance_after": str(mv.balance_after)})
    return Response({"balance_after": str(mv.balance_after), "movement_id": mv.id})


# -------------------------------------------------------------------
# Outlet settings (for receipt header + LankaQR)
# -------------------------------------------------------------------

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def outlet_settings(request, outlet_id):
    outlet = get_object_or_404(Outlet, pk=outlet_id)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN, User.Role.MANAGER):
        return Response({"detail": "Manager+ only."}, status=403)
    if request.user.role == User.Role.MANAGER and request.user.outlet_id != outlet.id:
        return Response({"detail": "Not your outlet."}, status=403)

    if request.method == "GET":
        return Response(_outlet_settings_dict(outlet))

    editable = [
        "address", "phone", "tax_reg_no", "receipt_footer",
        "lankaqr_merchant_id", "lankaqr_merchant_name",
    ]
    changes = {}
    for k in editable:
        if k in request.data:
            setattr(outlet, k, request.data[k])
            changes[k] = request.data[k]
    if "logo" in request.FILES:
        outlet.logo = request.FILES["logo"]; changes["logo"] = outlet.logo.name
    if "lankaqr_static_qr" in request.FILES:
        outlet.lankaqr_static_qr = request.FILES["lankaqr_static_qr"]; changes["lankaqr_static_qr"] = outlet.lankaqr_static_qr.name
    outlet.save()
    _audit(request.user, "pos.outlet_settings_update", outlet, {"changes": changes})
    return Response(_outlet_settings_dict(outlet))


def _outlet_settings_dict(outlet):
    return {
        "id": outlet.id,
        "outlet_name": outlet.outlet_name,
        "address": outlet.address,
        "phone": outlet.phone,
        "tax_reg_no": outlet.tax_reg_no,
        "receipt_footer": outlet.receipt_footer,
        "logo_url": outlet.logo.url if outlet.logo else None,
        "lankaqr_merchant_id": outlet.lankaqr_merchant_id,
        "lankaqr_merchant_name": outlet.lankaqr_merchant_name,
        "lankaqr_static_qr_url": outlet.lankaqr_static_qr.url if outlet.lankaqr_static_qr else None,
    }


# -------------------------------------------------------------------
# GRN (stock-in) entry — simple form for SMEs who don't have XLS exports
# -------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([CanViewPosReports])
def grn_entry(request):
    """
    Manual GRN entry. Body:
      {
        "supplier_name": "...", "invoice_no": "...", "received_date": "YYYY-MM-DD",
        "lines": [{"item_id":1, "qty":"10", "cost_price":"80", "sell_price":"100"}, ...],
        "note": "..."
      }
    Creates StockMovement(grn) per line, updates cost/sell price, logs price history.
    """
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    lines = request.data.get("lines") or []
    if not lines:
        return Response({"detail": "At least one line required."}, status=400)

    supplier_name = (request.data.get("supplier_name") or "").strip()
    supplier_code = (request.data.get("supplier_code") or "").strip()
    supplier_id = request.data.get("supplier_id")
    invoice_no = (request.data.get("invoice_no") or "").strip()
    note_base = (request.data.get("note") or "").strip()
    received_raw = request.data.get("received_date") or ""

    # Resolve / auto-create supplier
    supplier = None
    if supplier_id:
        supplier = Supplier.objects.filter(pk=supplier_id).first()
    elif supplier_code:
        supplier = Supplier.objects.filter(code__iexact=supplier_code).first()
        if not supplier and supplier_name:
            supplier = Supplier.objects.create(code=supplier_code.upper(), name=supplier_name)
    elif supplier_name:
        supplier = Supplier.objects.filter(name__iexact=supplier_name).first()
        if not supplier:
            # Auto-generate a code from the name
            base = "".join(c for c in supplier_name.upper() if c.isalnum())[:8] or "SUP"
            code = base
            i = 1
            while Supplier.objects.filter(code=code).exists():
                i += 1
                code = f"{base}{i}"
            supplier = Supplier.objects.create(code=code, name=supplier_name)
    if supplier:
        supplier_name = supplier.name
        supplier_code = supplier.code

    item_ids = [l.get("item_id") for l in lines if l.get("item_id")]
    items = {i.id: i for i in Item.objects.filter(pk__in=item_ids, outlet=outlet)}
    missing = [i for i in item_ids if i not in items]
    if missing:
        return Response({"detail": f"Items not found in outlet: {missing}"}, status=400)

    created_movements = []
    price_changes = []
    grn_ref = f"GRN-{invoice_no or timezone.now().strftime('%Y%m%d%H%M%S')}"
    supplier_label = f"{supplier_code} {supplier_name}".strip() or "—"
    with transaction.atomic():
        for l in lines:
            item = items[l["item_id"]]
            try:
                qty = Decimal(str(l.get("qty") or 0))
            except Exception:
                transaction.set_rollback(True)
                return Response({"detail": "Bad qty."}, status=400)
            if qty <= 0:
                transaction.set_rollback(True)
                return Response({"detail": "Qty must be > 0."}, status=400)
            cost = None
            if l.get("cost_price") not in (None, ""):
                cost = Decimal(str(l["cost_price"]))
            sell = None
            if l.get("sell_price") not in (None, ""):
                sell = Decimal(str(l["sell_price"]))

            mv = apply_movement(
                item=item, outlet=outlet,
                kind=StockMovement.Kind.GRN,
                qty_change=qty, user=request.user,
                unit_cost=cost,
                ref_type="GRN", ref_id=grn_ref,
                note=f"{supplier_label} / {invoice_no}".strip(" /") or note_base,
            )
            created_movements.append(mv.id)

            if sell is not None:
                set_prices(item=item, outlet=outlet, new_sell=sell, new_cost=cost,
                           user=request.user, source="grn",
                           note=f"{grn_ref} {supplier_name}".strip())
                price_changes.append({"item_id": item.id, "new_sell": str(sell)})

        # Supplier payable ledger: goods received increases what we owe them
        grn_total = Decimal("0")
        for l in lines:
            qv = Decimal(str(l.get("qty") or 0))
            cv = Decimal(str(l.get("cost_price") or 0))
            grn_total += qv * cv
        if supplier and grn_total > 0:
            from .models import SupplierPaymentTxn
            from .views_sme import _apply_supplier_txn
            _apply_supplier_txn(
                supplier=supplier, outlet=outlet,
                kind=SupplierPaymentTxn.Kind.GRN,
                amount=grn_total, user=request.user,
                ref_type="GRN", ref_id=grn_ref,
                note=f"{grn_ref} / {invoice_no}",
            )

        _audit(request.user, "pos.grn_entry", supplier, {
            "ref": grn_ref,
            "supplier_id": supplier.id if supplier else None,
            "supplier_code": supplier_code,
            "supplier_name": supplier_name,
            "invoice": invoice_no,
            "line_count": len(lines),
            "movements": created_movements,
            "price_changes": price_changes,
            "payable_delta": str(grn_total),
            "received_date": received_raw,
        })
    return Response({
        "ref": grn_ref,
        "supplier_id": supplier.id if supplier else None,
        "supplier_code": supplier_code,
        "supplier_name": supplier_name,
        "movements_created": len(created_movements),
        "price_changes": len(price_changes),
    }, status=201)


@api_view(["GET"])
@permission_classes([CanSell])
def supplier_search(request):
    """Supplier autocomplete for GRN entry."""
    q = (request.query_params.get("q") or "").strip()
    qs = Supplier.objects.filter(is_active=True)
    if q:
        qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q))
    return Response([{
        "id": s.id, "code": s.code, "name": s.name,
        "phone": s.contact_phone, "email": s.contact_email,
    } for s in qs[:25]])


# -------------------------------------------------------------------
# Bulk price update
# -------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([CanViewPosReports])
def bulk_price_update(request):
    """
    Update sell_price on many items at once. Body:
      { "updates": [{"item_id":1, "new_sell":"120"}, ...], "note": "..." }
    """
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    updates = request.data.get("updates") or []
    if not updates:
        return Response({"detail": "No updates."}, status=400)
    note = (request.data.get("note") or "").strip()

    ids = [u.get("item_id") for u in updates if u.get("item_id")]
    items = {i.id: i for i in Item.objects.filter(pk__in=ids, outlet=outlet)}

    changed = 0
    with transaction.atomic():
        for u in updates:
            item = items.get(u.get("item_id"))
            if not item:
                continue
            try:
                new_sell = Decimal(str(u["new_sell"]))
            except Exception:
                continue
            if new_sell < 0:
                continue
            set_prices(item=item, outlet=outlet, new_sell=new_sell,
                       user=request.user, source="bulk_update", note=note)
            changed += 1
        _audit(request.user, "pos.bulk_price_update", None, {
            "changed": changed, "total_rows": len(updates), "note": note,
        })
    return Response({"updated": changed, "submitted": len(updates)})


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def price_history(request):
    """Price history — filter by item_id OR outlet-wide."""
    outlet = _user_outlet(request)
    qs = ItemPriceHistory.objects.select_related("item", "changed_by")
    if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=outlet)
    item_id = request.query_params.get("item")
    if item_id:
        qs = qs.filter(item_id=item_id)
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except Exception:
        page = 1
    page_size = min(int(request.query_params.get("page_size", 50) or 50), 200)
    total = qs.count()
    offset = (page - 1) * page_size
    rows = [{
        "id": h.id,
        "item_id": h.item_id,
        "item_code": h.item.item_code,
        "item_name": h.item.item_name,
        "old_sell": str(h.old_sell) if h.old_sell is not None else None,
        "new_sell": str(h.new_sell) if h.new_sell is not None else None,
        "old_cost": str(h.old_cost) if h.old_cost is not None else None,
        "new_cost": str(h.new_cost) if h.new_cost is not None else None,
        "source": h.source,
        "note": h.note,
        "changed_by": h.changed_by.username if h.changed_by else None,
        "created_at": h.created_at.isoformat(),
    } for h in qs[offset: offset + page_size]]
    return Response({
        "count": total, "page": page, "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": rows,
    })


# -------------------------------------------------------------------
# Customer credit
# -------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([CanSell])
def customer_credit_adjust(request, customer_id):
    """
    Top up / adjust customer credit balance. Body:
      { "amount": "1000", "note": "...", "kind": "topup|adjust" }
    """
    outlet = _user_outlet(request)
    cust = get_object_or_404(Customer, pk=customer_id)
    if cust.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)
    try:
        amount = Decimal(str(request.data.get("amount") or 0))
    except Exception:
        return Response({"detail": "Invalid amount."}, status=400)
    if amount == 0:
        return Response({"detail": "Amount must be non-zero."}, status=400)
    kind = request.data.get("kind") or CustomerCreditTxn.Kind.TOPUP
    if kind not in {k for k, _ in CustomerCreditTxn.Kind.choices}:
        return Response({"detail": "Invalid kind."}, status=400)
    note = (request.data.get("note") or "").strip()
    try:
        txn = apply_credit(
            customer=cust, amount=amount, kind=kind, user=request.user, note=note,
        )
    except ValueError as e:
        return Response({"detail": str(e)}, status=400)
    _audit(request.user, "pos.customer_credit_adjust", cust, {
        "amount": str(amount), "kind": kind, "balance_after": str(txn.balance_after), "note": note,
    })
    return Response({"balance_after": str(txn.balance_after), "txn_id": txn.id})


@api_view(["GET"])
@permission_classes([CanSell])
def customer_credit_history(request, customer_id):
    outlet = _user_outlet(request)
    cust = get_object_or_404(Customer, pk=customer_id)
    if cust.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)
    rows = [{
        "id": t.id, "kind": t.kind,
        "amount": str(t.amount), "balance_after": str(t.balance_after),
        "ref_type": t.ref_type, "ref_id": t.ref_id,
        "note": t.note,
        "created_by": t.created_by.username if t.created_by else None,
        "created_at": t.created_at.isoformat(),
    } for t in cust.credit_txns.all()[:200]]
    return Response({"balance": str(cust.credit_balance), "results": rows})


# -------------------------------------------------------------------
# Promotions
# -------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([CanSell])
def promotions(request):
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    if request.method == "GET":
        qs = Promotion.objects.filter(outlet=outlet).select_related("item")
        active = request.query_params.get("active")
        if active in ("1", "true"):
            now = timezone.now()
            qs = qs.filter(is_active=True, starts_at__lte=now, ends_at__gte=now)
        return Response({"count": qs.count(), "results": PromotionSerializer(qs, many=True).data})

    ser = PromotionInput(data=request.data)
    ser.is_valid(raise_exception=True)
    promo = Promotion.objects.create(outlet=outlet, created_by=request.user, **ser.validated_data)
    _audit(request.user, "pos.promotion_create", promo, PromotionSerializer(promo).data)
    return Response(PromotionSerializer(promo).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([CanSell])
def promotion_detail(request, promotion_id):
    outlet = _user_outlet(request)
    promo = get_object_or_404(Promotion, pk=promotion_id)
    if promo.outlet_id != (outlet.id if outlet else None) and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)
    if request.method == "GET":
        return Response(PromotionSerializer(promo).data)
    if request.method == "DELETE":
        promo.is_active = False
        promo.save(update_fields=["is_active"])
        _audit(request.user, "pos.promotion_deactivate", promo)
        return Response(status=204)
    ser = PromotionInput(promo, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    _audit(request.user, "pos.promotion_update", promo, {"changes": list(request.data.keys())})
    return Response(PromotionSerializer(promo).data)


@api_view(["GET"])
@permission_classes([CanSell])
def active_promotions(request):
    """Active promos for the cashier's outlet — optionally filtered to items in cart."""
    outlet = _user_outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    now = timezone.now()
    qs = Promotion.objects.filter(
        outlet=outlet, is_active=True, starts_at__lte=now, ends_at__gte=now,
    ).select_related("item")

    item_ids_raw = request.query_params.get("item_ids") or ""
    if item_ids_raw:
        ids = [int(x) for x in item_ids_raw.split(",") if x.strip().isdigit()]
        item_cats = list(Item.objects.filter(pk__in=ids).values_list("category", flat=True))
        qs = qs.filter(
            Q(scope=Promotion.Scope.BILL)
            | (Q(scope=Promotion.Scope.ITEM) & Q(item_id__in=ids))
            | (Q(scope=Promotion.Scope.CATEGORY) & Q(category__in=[c for c in item_cats if c]))
        )
    # Filter out promos that hit max_usage
    qs = [p for p in qs if p.max_usage == 0 or p.usage_count < p.max_usage]
    return Response(PromotionSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def daily_sales(request):
    """Aggregated daily sales for an outlet."""
    outlet = _user_outlet(request)
    if not outlet and not request.query_params.get("outlet"):
        return Response({"detail": "Outlet required."}, status=400)
    if request.query_params.get("outlet"):
        outlet = get_object_or_404(Outlet, pk=request.query_params["outlet"])

    today = date.today()
    try:
        df = datetime.strptime(request.query_params.get("date_from", ""), "%Y-%m-%d").date()
    except Exception:
        df = today - timedelta(days=6)
    try:
        dt = datetime.strptime(request.query_params.get("date_to", ""), "%Y-%m-%d").date()
    except Exception:
        dt = today

    bills = Bill.objects.filter(outlet=outlet, status=Bill.Status.CLOSED,
                                created_at__date__gte=df, created_at__date__lte=dt)

    day_map = {}
    for b in bills.values("created_at__date").annotate(
        total=Sum("grand_total"), bill_count=Count("id")
    ):
        day_map[str(b["created_at__date"])] = {
            "date": str(b["created_at__date"]),
            "bill_count": b["bill_count"],
            "total": str(b["total"] or 0),
            "cash": "0", "card": "0", "lankaqr": "0", "other": "0",
        }

    pay_rows = (
        Payment.objects.filter(bill__outlet=outlet, bill__status=Bill.Status.CLOSED,
                               bill__created_at__date__gte=df, bill__created_at__date__lte=dt)
        .values("bill__created_at__date", "tender").annotate(total=Sum("amount"))
    )
    for r in pay_rows:
        key = str(r["bill__created_at__date"])
        row = day_map.setdefault(key, {
            "date": key, "bill_count": 0, "total": "0",
            "cash": "0", "card": "0", "lankaqr": "0", "other": "0",
        })
        tender = r["tender"]
        bucket = "cash" if tender == "cash" else "card" if tender == "card" else "lankaqr" if tender == "lankaqr" else "other"
        row[bucket] = str((Decimal(row[bucket]) + (r["total"] or 0)).quantize(TWO))

    rows = sorted(day_map.values(), key=lambda r: r["date"], reverse=True)
    totals = {
        "bill_count": sum(r["bill_count"] for r in rows),
        "total": str(sum((Decimal(r["total"]) for r in rows), Decimal("0")).quantize(TWO)),
        "cash": str(sum((Decimal(r["cash"]) for r in rows), Decimal("0")).quantize(TWO)),
        "card": str(sum((Decimal(r["card"]) for r in rows), Decimal("0")).quantize(TWO)),
        "lankaqr": str(sum((Decimal(r["lankaqr"]) for r in rows), Decimal("0")).quantize(TWO)),
        "other": str(sum((Decimal(r["other"]) for r in rows), Decimal("0")).quantize(TWO)),
    }
    return Response({"date_from": str(df), "date_to": str(dt), "totals": totals, "results": rows})
