"""
SME-mode endpoints (items 1–12 of the audit).

Everything an SME needs when they don't upload XLS snapshots:
  - Item CRUD + CSV import
  - Reorder/low-stock report
  - Reports: top-selling, profit, tax
  - Shift Z report
  - Expense entry
  - Purchase returns + supplier payables
"""
import csv, io
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum, Count, F, Q, DecimalField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permission_registry import user_has_permission
from apps.items.models import Item, StockMovement
from apps.items.inventory import apply_movement
from apps.items.pricing import set_prices
from apps.outlets.models import Outlet
from apps.uploads.models import AuditLog, Supplier

from .models import (
    Bill, BillLine, Payment, Shift, Expense, PurchaseReturn,
    PurchaseReturnLine, SupplierPaymentTxn,
)
from .permissions import CanSell, CanViewPosReports

TWO = Decimal("0.01")
THREE = Decimal("0.001")


def _money(v):
    return Decimal(v or 0).quantize(TWO, rounding=ROUND_HALF_UP)


def _qty(v):
    return Decimal(v or 0).quantize(THREE, rounding=ROUND_HALF_UP)


def _outlet(request):
    return request.user.outlet


def _audit(user, action, entity, details=None):
    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        entity_type=entity.__class__.__name__ if entity else "",
        entity_id=str(getattr(entity, "pk", "") or ""),
        details=details or {},
    )


def _parse_date(raw, default=None):
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return default


# -------------------------------------------------------------------
# 1. Item CRUD
# -------------------------------------------------------------------

def _item_dict(it):
    return {
        "id": it.id,
        "item_code": it.item_code,
        "item_name": it.item_name,
        "barcode": it.barcode or "",
        "category": it.category or "",
        "rack_number": it.rack_number or "",
        "shelf": it.shelf or "",
        "sell_price": str(it.sell_price or 0),
        "cost_price": str(it.cost_price or 0),
        "tax_rate_pct": str(it.tax_rate_pct or 0),
        "on_hand": str(it.on_hand or 0),
        "reorder_level": str(it.reorder_level or 0),
        "is_nbci": it.is_nbci,
        "status": it.status,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def product_list_create(request):
    outlet = _outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    if request.method == "GET":
        qs = Item.objects.filter(outlet=outlet).order_by("item_code")
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(item_code__icontains=q) | Q(item_name__icontains=q) | Q(barcode=q))
        cat = request.query_params.get("category")
        if cat:
            qs = qs.filter(category=cat)
        low = request.query_params.get("low_stock")
        if low in ("1", "true"):
            qs = qs.filter(reorder_level__gt=0, on_hand__lt=F("reorder_level"))
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except Exception:
            page = 1
        try:
            page_size = min(int(request.query_params.get("page_size", 50) or 50), 200)
        except Exception:
            page_size = 50
        total = qs.count()
        offset = (page - 1) * page_size
        return Response({
            "count": total, "page": page, "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "results": [_item_dict(i) for i in qs[offset: offset + page_size]],
        })

    # POST — create
    if not user_has_permission(request.user, "items.bulk_upload") and request.user.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not allowed."}, status=403)

    data = request.data
    code = (data.get("item_code") or "").strip()
    name = (data.get("item_name") or "").strip()
    if not code or not name:
        return Response({"detail": "item_code and item_name are required."}, status=400)
    if Item.objects.filter(outlet=outlet, item_code=code).exists():
        return Response({"detail": "item_code already exists in this outlet."}, status=400)

    opening = Decimal(str(data.get("on_hand") or 0))
    it = Item.objects.create(
        outlet=outlet,
        item_code=code, item_name=name,
        barcode=(data.get("barcode") or None) or None,
        category=(data.get("category") or ""),
        rack_number=(data.get("rack_number") or ""),
        shelf=(data.get("shelf") or ""),
        sell_price=Decimal(str(data.get("sell_price") or 0)),
        cost_price=Decimal(str(data.get("cost_price") or 0)),
        tax_rate_pct=Decimal(str(data.get("tax_rate_pct") or 0)),
        reorder_level=Decimal(str(data.get("reorder_level") or 0)),
        is_nbci=bool(data.get("is_nbci")),
        status=Item.Status.ACTIVE,
    )
    if opening > 0:
        apply_movement(
            item=it, outlet=outlet, kind=StockMovement.Kind.OPENING,
            qty_change=opening, user=request.user, note="Opening stock",
        )
    _audit(request.user, "pos.product_create", it, {"code": code, "name": name, "opening": str(opening)})
    return Response(_item_dict(it), status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def product_detail(request, item_id):
    outlet = _outlet(request)
    it = get_object_or_404(Item, pk=item_id)
    if it.outlet_id != outlet.id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)

    if request.method == "GET":
        return Response(_item_dict(it))

    if request.method == "DELETE":
        if request.user.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN):
            return Response({"detail": "Not allowed."}, status=403)
        # Soft-ish delete: mark inactive by flipping status; full delete is destructive
        it.status = Item.Status.PENDING_BARCODE
        it.save(update_fields=["status"])
        _audit(request.user, "pos.product_deactivate", it)
        return Response(status=204)

    # PATCH
    data = request.data
    editable_direct = ["item_name", "barcode", "category", "rack_number", "shelf",
                       "tax_rate_pct", "reorder_level", "is_nbci", "cost_price"]
    for k in editable_direct:
        if k in data:
            val = data[k]
            if k in ("tax_rate_pct", "reorder_level", "cost_price"):
                val = Decimal(str(val or 0))
            setattr(it, k, val if val is not None else "")
    if "sell_price" in data:
        set_prices(item=it, outlet=outlet, new_sell=Decimal(str(data["sell_price"] or 0)),
                   user=request.user, source="manual", note="Product edit")
    else:
        it.save()
    _audit(request.user, "pos.product_update", it, {"changes": list(data.keys())})
    it.refresh_from_db()
    return Response(_item_dict(it))


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated])
def product_csv_import(request):
    """
    CSV import for products. Headers (case-insensitive):
      item_code, item_name, barcode, category, cost_price, sell_price,
      tax_rate_pct, on_hand (opening), reorder_level
    Existing items (by item_code) are updated. Missing fields keep current values.
    """
    outlet = _outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    if request.user.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Manager+ only."}, status=403)

    f = request.FILES.get("file")
    if not f:
        return Response({"detail": "Upload CSV as 'file'."}, status=400)

    try:
        text = f.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({"detail": "CSV must be UTF-8."}, status=400)

    reader = csv.DictReader(io.StringIO(text))
    created = 0
    updated = 0
    errors = []

    def val(row, key, default=""):
        for k in row.keys():
            if k and k.strip().lower() == key:
                v = row[k]
                return (v or "").strip() if isinstance(v, str) else v
        return default

    with transaction.atomic():
        for idx, row in enumerate(reader, start=2):
            code = val(row, "item_code")
            name = val(row, "item_name")
            if not code:
                errors.append({"row": idx, "error": "missing item_code"}); continue
            try:
                existing = Item.objects.filter(outlet=outlet, item_code=code).first()
                if existing:
                    if name: existing.item_name = name
                    bc = val(row, "barcode");
                    if bc: existing.barcode = bc
                    cat = val(row, "category")
                    if cat: existing.category = cat
                    if val(row, "cost_price"):
                        existing.cost_price = Decimal(val(row, "cost_price"))
                    if val(row, "tax_rate_pct"):
                        existing.tax_rate_pct = Decimal(val(row, "tax_rate_pct"))
                    if val(row, "reorder_level"):
                        existing.reorder_level = Decimal(val(row, "reorder_level"))
                    existing.save()
                    if val(row, "sell_price"):
                        set_prices(item=existing, outlet=outlet,
                                   new_sell=Decimal(val(row, "sell_price")),
                                   user=request.user, source="api", note="CSV import")
                    updated += 1
                else:
                    if not name:
                        errors.append({"row": idx, "error": "missing item_name for new item"}); continue
                    it = Item.objects.create(
                        outlet=outlet, item_code=code, item_name=name,
                        barcode=val(row, "barcode") or None,
                        category=val(row, "category"),
                        sell_price=Decimal(val(row, "sell_price") or 0),
                        cost_price=Decimal(val(row, "cost_price") or 0),
                        tax_rate_pct=Decimal(val(row, "tax_rate_pct") or 0),
                        reorder_level=Decimal(val(row, "reorder_level") or 0),
                        status=Item.Status.ACTIVE,
                    )
                    opening = Decimal(val(row, "on_hand") or 0)
                    if opening > 0:
                        apply_movement(
                            item=it, outlet=outlet, kind=StockMovement.Kind.OPENING,
                            qty_change=opening, user=request.user, note="Opening (CSV import)",
                        )
                    created += 1
            except Exception as e:
                errors.append({"row": idx, "error": str(e)})

        _audit(request.user, "pos.product_csv_import", None, {
            "created": created, "updated": updated, "errors": len(errors),
        })
    return Response({"created": created, "updated": updated, "errors": errors})


# -------------------------------------------------------------------
# 5. Low-stock report
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanViewPosReports])
def low_stock_report(request):
    outlet = _outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    qs = (Item.objects.filter(outlet=outlet, reorder_level__gt=0, on_hand__lt=F("reorder_level"))
                      .order_by("item_code"))
    rows = [{
        "id": i.id, "item_code": i.item_code, "item_name": i.item_name,
        "on_hand": str(i.on_hand), "reorder_level": str(i.reorder_level),
        "shortfall": str((i.reorder_level or 0) - (i.on_hand or 0)),
        "cost_price": str(i.cost_price or 0),
        "category": i.category or "",
    } for i in qs]
    return Response({"count": len(rows), "results": rows})


# -------------------------------------------------------------------
# 6. Top-selling / slow-moving
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanViewPosReports])
def top_selling_report(request):
    outlet = _outlet(request)
    today = date.today()
    date_from = _parse_date(request.query_params.get("date_from"), today - timedelta(days=30))
    date_to = _parse_date(request.query_params.get("date_to"), today)
    limit = min(int(request.query_params.get("limit", 50) or 50), 500)
    direction = request.query_params.get("direction", "top")   # top | slow

    lines = (
        BillLine.objects.filter(
            bill__outlet=outlet, bill__status=Bill.Status.CLOSED,
            bill__created_at__date__gte=date_from, bill__created_at__date__lte=date_to,
        )
        .values("item_id", "item_code", "item_name")
        .annotate(
            qty_sold=Sum("qty"),
            revenue=Sum("line_total"),
            txn_count=Count("bill_id", distinct=True),
        )
    )
    rows = [{
        "item_id": r["item_id"], "item_code": r["item_code"], "item_name": r["item_name"],
        "qty_sold": str(r["qty_sold"] or 0),
        "revenue": str(r["revenue"] or 0),
        "txn_count": r["txn_count"],
    } for r in lines]
    rows.sort(key=lambda r: float(r["qty_sold"]), reverse=(direction == "top"))
    return Response({
        "date_from": str(date_from), "date_to": str(date_to),
        "direction": direction, "count": len(rows),
        "results": rows[:limit],
    })


# -------------------------------------------------------------------
# 7. Profit / margin report
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanViewPosReports])
def profit_report(request):
    outlet = _outlet(request)
    today = date.today()
    date_from = _parse_date(request.query_params.get("date_from"), today - timedelta(days=7))
    date_to = _parse_date(request.query_params.get("date_to"), today)
    group_by = request.query_params.get("group_by", "day")   # day | item | category

    lines = BillLine.objects.filter(
        bill__outlet=outlet, bill__status=Bill.Status.CLOSED,
        bill__created_at__date__gte=date_from, bill__created_at__date__lte=date_to,
    )

    if group_by == "day":
        agg = (lines.values(day=F("bill__created_at__date"))
                   .annotate(
                       revenue=Sum("line_total"),
                       cost=Sum(F("qty") * F("unit_cost"), output_field=DecimalField(max_digits=18, decimal_places=2)),
                   )
                   .order_by("-day"))
        rows = [{
            "key": str(r["day"]),
            "revenue": str(r["revenue"] or 0),
            "cost": str(r["cost"] or 0),
            "profit": str((r["revenue"] or Decimal("0")) - (r["cost"] or Decimal("0"))),
        } for r in agg]
    elif group_by == "item":
        agg = (lines.values("item_id", "item_code", "item_name")
                   .annotate(
                       qty=Sum("qty"),
                       revenue=Sum("line_total"),
                       cost=Sum(F("qty") * F("unit_cost"), output_field=DecimalField(max_digits=18, decimal_places=2)),
                   ).order_by("-revenue"))
        rows = [{
            "key": f"{r['item_code']} — {r['item_name']}",
            "item_id": r["item_id"],
            "qty": str(r["qty"] or 0),
            "revenue": str(r["revenue"] or 0),
            "cost": str(r["cost"] or 0),
            "profit": str((r["revenue"] or Decimal("0")) - (r["cost"] or Decimal("0"))),
        } for r in agg]
    else:
        agg = (lines.values(category=F("item__category"))
                   .annotate(
                       revenue=Sum("line_total"),
                       cost=Sum(F("qty") * F("unit_cost"), output_field=DecimalField(max_digits=18, decimal_places=2)),
                   ).order_by("-revenue"))
        rows = [{
            "key": r["category"] or "—",
            "revenue": str(r["revenue"] or 0),
            "cost": str(r["cost"] or 0),
            "profit": str((r["revenue"] or Decimal("0")) - (r["cost"] or Decimal("0"))),
        } for r in agg]

    totals = {
        "revenue": str(sum((Decimal(r["revenue"]) for r in rows), Decimal("0"))),
        "cost": str(sum((Decimal(r["cost"]) for r in rows), Decimal("0"))),
        "profit": str(sum((Decimal(r["profit"]) for r in rows), Decimal("0"))),
    }
    return Response({
        "date_from": str(date_from), "date_to": str(date_to),
        "group_by": group_by, "totals": totals, "results": rows,
    })


# -------------------------------------------------------------------
# 8. Tax / VAT summary
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanViewPosReports])
def tax_summary_report(request):
    outlet = _outlet(request)
    today = date.today()
    date_from = _parse_date(request.query_params.get("date_from"), today.replace(day=1))
    date_to = _parse_date(request.query_params.get("date_to"), today)

    lines = BillLine.objects.filter(
        bill__outlet=outlet, bill__status=Bill.Status.CLOSED,
        bill__created_at__date__gte=date_from, bill__created_at__date__lte=date_to,
    )

    by_rate = (lines.values("tax_rate_pct")
                    .annotate(
                        taxable_base=Sum(F("qty") * F("unit_price") - F("line_discount"),
                                          output_field=DecimalField(max_digits=18, decimal_places=2)),
                        tax_amount=Sum("tax_amount"),
                    )
                    .order_by("tax_rate_pct"))
    rows = [{
        "tax_rate_pct": str(r["tax_rate_pct"] or 0),
        "taxable_base": str(r["taxable_base"] or 0),
        "tax_amount": str(r["tax_amount"] or 0),
    } for r in by_rate]
    totals = {
        "taxable_base": str(sum((Decimal(r["taxable_base"]) for r in rows), Decimal("0"))),
        "tax_amount": str(sum((Decimal(r["tax_amount"]) for r in rows), Decimal("0"))),
    }
    return Response({
        "date_from": str(date_from), "date_to": str(date_to),
        "totals": totals, "results": rows,
    })


# -------------------------------------------------------------------
# 9. Shift Z report
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def shift_z_report(request, shift_id):
    shift = get_object_or_404(Shift.objects.select_related("outlet", "opened_by", "closed_by"), pk=shift_id)
    if request.user.outlet_id != shift.outlet_id and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)

    bills = Bill.objects.filter(shift=shift, status=Bill.Status.CLOSED)
    voided = Bill.objects.filter(shift=shift, status=Bill.Status.VOID)
    bill_count = bills.count()
    voided_count = voided.count()
    grand = bills.aggregate(s=Sum("grand_total"))["s"] or Decimal("0")
    returns = bills.filter(kind=Bill.Kind.RETURN_).aggregate(s=Sum("grand_total"))["s"] or Decimal("0")
    tax_total = bills.aggregate(s=Sum("tax_total"))["s"] or Decimal("0")
    discount_total = bills.aggregate(s=Sum("bill_discount"))["s"] or Decimal("0")

    tenders = (Payment.objects.filter(bill__shift=shift, bill__status=Bill.Status.CLOSED)
                               .values("tender").annotate(total=Sum("amount")))
    tender_map = {t["tender"]: t["total"] or Decimal("0") for t in tenders}
    expenses = Expense.objects.filter(shift=shift).aggregate(s=Sum("amount"))["s"] or Decimal("0")

    cash_sales = tender_map.get("cash") or Decimal("0")
    expected_cash = (shift.opening_cash or Decimal("0")) + cash_sales - expenses

    return Response({
        "shift_id": shift.id,
        "outlet_name": shift.outlet.outlet_name,
        "cashier": shift.opened_by.username,
        "opened_at": shift.opened_at.isoformat(),
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
        "status": shift.status,
        "opening_cash": str(shift.opening_cash or 0),
        "counted_cash": str(shift.counted_cash) if shift.counted_cash is not None else None,
        "expected_cash": str(expected_cash),
        "cash_variance": str((shift.counted_cash or Decimal("0")) - expected_cash) if shift.counted_cash is not None else None,
        "bill_count": bill_count,
        "voided_count": voided_count,
        "grand_total": str(grand),
        "returns_total": str(returns),
        "tax_total": str(tax_total),
        "discount_total": str(discount_total),
        "expense_total": str(expenses),
        "tenders": {k: str(v) for k, v in tender_map.items()},
    })


# -------------------------------------------------------------------
# 11. Expense entry
# -------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def expenses(request):
    outlet = _outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    if request.method == "GET":
        qs = Expense.objects.filter(outlet=outlet).select_related("shift", "created_by").order_by("-created_at")
        shift_id = request.query_params.get("shift")
        if shift_id:
            qs = qs.filter(shift_id=shift_id)
        df = _parse_date(request.query_params.get("date_from"))
        dt = _parse_date(request.query_params.get("date_to"))
        if df: qs = qs.filter(created_at__date__gte=df)
        if dt: qs = qs.filter(created_at__date__lte=dt)
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except Exception:
            page = 1
        page_size = min(int(request.query_params.get("page_size", 50) or 50), 200)
        total = qs.count()
        offset = (page - 1) * page_size
        rows = [{
            "id": e.id, "kind": e.kind, "amount": str(e.amount),
            "note": e.note, "paid_to": e.paid_to, "receipt_ref": e.receipt_ref,
            "shift_id": e.shift_id,
            "created_by": e.created_by.username if e.created_by else None,
            "created_at": e.created_at.isoformat(),
        } for e in qs[offset: offset + page_size]]
        totals = qs.aggregate(s=Sum("amount"))["s"] or Decimal("0")
        return Response({
            "count": total, "page": page, "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "total_amount": str(totals),
            "results": rows,
        })

    data = request.data
    amount = _money(data.get("amount"))
    if amount <= 0:
        return Response({"detail": "amount must be > 0."}, status=400)
    shift = Shift.objects.filter(outlet=outlet, opened_by=request.user, status=Shift.Status.OPEN).first()
    exp = Expense.objects.create(
        outlet=outlet, shift=shift,
        kind=data.get("kind") or Expense.Kind.PETTY,
        amount=amount,
        note=(data.get("note") or "").strip(),
        paid_to=(data.get("paid_to") or "").strip(),
        receipt_ref=(data.get("receipt_ref") or "").strip(),
        created_by=request.user,
    )
    _audit(request.user, "pos.expense_create", exp, {"amount": str(amount), "kind": exp.kind})
    return Response({"id": exp.id, "amount": str(exp.amount)}, status=201)


# -------------------------------------------------------------------
# 12. Purchase Return (RTS) + supplier payable ledger
# -------------------------------------------------------------------

def _next_pr_ref():
    today = date.today().strftime("%y%m%d")
    prefix = f"PR{today}"
    last = (PurchaseReturn.objects.filter(ref_no__startswith=prefix).order_by("-ref_no")
                .values_list("ref_no", flat=True).first())
    try:
        seq = int(last[len(prefix):]) + 1 if last else 1
    except ValueError:
        seq = 1
    return f"{prefix}{seq:04d}"


def _apply_supplier_txn(*, supplier, outlet, kind, amount, user=None, ref_type="", ref_id="", note=""):
    from django.db.models import F as _F
    locked = Supplier.objects.select_for_update().get(pk=supplier.pk)
    # Compute balance_after from existing ledger head for this supplier+outlet
    last = (SupplierPaymentTxn.objects.filter(supplier=locked, outlet=outlet)
             .order_by("-created_at").first())
    prev = last.balance_after if last else Decimal("0")
    new_balance = prev + Decimal(amount)
    return SupplierPaymentTxn.objects.create(
        supplier=locked, outlet=outlet, kind=kind,
        amount=Decimal(amount), balance_after=new_balance,
        ref_type=ref_type, ref_id=str(ref_id or ""),
        note=note,
        created_by=user if (user and user.is_authenticated) else None,
    )


@api_view(["POST"])
@permission_classes([CanViewPosReports])
def purchase_return_create(request):
    """
    Body: {
      supplier_id or supplier_code or supplier_name,
      original_invoice_no, returned_on, note,
      lines: [{item_id, qty, unit_cost}]
    }
    """
    outlet = _outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    data = request.data
    lines = data.get("lines") or []
    if not lines:
        return Response({"detail": "At least one line required."}, status=400)

    supplier = None
    if data.get("supplier_id"):
        supplier = Supplier.objects.filter(pk=data["supplier_id"]).first()
    elif data.get("supplier_code"):
        supplier = Supplier.objects.filter(code__iexact=data["supplier_code"]).first()

    supplier_name = (data.get("supplier_name") or (supplier.name if supplier else "")).strip()
    supplier_code = supplier.code if supplier else (data.get("supplier_code") or "").strip()

    item_ids = [l.get("item_id") for l in lines]
    items = {i.id: i for i in Item.objects.filter(pk__in=item_ids, outlet=outlet)}
    missing = [i for i in item_ids if i not in items]
    if missing:
        return Response({"detail": f"Items not found: {missing}"}, status=400)

    returned_on = _parse_date(data.get("returned_on"), date.today())

    with transaction.atomic():
        pr = PurchaseReturn.objects.create(
            outlet=outlet, supplier=supplier,
            supplier_name=supplier_name, supplier_code=supplier_code,
            ref_no=_next_pr_ref(),
            original_invoice_no=(data.get("original_invoice_no") or "").strip(),
            returned_on=returned_on,
            note=(data.get("note") or "").strip(),
            created_by=request.user,
        )
        total = Decimal("0")
        for l in lines:
            item = items[l["item_id"]]
            qty = _qty(l.get("qty") or 0)
            if qty <= 0:
                transaction.set_rollback(True)
                return Response({"detail": "qty must be > 0."}, status=400)
            cost = _money(l.get("unit_cost") or item.cost_price or 0)
            line_total = _money(qty * cost)
            PurchaseReturnLine.objects.create(
                ret=pr, item=item, item_code=item.item_code, item_name=item.item_name,
                qty=qty, unit_cost=cost, line_total=line_total,
            )
            total += line_total
            # Stock-out
            apply_movement(
                item=item, outlet=outlet, kind=StockMovement.Kind.TRANSFER_OUT if False else StockMovement.Kind.DAMAGE,
                qty_change=-qty, user=request.user, unit_cost=cost,
                ref_type="PurchaseReturn", ref_id=pr.ref_no,
                note=f"RTS {pr.ref_no} / {supplier_name}",
            )
        pr.total_amount = total
        pr.save(update_fields=["total_amount"])

        # Supplier payable: we returned goods → payable goes down (negative movement)
        if supplier:
            _apply_supplier_txn(
                supplier=supplier, outlet=outlet,
                kind=SupplierPaymentTxn.Kind.RTS,
                amount=-total, user=request.user,
                ref_type="PurchaseReturn", ref_id=pr.ref_no,
                note=f"RTS {pr.ref_no}",
            )
        _audit(request.user, "pos.purchase_return_create", pr, {
            "ref": pr.ref_no, "total": str(total), "supplier": supplier_name,
        })
    return Response({"ref_no": pr.ref_no, "total_amount": str(total)}, status=201)


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def purchase_return_list(request):
    outlet = _outlet(request)
    qs = PurchaseReturn.objects.filter(outlet=outlet).select_related("supplier", "created_by").order_by("-created_at")
    df = _parse_date(request.query_params.get("date_from"))
    dt = _parse_date(request.query_params.get("date_to"))
    if df: qs = qs.filter(returned_on__gte=df)
    if dt: qs = qs.filter(returned_on__lte=dt)
    rows = [{
        "id": r.id, "ref_no": r.ref_no,
        "supplier_id": r.supplier_id, "supplier_name": r.supplier_name, "supplier_code": r.supplier_code,
        "original_invoice_no": r.original_invoice_no,
        "returned_on": str(r.returned_on),
        "total_amount": str(r.total_amount),
        "status": r.status, "note": r.note,
        "created_by": r.created_by.username if r.created_by else None,
        "created_at": r.created_at.isoformat(),
    } for r in qs[:200]]
    return Response({"count": len(rows), "results": rows})


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def supplier_payables_report(request):
    """Per-supplier payable balance (sum of supplier_payment_txns)."""
    outlet = _outlet(request)
    qs = SupplierPaymentTxn.objects.filter(outlet=outlet)
    rows_map = {}
    for t in qs:
        d = rows_map.setdefault(t.supplier_id, {
            "supplier_id": t.supplier_id, "balance": Decimal("0"), "txn_count": 0,
        })
        d["balance"] = t.balance_after  # last-wins by ordering "-created_at" means we need to iterate oldest-first actually
        d["txn_count"] += 1

    # Re-compute properly from the most recent balance_after per supplier
    latest = {}
    for t in qs.order_by("supplier_id", "-created_at"):
        if t.supplier_id not in latest:
            latest[t.supplier_id] = t.balance_after
    supplier_ids = list(latest.keys())
    sup_map = {s.id: s for s in Supplier.objects.filter(pk__in=supplier_ids)}
    rows = [{
        "supplier_id": sid, "supplier_code": sup_map[sid].code, "supplier_name": sup_map[sid].name,
        "payable_balance": str(bal),
    } for sid, bal in latest.items() if sid in sup_map]
    rows.sort(key=lambda r: float(r["payable_balance"]), reverse=True)
    total = sum((Decimal(r["payable_balance"]) for r in rows), Decimal("0"))
    return Response({"total_payable": str(total), "count": len(rows), "results": rows})


@api_view(["POST"])
@permission_classes([CanViewPosReports])
def supplier_payment_create(request):
    """Record a payment made to a supplier (cash out to them)."""
    outlet = _outlet(request)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    supplier = get_object_or_404(Supplier, pk=request.data.get("supplier_id"))
    amount = _money(request.data.get("amount") or 0)
    if amount <= 0:
        return Response({"detail": "amount > 0"}, status=400)
    with transaction.atomic():
        txn = _apply_supplier_txn(
            supplier=supplier, outlet=outlet,
            kind=SupplierPaymentTxn.Kind.PAYMENT,
            amount=-amount, user=request.user,
            ref_type="Payment", ref_id=(request.data.get("reference") or ""),
            note=(request.data.get("note") or "")[:500],
        )
    return Response({"balance_after": str(txn.balance_after), "txn_id": txn.id})


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def supplier_ledger(request, supplier_id):
    outlet = _outlet(request)
    qs = SupplierPaymentTxn.objects.filter(supplier_id=supplier_id, outlet=outlet).select_related("created_by")
    rows = [{
        "id": t.id, "kind": t.kind,
        "amount": str(t.amount), "balance_after": str(t.balance_after),
        "ref_type": t.ref_type, "ref_id": t.ref_id, "note": t.note,
        "created_by": t.created_by.username if t.created_by else None,
        "created_at": t.created_at.isoformat(),
    } for t in qs[:500]]
    return Response({"count": len(rows), "results": rows})
