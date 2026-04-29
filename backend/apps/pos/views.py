"""
POS endpoints — shift lifecycle, billing, reports.

A single POST /api/pos/bills/ closes a bill atomically in one call:
  - the client builds the cart on-screen
  - sends the final lines + payments in one request
  - server creates Bill + lines + payments + assigns bill_no
This keeps the UX snappy and avoids half-finalized bills in the DB.
"""

import hashlib
import json
import logging
import uuid
from datetime import date, timedelta, datetime
from decimal import Decimal, ROUND_HALF_UP
from functools import wraps

from django.core.cache import cache
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import transaction
from django.db.models import Sum, Count, Q, F, DecimalField
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Manager-PIN approval token configuration.
APPROVAL_TOKEN_SALT = "pos.discount.approval"
APPROVAL_TOKEN_TTL = 300            # 5 minutes
APPROVAL_NONCE_TTL = 600            # 10 minutes (anti-replay)
PIN_LOCKOUT_THRESHOLD = 5
PIN_LOCKOUT_SECONDS = 60


def _cache_available():
    """Return True iff the configured cache backend appears usable."""
    try:
        cache.set("__pos_cache_probe__", "1", 5)
        return cache.get("__pos_cache_probe__") == "1"
    except Exception:
        return False


def _issue_approval_token(*, manager_id, kind, outlet_id, amount):
    """Sign a short-lived approval token bound to (kind, outlet, amount)."""
    payload = {
        "manager_id": manager_id,
        "kind": kind,
        "outlet_id": outlet_id,
        "amount": str(amount),
        "issued_at": timezone.now().isoformat(),
        "nonce": uuid.uuid4().hex,
    }
    signer = TimestampSigner(salt=APPROVAL_TOKEN_SALT)
    token = signer.sign(json.dumps(payload))
    expires_at = (timezone.now() + timedelta(seconds=APPROVAL_TOKEN_TTL)).isoformat()
    return token, expires_at, payload


def _verify_approval_token(token, *, expected_kind, expected_outlet_id, required_amount):
    """
    Verify a signed approval token. Returns (ok: bool, payload: dict|None, reason: str).

    Anti-replay: if a cache backend is configured, mark the nonce as consumed
    for APPROVAL_NONCE_TTL seconds and reject duplicates. If no cache, skip
    replay protection (and log a warning).
    """
    signer = TimestampSigner(salt=APPROVAL_TOKEN_SALT)
    try:
        raw = signer.unsign(token, max_age=APPROVAL_TOKEN_TTL)
    except SignatureExpired:
        return False, None, "expired"
    except BadSignature:
        return False, None, "bad_signature"
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        return False, None, "bad_payload"

    if payload.get("kind") != expected_kind:
        return False, payload, "kind_mismatch"
    if int(payload.get("outlet_id") or 0) != int(expected_outlet_id or 0):
        return False, payload, "outlet_mismatch"
    try:
        approved_amount = Decimal(str(payload.get("amount") or 0))
    except Exception:
        return False, payload, "bad_amount"
    if Decimal(str(required_amount or 0)) > approved_amount:
        return False, payload, "amount_too_low"

    nonce = payload.get("nonce") or ""
    if _cache_available():
        nonce_key = f"pos:approval_nonce:{nonce}"
        # cache.add returns False if the key already exists → replay.
        if not cache.add(nonce_key, "1", APPROVAL_NONCE_TTL):
            return False, payload, "replayed"
    else:
        logger.warning("approval-token: cache unavailable, skipping replay protection")

    return True, payload, "ok"

from apps.items.models import (
    Item, ItemBarcode, StockMovement, ItemPriceHistory, ItemBatch, BatchMovement,
    ItemPackUnit, UnitOfMeasure,
)
from apps.items.barcode_parsing import parse_ean13_type2, parse_barcode
from apps.items.inventory import apply_movement, consume_fefo
from apps.items.pricing import set_prices
from apps.outlets.models import Outlet
from apps.accounts.models import User
from apps.uploads.models import AuditLog, PosSnapshot, Supplier
from apps.accounts.device_utils import touch_device, get_device_uuid

from .models import (
    Shift, Bill, BillLine, Payment, Customer, CustomerCreditTxn, Promotion,
    BillSequence, IdempotencyKey, DiscountPolicy,
    Coupon, CouponRedemption, GiftCard, GiftCardTxn,
    TaxComponent, CommissionRule,
    PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
)
from .credit import apply_credit
from .promotions import evaluate_promotions, apply_coupon
from .tax_engine import (
    get_active_components, compute_line_taxes, aggregate_bill_breakdown,
)
from .serializers import (
    ShiftSerializer, BillSerializer, PaymentSerializer,
    CreateBillInput, OpenShiftInput, CloseShiftInput,
    CustomerSerializer, PromotionSerializer, PromotionInput,
    CouponSerializer, CouponInput, GiftCardSerializer, GiftCardIssueInput,
    CommissionRuleSerializer,
)
from .commission import compute_bill_commissions
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
    base_unit_code = ""
    try:
        if it.base_unit_id:
            base_unit_code = it.base_unit.code if hasattr(it, "base_unit") and it.base_unit else ""
    except Exception:
        base_unit_code = ""
    pack_units = []
    try:
        for pu in it.pack_units.all().select_related("unit"):
            pack_units.append({
                "id": pu.id,
                "unit_code": pu.unit.code,
                "unit_name": pu.unit.name,
                "conversion_factor": str(pu.conversion_factor),
                "sell_price": str(pu.sell_price) if pu.sell_price is not None else None,
                "barcode": pu.barcode or "",
                "is_default": pu.is_default,
                "precision": pu.unit.precision,
            })
    except Exception:
        pack_units = []
    return {
        "id": it.id,
        "item_code": it.item_code,
        "item_name": it.item_name,
        "barcode": it.barcode,
        "selling_price": str(price),
        "tax_rate_pct": str(it.tax_rate_pct or 0),
        "on_hand": str(it.on_hand or 0),
        "base_unit_code": base_unit_code,
        "is_weighed": bool(getattr(it, "is_weighed", False)),
        "weighed_barcode_prefix": getattr(it, "weighed_barcode_prefix", "") or "",
        "pack_units": pack_units,
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

    # Pack-unit barcode hit (multi-unit; Phase 2 Agent 6).
    if not items:
        pu = (ItemPackUnit.objects.filter(barcode=q, item__outlet=outlet)
              .select_related("item").first())
        if pu:
            items = [pu.item]

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

    auto_qty = None
    auto_pack_unit_id = None

    # 1. Type-2 EAN-13 weighed barcode? Map by Item.weighed_barcode_prefix
    #    or Item.plu_code (Phase 2 Agent 6 alias).
    parsed = parse_barcode(code)
    weighed = None
    if parsed.get("kind") == "weighed":
        weighed = {"plu": parsed["plu_code"], "qty": parsed["weight_kg"]}
    item = None
    if weighed:
        item = (Item.objects.filter(outlet=outlet)
                .filter(Q(weighed_barcode_prefix=weighed["plu"]) | Q(plu_code=weighed["plu"]))
                .first())
        if item:
            auto_qty = str(weighed["qty"])

    # 2. Direct Item.barcode / ItemBarcode hit.
    if not item:
        item = (Item.objects.filter(outlet=outlet)
                .filter(Q(barcode=code) | Q(barcodes__barcode=code))
                .distinct().first())

    # 3. Pack-unit barcode → return underlying item with auto_pack_unit_id.
    if not item:
        pu = (ItemPackUnit.objects.filter(barcode=code, item__outlet=outlet)
              .select_related("item").first())
        if pu:
            item = pu.item
            auto_pack_unit_id = pu.id

    if not item:
        return Response({"detail": "Not found."}, status=404)

    p = PosSnapshot.objects.filter(outlet=outlet, item=item).order_by("-snapshot_date").first()
    payload = _serialize_item(item, p.selling_price if p else None)
    if auto_qty is not None:
        payload["auto_qty"] = auto_qty
        # Phase 2 Agent 6 — canonical scan-result fields. The frontend
        # auto-fills the cart row qty from `scanned_qty` and labels it with
        # `scanned_unit` (kg/L for weighed items).
        payload["scanned_qty"] = auto_qty
        try:
            base_code = (item.base_unit.code if item.base_unit_id else "") or ""
        except Exception:
            base_code = ""
        payload["scanned_unit"] = (base_code or "kg").lower() if base_code in ("KG", "L", "G", "ML") else "kg"
    if auto_pack_unit_id is not None:
        payload["auto_pack_unit_id"] = auto_pack_unit_id
    return Response(payload)


# -------------------------------------------------------------------
# Bill creation
# -------------------------------------------------------------------

def _next_bill_no(outlet):
    """
    Atomically allocate the next bill number for (outlet, today).

    MUST be called from inside a `transaction.atomic()` block — relies on
    select_for_update() row-locking on the BillSequence row to serialize
    concurrent cashiers without skipping or reusing numbers. The format
    `B{outlet:02d}{yymmdd}{seq:04d}` is preserved.
    """
    today = date.today().strftime("%y%m%d")
    prefix = f"B{outlet.id:02d}{today}"

    # Auto-create row if missing (get_or_create is itself a small txn but we're
    # already in transaction.atomic from create_bill, so the row exists by the
    # time we reach the SELECT FOR UPDATE below).
    BillSequence.objects.get_or_create(outlet=outlet, date_str=today)

    seq_row = (BillSequence.objects
               .select_for_update()
               .get(outlet=outlet, date_str=today))
    seq_row.counter = (seq_row.counter or 0) + 1
    seq_row.save(update_fields=["counter", "updated_at"])
    return f"{prefix}{seq_row.counter:04d}"


# -------------------------------------------------------------------
# Idempotency-Key decorator
# -------------------------------------------------------------------

IDEMPOTENCY_TTL_HOURS = 24


def _hash_body(raw_body):
    """sha256 of the raw request bytes (stable regardless of dict ordering)."""
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    return hashlib.sha256(raw_body or b"").hexdigest()


def idempotent(view_func):
    """
    Replay-safe POST decorator. Reads `Idempotency-Key` header; if absent,
    invokes the view normally. Otherwise:
      - hashes the request body (sha256)
      - looks up a live (<24h) IdempotencyKey for (key, user)
      - on hit + same hash → replays stored response
      - on hit + different hash → 409 conflict
      - on miss → calls view, persists response under the key
    """
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        key = request.META.get("HTTP_IDEMPOTENCY_KEY", "").strip()
        if not key:
            return view_func(request, *args, **kwargs)
        if len(key) > 80:
            return Response({"detail": "Idempotency-Key too long (max 80 chars)."}, status=400)

        body_hash = _hash_body(request.body)
        cutoff = timezone.now() - timedelta(hours=IDEMPOTENCY_TTL_HOURS)
        existing = (IdempotencyKey.objects
                    .filter(key=key, user=request.user, created_at__gte=cutoff)
                    .first())
        if existing:
            if existing.request_hash != body_hash:
                return Response(
                    {"detail": "Idempotency-Key reused with different payload."},
                    status=409,
                )
            return Response(existing.response_body, status=existing.response_status)

        # Miss — execute the view, then persist the response. The view itself
        # already opens transaction.atomic() for the bill insert; the key
        # row insert lives in its own brief txn so a 4xx response (which
        # shouldn't be cached against retries with a fixed payload) is still
        # captured for replay.
        response = view_func(request, *args, **kwargs)
        try:
            body = response.data if hasattr(response, "data") else None
            with transaction.atomic():
                IdempotencyKey.objects.create(
                    key=key,
                    user=request.user if request.user.is_authenticated else None,
                    endpoint=request.path[:120],
                    request_hash=body_hash,
                    response_status=response.status_code,
                    response_body=body if body is not None else {},
                )
        except Exception:
            # Don't fail the user request because we couldn't cache the key
            pass
        return response
    return _wrapped


# -------------------------------------------------------------------
# Discount policy
# -------------------------------------------------------------------

DEFAULT_DISCOUNT_POLICY = {
    "max_line_discount_pct": Decimal("10"),
    "max_bill_discount_pct": Decimal("10"),
    "max_bill_discount_amount": Decimal("5000"),
    "require_manager_pin_above_pct": Decimal("5"),
}


def _get_discount_policy(outlet, role):
    """
    Look up the policy row for (outlet, role) — fall back to a global
    (outlet=NULL, role) row, then to the hard-coded defaults.
    """
    pol = DiscountPolicy.objects.filter(outlet=outlet, role=role).first()
    if not pol:
        pol = DiscountPolicy.objects.filter(outlet__isnull=True, role=role).first()
    if pol:
        return {
            "max_line_discount_pct": pol.max_line_discount_pct,
            "max_bill_discount_pct": pol.max_bill_discount_pct,
            "max_bill_discount_amount": pol.max_bill_discount_amount,
            "require_manager_pin_above_pct": pol.require_manager_pin_above_pct,
            "source": "row",
        }
    return {**DEFAULT_DISCOUNT_POLICY, "source": "default"}


def _check_discount_against_policy(*, lines, bill_discount, subtotal, role, outlet):
    """
    Returns (ok: bool, breach: dict|None, limits: dict). Caller decides
    whether to bypass on a non-empty approval_token.
    """
    pol = _get_discount_policy(outlet, role)

    # Line-level cap: discount as a fraction of (qty*unit_price)
    for ln in lines:
        try:
            qty = Decimal(str(ln.get("qty") or 0))
            up = Decimal(str(ln.get("unit_price") or 0))
            disc = Decimal(str(ln.get("line_discount") or 0))
        except Exception:
            continue
        gross = qty * up
        if gross > 0 and disc > 0:
            pct = (disc / gross) * Decimal("100")
            if pct > pol["max_line_discount_pct"]:
                return False, {
                    "kind": "line",
                    "item_id": ln.get("item_id"),
                    "discount_pct": str(pct.quantize(Decimal("0.01"))),
                }, pol

    # Bill-level cap
    bill_disc = Decimal(bill_discount or 0)
    if bill_disc > 0:
        if bill_disc > pol["max_bill_discount_amount"]:
            return False, {
                "kind": "bill_amount",
                "amount": str(bill_disc),
            }, pol
        if subtotal and subtotal > 0:
            pct = (bill_disc / subtotal) * Decimal("100")
            if pct > pol["max_bill_discount_pct"]:
                return False, {
                    "kind": "bill_pct",
                    "discount_pct": str(pct.quantize(Decimal("0.01"))),
                }, pol
    return True, None, pol


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_manager_pin(request):
    """
    POST /api/pos/verify-manager-pin/

    Body:
      {
        "manager_username": "...",
        "pin": "1234",
        "context": {"outlet_id": 1, "kind": "discount", "amount": "500.00"}
      }

    On success: 200 {"approval_token": "<signed>", "expires_at": "<iso>"}
    On failure: 401 {"detail": "Invalid PIN", "attempts_left": N?}
    On lockout: 423 {"detail": "Locked. Try again later.", "retry_after": 60}
    """
    manager_username = (request.data.get("manager_username") or "").strip()
    pin = str(request.data.get("pin") or "").strip()
    ctx = request.data.get("context") or {}
    kind = (ctx.get("kind") or "").strip()
    outlet_id = ctx.get("outlet_id")
    amount = ctx.get("amount") or "0"

    if not manager_username or not pin:
        return Response({"detail": "manager_username and pin are required."}, status=400)
    if kind != "discount":
        return Response({"detail": "Unsupported context.kind"}, status=400)
    if not outlet_id:
        return Response({"detail": "context.outlet_id is required."}, status=400)

    # Rate-limit: per (username, ip), 5 fails → lock for 60s.
    ip = (request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
          or request.META.get("REMOTE_ADDR") or "")[:64]
    cache_ok = _cache_available()
    fail_key = f"pos:pinfail:{manager_username}:{ip}"
    lock_key = f"pos:pinlock:{manager_username}:{ip}"

    if cache_ok and cache.get(lock_key):
        return Response(
            {"detail": "Too many attempts. Try again later.", "retry_after": PIN_LOCKOUT_SECONDS},
            status=423,
        )
    if not cache_ok:
        logger.warning("verify_manager_pin: cache unavailable, rate-limit disabled")

    manager = User.objects.filter(username__iexact=manager_username, is_active=True).first()
    allowed_roles = (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN)
    valid = bool(
        manager
        and manager.role in allowed_roles
        and manager.check_manager_pin(pin)
    )

    if not valid:
        attempts_left = None
        if cache_ok:
            try:
                fails = cache.incr(fail_key)
            except ValueError:
                cache.set(fail_key, 1, PIN_LOCKOUT_SECONDS * 2)
                fails = 1
            attempts_left = max(0, PIN_LOCKOUT_THRESHOLD - fails)
            if fails >= PIN_LOCKOUT_THRESHOLD:
                cache.set(lock_key, "1", PIN_LOCKOUT_SECONDS)
                cache.delete(fail_key)
        AuditLog.objects.create(
            user=request.user if request.user.is_authenticated else None,
            action="pos.manager_pin_verify",
            entity_type="user",
            entity_id=str(manager.id) if manager else "",
            details={
                "success": False,
                "manager_username": manager_username,
                "context": {"kind": kind, "outlet_id": outlet_id, "amount": str(amount)},
                "ip": ip,
            },
        )
        body = {"detail": "Invalid PIN"}
        if attempts_left is not None:
            body["attempts_left"] = attempts_left
        return Response(body, status=401)

    # Success — clear fail counter.
    if cache_ok:
        cache.delete(fail_key)

    token, expires_at, payload = _issue_approval_token(
        manager_id=manager.id,
        kind="discount",
        outlet_id=int(outlet_id),
        amount=amount,
    )
    AuditLog.objects.create(
        user=request.user if request.user.is_authenticated else None,
        action="pos.manager_pin_verify",
        entity_type="user",
        entity_id=str(manager.id),
        details={
            "success": True,
            "manager_id": manager.id,
            "manager_username": manager.username,
            "context": {"kind": kind, "outlet_id": int(outlet_id), "amount": str(amount)},
            "nonce": payload["nonce"],
            "ip": ip,
        },
    )
    return Response({"approval_token": token, "expires_at": expires_at})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def effective_discount_policy(request):
    """
    GET /api/pos/discount-policies/effective/?outlet=<id>
    Returns the policy resolved for (outlet, current user's role).
    """
    outlet_id = request.query_params.get("outlet")
    if outlet_id:
        outlet = Outlet.objects.filter(pk=outlet_id).first()
    else:
        outlet = request.user.outlet
    if not outlet:
        return Response({"detail": "outlet required."}, status=400)
    pol = _get_discount_policy(outlet, request.user.role)
    return Response({
        "outlet_id": outlet.id,
        "role": request.user.role,
        "max_line_discount_pct": str(pol["max_line_discount_pct"]),
        "max_bill_discount_pct": str(pol["max_bill_discount_pct"]),
        "max_bill_discount_amount": str(pol["max_bill_discount_amount"]),
        "require_manager_pin_above_pct": str(pol["require_manager_pin_above_pct"]),
        "source": pol.get("source", "default"),
    })


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
@idempotent
def create_bill(request):
    """
    Atomically close a cart into a Bill + BillLines + Payments.
    Body:
      {
        "lines": [{ "item_id":1, "qty":"2", "unit_price":"100", "line_discount":"0", "tax_rate_pct":"0" }, ...],
        "payments": [{ "tender":"cash", "amount":"200", "reference":"" }, ...],
        "bill_discount": "0",
        "customer_name": "", "customer_phone": "",
        "kind": "sale" | "return", "returns_bill_id": null,
        "approval_token": "..."   # optional — required when discounts exceed policy caps
      }

    Headers:
      Idempotency-Key: <client-generated unique string>   # optional but
        recommended; replays the cached response for 24h on retry.
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

    # ---- Discount policy enforcement (server-side cap) ----
    # Compute a preview subtotal (qty*unit_price - line_discount) so we can
    # evaluate the bill_discount as a percentage. This duplicates a small
    # amount of math from the txn block below but keeps the policy check
    # purely read-only.
    raw_lines = list(request.data.get("lines") or [])
    preview_subtotal = Decimal("0")
    for ln in raw_lines:
        try:
            qty = Decimal(str(ln.get("qty") or 0))
            up = Decimal(str(ln.get("unit_price") or 0))
            ld = Decimal(str(ln.get("line_discount") or 0))
        except Exception:
            continue
        preview_subtotal += (qty * up) - ld
    bill_discount_raw = Decimal(str(request.data.get("bill_discount") or 0))
    approval_token = (request.data.get("approval_token") or "").strip()

    ok, breach, limits = _check_discount_against_policy(
        lines=raw_lines, bill_discount=bill_discount_raw,
        subtotal=preview_subtotal, role=request.user.role, outlet=outlet,
    )
    if not ok and not approval_token:
        return Response({
            "detail": "Discount exceeds policy cap; manager approval required.",
            "code": "DISCOUNT_REQUIRES_APPROVAL",
            "breach": breach,
            "limits": {
                "max_line_discount_pct": str(limits["max_line_discount_pct"]),
                "max_bill_discount_pct": str(limits["max_bill_discount_pct"]),
                "max_bill_discount_amount": str(limits["max_bill_discount_amount"]),
                "require_manager_pin_above_pct": str(limits["require_manager_pin_above_pct"]),
            },
        }, status=403)
    if not ok and approval_token:
        # Verify the signed manager-approval token (Phase 1 Agent 4).
        valid, payload, reason = _verify_approval_token(
            approval_token,
            expected_kind="discount",
            expected_outlet_id=outlet.id,
            required_amount=bill_discount_raw,
        )
        if not valid:
            return Response({
                "detail": "Invalid or expired manager approval",
                "code": "APPROVAL_TOKEN_INVALID",
                "reason": reason,
            }, status=403)
        _audit(request.user, "pos.discount_approved_by_manager", None, {
            "manager_id": payload.get("manager_id"),
            "breach": breach,
            "subtotal": str(preview_subtotal),
            "bill_discount": str(bill_discount_raw),
            "nonce": payload.get("nonce"),
        })

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

    # Phase 3 Agent 10 — resolve bill-level sales rep.
    bill_sales_rep = None
    bill_rep_id = v.get("sales_rep_id")
    if bill_rep_id:
        bill_sales_rep = User.objects.filter(pk=bill_rep_id, is_active=True).first()
        if not bill_sales_rep:
            return Response({"detail": f"Invalid sales_rep_id {bill_rep_id}."}, status=400)

    with transaction.atomic():
        bill = Bill.objects.create(
            shift=shift, outlet=outlet, cashier=request.user,
            sales_rep=bill_sales_rep,
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

        # Phase 3 Agent 8 — multi-component tax engine (opt-in).
        # When any active TaxComponent rows exist for this outlet (or are
        # chain-wide), we compute taxes via the engine; the legacy
        # `tax_rate_pct` path is used only when none exist.
        tax_components = get_active_components(outlet)
        use_tax_engine = bool(tax_components)
        customer_tax_exempt = bool(customer and getattr(customer, "tax_exempt", False))
        # Per-line engine results for later aggregation onto Bill.tax_breakdown.
        line_tax_results = []

        for ln in v["lines"]:
            item = items[ln["item_id"]]
            pack_unit_id = ln.get("pack_unit_id")
            qty_in_unit = ln.get("qty_in_unit")
            simple_unit_kind = (ln.get("unit_kind") or "base")

            pack_snapshot = {}
            pack_unit = None
            line_unit_kind = "base"
            line_pack_size_at_sale = Decimal("0")
            if pack_unit_id:
                pack_unit = (ItemPackUnit.objects
                             .filter(pk=pack_unit_id, item=item)
                             .select_related("unit").first())
                if not pack_unit:
                    transaction.set_rollback(True)
                    return Response({
                        "detail": f"pack_unit_id {pack_unit_id} not valid for item {item.item_code}.",
                    }, status=400)

            if pack_unit is not None:
                # Quantity entered in the pack unit; convert to base units.
                if qty_in_unit is None:
                    qty_in_unit = ln["qty"]
                qty_in_unit_dec = _qty(qty_in_unit)
                conv = pack_unit.conversion_factor or Decimal("1")
                qty = _qty(qty_in_unit_dec * conv)
                # Per-pack price → per-base-unit price (so existing reports
                # which multiply qty * unit_price stay consistent).
                if pack_unit.sell_price is not None:
                    unit_price_in_unit = _money(pack_unit.sell_price)
                else:
                    base_price = _money(ln.get("unit_price") or item.sell_price or 0)
                    unit_price_in_unit = _money(base_price * conv)
                unit_price = (_money(unit_price_in_unit / conv) if conv else _money(0))
                pack_snapshot = {
                    "unit_code": pack_unit.unit.code,
                    "conversion_factor": str(conv),
                    "qty_in_unit": str(qty_in_unit_dec),
                    "unit_price_in_unit": str(unit_price_in_unit),
                }
                line_unit_kind = "pack"
                line_pack_size_at_sale = conv
            elif simple_unit_kind == "pack" and (item.pack_size or Decimal("0")) > 0:
                # Phase 2 Agent 6 simple-pack path. Treat ln["qty"] as a
                # pack count; canonicalize to base units using Item.pack_size.
                pack_count = _qty(ln["qty"])
                pack_size = Decimal(item.pack_size or 0)
                qty = _qty(pack_count * pack_size)
                # Pack price: explicit override if set, else sell_price * pack_size.
                if (item.pack_sell_price or Decimal("0")) > 0:
                    pack_price = _money(item.pack_sell_price)
                else:
                    base_price = _money(ln.get("unit_price") or item.sell_price or 0)
                    pack_price = _money(base_price * pack_size)
                # Store unit_price as per-base-unit so qty * unit_price math
                # downstream remains correct.
                unit_price = (_money(pack_price / pack_size) if pack_size else _money(0))
                pack_snapshot = {
                    "unit_code": (item.pack_unit.code if item.pack_unit_id else "PK"),
                    "conversion_factor": str(pack_size),
                    "qty_in_unit": str(pack_count),
                    "unit_price_in_unit": str(pack_price),
                }
                line_unit_kind = "pack"
                line_pack_size_at_sale = pack_size
            else:
                qty = _qty(ln["qty"])
                unit_price = _money(ln.get("unit_price") or 0)
                if unit_price == 0:
                    snap = PosSnapshot.objects.filter(outlet=outlet, item=item).order_by("-snapshot_date").first()
                    unit_price = _money(snap.selling_price if snap and snap.selling_price else 0)

            line_disc = _money(ln.get("line_discount") or 0)
            tax_pct = Decimal(ln.get("tax_rate_pct") or 0)
            gross = (qty * unit_price) - line_disc

            if use_tax_engine:
                # New multi-component engine. tax_pct on the line is ignored;
                # `tax_rate_pct` stays on BillLine for backward compat (we set
                # it to the sum of applicable rates as an approximation).
                tr = compute_line_taxes(
                    gross=gross,
                    item_category=getattr(item, "category", "") or "",
                    components=tax_components,
                    customer_tax_exempt=customer_tax_exempt,
                )
                tax_amt = tr["tax_amount"]
                line_tax_results.append(tr)
                # Sum of rate_pct for the legacy column (informational only).
                try:
                    tax_pct = sum(
                        (Decimal(c["rate_pct"]) for c in tr["components"]),
                        Decimal("0"),
                    )
                except Exception:
                    tax_pct = Decimal("0")
            else:
                tax_amt = _money(gross * tax_pct / Decimal("100"))
                # Track an empty per-line result so aggregation length matches
                # bill.lines order if ever needed.
                line_tax_results.append({"components": [], "tax_amount": tax_amt})

            line_total = _money(gross + tax_amt) * sign

            # Snapshot unit cost at sale time for profit reporting
            unit_cost = item.cost_price or Decimal("0")
            line_rep_id = ln.get("sales_rep_id")
            line_rep = None
            if line_rep_id:
                line_rep = User.objects.filter(pk=line_rep_id, is_active=True).first()
            BillLine.objects.create(
                bill=bill, item=item,
                item_code=item.item_code, item_name=item.item_name,
                qty=qty * sign, unit_price=unit_price, unit_cost=unit_cost,
                line_discount=line_disc, tax_rate_pct=tax_pct,
                tax_amount=tax_amt * sign, line_total=line_total,
                note=ln.get("note", ""),
                pack_unit_snapshot=pack_snapshot,
                unit_kind=line_unit_kind,
                pack_size_at_sale=line_pack_size_at_sale,
                sales_rep=line_rep,
            )
            subtotal += gross * sign
            tax_total += tax_amt * sign

        # ---- Promotion engine + coupon (sales only) ----
        coupon_redemption_info = None
        promo_extra_bill_disc = Decimal("0")
        if kind == Bill.Kind.SALE:
            # Build line-snapshot list for engine (mirrors order of bill.lines)
            lines_snapshot = []
            bill_lines = list(bill.lines.all().select_related("item"))
            for bl in bill_lines:
                lines_snapshot.append({
                    "item_id": bl.item_id,
                    "qty": bl.qty,
                    "unit_price": bl.unit_price,
                    "line_total": bl.line_total,
                    "category": getattr(bl.item, "category", "") or "",
                })

            promo_ids = v.get("promotion_ids") or []
            if promo_ids:
                try:
                    plan = evaluate_promotions(
                        outlet=outlet, lines=lines_snapshot,
                        bill_subtotal=subtotal, customer=customer,
                        promotion_ids=promo_ids,
                    )
                    # Apply per-line discounts
                    for idx, extra in (plan.get("line_discounts") or {}).items():
                        if idx < 0 or idx >= len(bill_lines):
                            continue
                        bl = bill_lines[idx]
                        extra = _money(extra)
                        if extra <= 0:
                            continue
                        bl.line_discount = (bl.line_discount or Decimal("0")) + extra
                        # recompute tax + line_total
                        gross_l = (bl.qty * bl.unit_price) - bl.line_discount
                        if use_tax_engine:
                            tr = compute_line_taxes(
                                gross=gross_l,
                                item_category=getattr(bl.item, "category", "") or "",
                                components=tax_components,
                                customer_tax_exempt=customer_tax_exempt,
                            )
                            new_tax = tr["tax_amount"]
                            if idx < len(line_tax_results):
                                line_tax_results[idx] = tr
                        else:
                            new_tax = _money(gross_l * bl.tax_rate_pct / Decimal("100"))
                        bl.tax_amount = new_tax
                        bl.line_total = _money(gross_l + new_tax)
                        bl.save(update_fields=["line_discount", "tax_amount", "line_total"])
                        subtotal -= extra
                        # tax_total adjustment (delta)
                        # Recompute global tax_total from scratch later? Simpler:
                        # adjust by old vs new tax. Skipped: tax_total adjustment
                        # lumped via post-loop recalculation below.
                    # Recompute tax_total from current bill lines (cheap, accurate)
                    tax_total = sum((bl.tax_amount for bl in bill_lines), Decimal("0"))
                    # Free lines (BOGO etc.)
                    for fl in (plan.get("free_lines") or []):
                        try:
                            free_item = Item.objects.get(pk=fl["item_id"])
                        except Item.DoesNotExist:
                            continue
                        BillLine.objects.create(
                            bill=bill, item=free_item,
                            item_code=free_item.item_code, item_name=free_item.item_name,
                            qty=Decimal(str(fl["qty"])),
                            unit_price=Decimal("0"),
                            unit_cost=free_item.cost_price or Decimal("0"),
                            line_discount=Decimal("0"), tax_rate_pct=Decimal("0"),
                            tax_amount=Decimal("0"), line_total=Decimal("0"),
                            note=f"FREE ({fl.get('reason','promo')})",
                        )
                    promo_extra_bill_disc = _money(plan.get("bill_discount_added") or 0)
                except Exception:
                    logger.exception("Promotion engine failed for bill %s", bill.bill_no)

            # Coupon
            coupon_code = (v.get("coupon_code") or "").strip()
            if coupon_code:
                try:
                    res = apply_coupon(
                        code=coupon_code, customer=customer,
                        bill_subtotal=subtotal - promo_extra_bill_disc,
                    )
                    coupon_redemption_info = res
                except ValueError as e:
                    transaction.set_rollback(True)
                    return Response({"detail": str(e), "code": "COUPON_INVALID"}, status=400)

        bill_discount = _money(v.get("bill_discount") or 0) * sign
        # Augment with promo + coupon (SALE only)
        bill_discount = bill_discount + promo_extra_bill_disc * sign
        if coupon_redemption_info:
            bill_discount = bill_discount + coupon_redemption_info["discount"] * sign
        grand_total = _money(subtotal - bill_discount + tax_total)

        paid_total = Decimal("0")
        gift_card_redemptions = []   # list of (giftcard, signed_amount)
        for p in v["payments"]:
            amt = _money(p["amount"]) * sign
            tender = p["tender"]
            ref = p.get("reference", "")
            if tender == Payment.Tender.GIFT_CARD:
                serial = (ref or "").strip()
                if not serial:
                    transaction.set_rollback(True)
                    return Response({"detail": "Gift card payment requires serial in `reference`."}, status=400)
                try:
                    gc = GiftCard.objects.select_for_update().get(serial=serial, outlet=outlet)
                except GiftCard.DoesNotExist:
                    transaction.set_rollback(True)
                    return Response({"detail": f"Gift card {serial} not found."}, status=400)
                if gc.status != GiftCard.Status.ACTIVE:
                    transaction.set_rollback(True)
                    return Response({"detail": f"Gift card {serial} is not active."}, status=400)
                if gc.expires_at and gc.expires_at < timezone.now().date():
                    transaction.set_rollback(True)
                    return Response({"detail": f"Gift card {serial} has expired."}, status=400)
                # SALE: amt > 0, deduct.  RETURN: amt < 0, refund onto card.
                redeem_qty = abs(amt)
                if kind == Bill.Kind.SALE and gc.current_balance < redeem_qty:
                    transaction.set_rollback(True)
                    return Response({
                        "detail": f"Gift card {serial} balance ({gc.current_balance}) < {redeem_qty}.",
                    }, status=400)
                if kind == Bill.Kind.SALE:
                    gc.current_balance = gc.current_balance - redeem_qty
                else:
                    gc.current_balance = gc.current_balance + redeem_qty
                if gc.current_balance <= 0 and kind == Bill.Kind.SALE:
                    gc.status = GiftCard.Status.REDEEMED
                gc.save(update_fields=["current_balance", "status"])
                gift_card_redemptions.append((gc, amt))
            Payment.objects.create(
                bill=bill, tender=tender, amount=amt, reference=ref,
            )
            paid_total += amt
        # Write gift-card txn ledger rows now that bill is being saved
        for gc, amt in gift_card_redemptions:
            GiftCardTxn.objects.create(
                card=gc,
                amount=-abs(amt) if kind == Bill.Kind.SALE else abs(amt),
                balance_after=gc.current_balance,
                kind=GiftCardTxn.Kind.REDEEM,
                bill=bill,
                created_by=request.user if request.user.is_authenticated else None,
                note=f"{bill.bill_no}",
            )

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
        # Stash returns_bill line lookup so we can mirror batches on RETURN
        return_line_map = {}
        if kind == Bill.Kind.RETURN_ and returns_bill:
            for orig in returns_bill.lines.all():
                return_line_map.setdefault(orig.item_id, []).append(orig)

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

            # ---- Batch / FEFO tracking ----
            try:
                if kind == Bill.Kind.SALE:
                    # Only attempt FEFO if any batched stock exists for this item
                    has_batches = ItemBatch.objects.filter(
                        item=ln.item, is_active=True, qty__gt=0,
                    ).exists()
                    if has_batches:
                        try:
                            consumed = consume_fefo(
                                item=ln.item, qty=ln.qty,
                                user=request.user,
                                ref_type="Bill", ref_id=bill.id,
                            )
                            ln.batches_consumed = [
                                {"batch_id": b.id, "batch_no": b.batch_no, "qty": str(q)}
                                for (b, q) in consumed
                            ]
                            ln.save(update_fields=["batches_consumed"])
                        except ValueError as e:
                            logger.warning(
                                "FEFO insufficient for item %s on bill %s: %s",
                                ln.item_id, bill.bill_no, e,
                            )
                elif kind == Bill.Kind.RETURN_:
                    # Mirror return qty against the source bill's batches
                    return_qty = -ln.qty   # ln.qty is negative for returns
                    matched = []
                    candidates = return_line_map.get(ln.item_id, [])
                    if candidates:
                        # Pull source batches in order; restore qty back proportionally
                        remaining = return_qty
                        for orig in candidates:
                            for entry in (orig.batches_consumed or []):
                                if remaining <= 0:
                                    break
                                try:
                                    bid = entry.get("batch_id")
                                    src_qty = Decimal(str(entry.get("qty") or 0))
                                except Exception:
                                    continue
                                give = min(src_qty, remaining)
                                if give <= 0:
                                    continue
                                try:
                                    b = ItemBatch.objects.select_for_update().get(pk=bid)
                                except ItemBatch.DoesNotExist:
                                    continue
                                b.qty = (b.qty or Decimal("0")) + give
                                b.save(update_fields=["qty", "updated_at"])
                                BatchMovement.objects.create(
                                    batch=b, qty_change=give,
                                    balance_after=b.qty, kind="return",
                                    ref_type="Bill", ref_id=str(bill.id),
                                    created_by=request.user if request.user.is_authenticated else None,
                                )
                                matched.append({"batch_id": b.id, "batch_no": b.batch_no, "qty": str(give)})
                                remaining -= give
                            if remaining <= 0:
                                break
                        if remaining > 0:
                            # Shortfall: create an untracked-return batch
                            b = ItemBatch.objects.create(
                                item=ln.item,
                                batch_no=f"RTN-{bill.bill_no}-{ln.item.item_code}"[:80],
                                qty=remaining, received_qty=remaining,
                                cost_price=ln.unit_cost or Decimal("0"),
                                grn_ref=f"RTN-{bill.bill_no}",
                                received_at=timezone.now().date(),
                                note="Auto-created on return (source batch not found)",
                            )
                            BatchMovement.objects.create(
                                batch=b, qty_change=remaining,
                                balance_after=b.qty, kind="return",
                                ref_type="Bill", ref_id=str(bill.id),
                                created_by=request.user if request.user.is_authenticated else None,
                            )
                            matched.append({"batch_id": b.id, "batch_no": b.batch_no, "qty": str(remaining)})
                    if matched:
                        ln.batches_consumed = matched
                        ln.save(update_fields=["batches_consumed"])
            except Exception:
                logger.exception("Batch tracking failed for bill %s line %s", bill.bill_no, ln.id)

        bill.subtotal = _money(subtotal)
        bill.bill_discount = bill_discount
        bill.tax_total = _money(tax_total)
        # Phase 3 Agent 8 — store per-component breakdown when engine active.
        if use_tax_engine:
            bill.tax_breakdown = aggregate_bill_breakdown(line_tax_results)
        else:
            bill.tax_breakdown = []
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

        # Coupon redemption ledger
        if coupon_redemption_info:
            coupon_obj = coupon_redemption_info["coupon"]
            CouponRedemption.objects.create(
                coupon=coupon_obj, bill=bill, customer=customer,
                discount_applied=coupon_redemption_info["discount"],
            )
            Coupon.objects.filter(pk=coupon_obj.pk).update(usage_count=F("usage_count") + 1)

        pack_units_used = [
            ln.get("pack_unit_id") for ln in v["lines"] if ln.get("pack_unit_id")
        ]
        _audit(request.user, "pos.bill_create", bill, {
            "bill_no": bill.bill_no,
            "grand_total": str(bill.grand_total),
            "line_count": len(v["lines"]),
            "kind": kind,
            "customer_id": customer.id if customer else None,
            "promotion_ids": promo_ids,
            "pack_units_used": pack_units_used,
        })

        # Phase 4 Agent 13 — fire SMS receipt after the bill commits. Best-effort.
        # Runs async if Celery is installed (send_sms_for_bill is a shared_task);
        # otherwise runs synchronously on commit. Either way, errors are
        # swallowed inside send_sms_for_bill so the bill is never affected.
        if bill.status == Bill.Status.CLOSED and (bill.customer_phone or (customer and customer.phone)):
            from .sms import send_sms_for_bill as _send_sms
            _bill_id = bill.id
            def _enqueue_sms():
                try:
                    delay = getattr(_send_sms, "delay", None)
                    if callable(delay):
                        delay(_bill_id)
                    else:
                        _send_sms(_bill_id)
                except Exception:
                    logger.exception("SMS dispatch failed for bill %s", _bill_id)
            transaction.on_commit(_enqueue_sms)

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
                # Restore batch qty for any batches we consumed on this line
                for entry in (ln.batches_consumed or []):
                    try:
                        bid = entry.get("batch_id")
                        bq = Decimal(str(entry.get("qty") or 0))
                    except Exception:
                        continue
                    if not bid or bq <= 0:
                        continue
                    try:
                        b = ItemBatch.objects.select_for_update().get(pk=bid)
                    except ItemBatch.DoesNotExist:
                        continue
                    b.qty = (b.qty or Decimal("0")) + bq
                    b.save(update_fields=["qty", "updated_at"])
                    BatchMovement.objects.create(
                        batch=b, qty_change=bq, balance_after=b.qty,
                        kind="void", ref_type="Bill", ref_id=str(bill.id),
                        created_by=request.user if request.user.is_authenticated else None,
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

        # Reverse gift-card redemptions
        if bill.status == Bill.Status.CLOSED:
            for p in bill.payments.filter(tender=Payment.Tender.GIFT_CARD):
                serial = (p.reference or "").strip()
                if not serial:
                    continue
                try:
                    gc = GiftCard.objects.select_for_update().get(serial=serial, outlet=bill.outlet)
                except GiftCard.DoesNotExist:
                    continue
                # p.amount was deducted on sale (positive) — restore
                restore = abs(p.amount)
                gc.current_balance = (gc.current_balance or Decimal("0")) + restore
                if gc.status == GiftCard.Status.REDEEMED and gc.current_balance > 0:
                    gc.status = GiftCard.Status.ACTIVE
                gc.save(update_fields=["current_balance", "status"])
                GiftCardTxn.objects.create(
                    card=gc, amount=restore, balance_after=gc.current_balance,
                    kind=GiftCardTxn.Kind.VOID, bill=bill,
                    created_by=request.user if request.user.is_authenticated else None,
                    note=f"VOID {bill.bill_no}",
                )

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

    # Phase 4 Agent 12 — optional PO linkage. When `purchase_order_id` is
    # passed, lock the PO + each PO line and validate (outlet match, item
    # match, status open/partial). After saving lines we update qty_received
    # and recompute the PO status.
    purchase_order_id = request.data.get("purchase_order_id")
    po = None
    po_line_map = {}        # po_line_id -> PurchaseOrderLine
    grn_line_links = {}     # index in `lines` -> po_line_id (only if linked)

    created_movements = []
    price_changes = []
    grn_ref = f"GRN-{invoice_no or timezone.now().strftime('%Y%m%d%H%M%S%f')}"
    supplier_label = f"{supplier_code} {supplier_name}".strip() or "—"
    with transaction.atomic():
        if purchase_order_id:
            try:
                po = (PurchaseOrder.objects
                      .select_for_update()
                      .get(pk=purchase_order_id))
            except PurchaseOrder.DoesNotExist:
                transaction.set_rollback(True)
                return Response({"detail": f"Purchase order {purchase_order_id} not found."}, status=400)
            if po.outlet_id != outlet.id:
                transaction.set_rollback(True)
                return Response({"detail": "PO outlet mismatch."}, status=400)
            if po.status not in (PurchaseOrder.Status.OPEN, PurchaseOrder.Status.PARTIAL):
                transaction.set_rollback(True)
                return Response({
                    "detail": f"PO is not receivable (status={po.status}).",
                }, status=400)
            for idx, l in enumerate(lines):
                pol_id = l.get("po_line_id")
                if not pol_id:
                    continue
                if pol_id in po_line_map:
                    pol = po_line_map[pol_id]
                else:
                    try:
                        pol = (PurchaseOrderLine.objects
                               .select_for_update()
                               .get(pk=pol_id, po=po))
                    except PurchaseOrderLine.DoesNotExist:
                        transaction.set_rollback(True)
                        return Response({"detail": f"PO line {pol_id} not found on PO."}, status=400)
                    po_line_map[pol_id] = pol
                if pol.item_id != int(l.get("item_id") or 0):
                    transaction.set_rollback(True)
                    return Response({
                        "detail": f"GRN line item does not match PO line {pol_id}.",
                    }, status=400)
                grn_line_links[idx] = pol_id

        for idx, l in enumerate(lines):
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

            # Optional batch tracking — if batch_no is supplied, upsert ItemBatch.
            batch_no = (l.get("batch_no") or "").strip()
            expiry_raw = l.get("expiry_date") or None
            expiry_d = None
            if expiry_raw:
                try:
                    expiry_d = datetime.strptime(str(expiry_raw)[:10], "%Y-%m-%d").date()
                except Exception:
                    expiry_d = None
            recv_d = None
            if received_raw:
                try:
                    recv_d = datetime.strptime(str(received_raw)[:10], "%Y-%m-%d").date()
                except Exception:
                    recv_d = None
            if batch_no:
                try:
                    batch = ItemBatch.objects.select_for_update().get(item=item, batch_no=batch_no)
                    batch.qty = (batch.qty or Decimal("0")) + qty
                    batch.received_qty = (batch.received_qty or Decimal("0")) + qty
                    if expiry_d:
                        batch.expiry_date = expiry_d
                    if cost is not None:
                        batch.cost_price = cost
                    if supplier:
                        batch.supplier = supplier
                    batch.grn_ref = grn_ref
                    if recv_d:
                        batch.received_at = recv_d
                    batch.is_active = True
                    batch.save()
                except ItemBatch.DoesNotExist:
                    batch = ItemBatch.objects.create(
                        item=item, batch_no=batch_no,
                        expiry_date=expiry_d,
                        qty=qty, received_qty=qty,
                        cost_price=cost or Decimal("0"),
                        supplier=supplier,
                        grn_ref=grn_ref,
                        received_at=recv_d,
                        is_active=True,
                    )
                BatchMovement.objects.create(
                    batch=batch, qty_change=qty, balance_after=batch.qty,
                    kind="grn", ref_type="GRN", ref_id=grn_ref,
                    created_by=request.user if request.user.is_authenticated else None,
                )

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

        # Phase 4 Agent 12 — persist a GoodsReceipt header + lines and (when
        # linked to a PO) update qty_received + recompute PO status.
        recv_date = None
        if received_raw:
            try:
                recv_date = datetime.strptime(str(received_raw)[:10], "%Y-%m-%d").date()
            except Exception:
                recv_date = None
        if recv_date is None:
            recv_date = timezone.now().date()

        grn_header = GoodsReceipt.objects.create(
            outlet=outlet,
            supplier=supplier,
            supplier_name=supplier_name or "",
            grn_ref=grn_ref,
            invoice_no=invoice_no or "",
            received_on=recv_date,
            purchase_order=po,
            sub_total=grn_total,
            tax_total=Decimal("0"),
            grand_total=grn_total,
            note=note_base or "",
            created_by=request.user if request.user.is_authenticated else None,
        )
        po_status_before = po.status if po else None
        for idx, l in enumerate(lines):
            try:
                qv = Decimal(str(l.get("qty") or 0))
            except Exception:
                qv = Decimal("0")
            cv = Decimal(str(l.get("cost_price") or 0)) if l.get("cost_price") not in (None, "") else Decimal("0")
            ed = None
            if l.get("expiry_date"):
                try:
                    ed = datetime.strptime(str(l["expiry_date"])[:10], "%Y-%m-%d").date()
                except Exception:
                    ed = None
            it = items[l["item_id"]]
            pol = po_line_map.get(grn_line_links.get(idx)) if grn_line_links else None
            GoodsReceiptLine.objects.create(
                grn=grn_header, po_line=pol, item=it,
                item_code=it.item_code, item_name=it.item_name,
                qty=qv, unit_cost=cv,
                batch_no=(l.get("batch_no") or "").strip()[:80],
                expiry_date=ed,
            )
            if pol is not None:
                pol.qty_received = (pol.qty_received or Decimal("0")) + qv
                pol.save(update_fields=["qty_received"])

        if po is not None:
            # Refresh from DB after saving lines.
            all_lines = list(po.lines.all())
            any_received = any((pl.qty_received or Decimal("0")) > 0 for pl in all_lines)
            all_full = all(
                (pl.qty_received or Decimal("0")) >= (pl.qty_ordered or Decimal("0"))
                for pl in all_lines
            )
            if all_full:
                po.status = PurchaseOrder.Status.CLOSED
            elif any_received:
                po.status = PurchaseOrder.Status.PARTIAL
            # else stays OPEN
            po.save(update_fields=["status", "updated_at"])

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

        batch_info = [
            {"item_id": l.get("item_id"), "batch_no": (l.get("batch_no") or "").strip(),
             "expiry_date": l.get("expiry_date") or None}
            for l in lines if (l.get("batch_no") or "").strip()
        ]
        _audit(request.user, "pos.grn_entry", supplier, {
            "ref": grn_ref,
            "batches": batch_info,
            "supplier_id": supplier.id if supplier else None,
            "supplier_code": supplier_code,
            "supplier_name": supplier_name,
            "invoice": invoice_no,
            "line_count": len(lines),
            "movements": created_movements,
            "price_changes": price_changes,
            "payable_delta": str(grn_total),
            "received_date": received_raw,
            "grn_id": grn_header.id,
            "po_id": po.id if po else None,
            "po_status_before": po_status_before,
            "po_status_after": po.status if po else None,
        })
    return Response({
        "ref": grn_ref,
        "grn_id": grn_header.id,
        "supplier_id": supplier.id if supplier else None,
        "supplier_code": supplier_code,
        "supplier_name": supplier_name,
        "movements_created": len(created_movements),
        "price_changes": len(price_changes),
        "purchase_order_id": po.id if po else None,
        "po_status": po.status if po else None,
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
    data = dict(ser.validated_data)
    combo_items = data.pop("combo_items", None) or []
    promo = Promotion.objects.create(outlet=outlet, created_by=request.user, **data)
    if combo_items:
        promo.combo_items.set(combo_items)
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


# -------------------------------------------------------------------
# X-report (read-only mid-shift summary; does NOT close the shift)
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanViewPosReports])
def shift_x_report(request, shift_id):
    """
    Mid-shift X-report. Same JSON shape as the Z-report (close-of-shift) but
    DOES NOT close the shift. Cashiers can pull this any time during their
    session to reconcile the till.
    """
    from .views_sme import shift_z_report as _z   # reuse Z aggregation
    # Z-report is itself read-only — it doesn't actually close the shift —
    # so we delegate and just relabel the call site for AuditLog clarity.
    shift = get_object_or_404(
        Shift.objects.select_related("outlet", "opened_by", "closed_by"), pk=shift_id,
    )
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

    from .models import Expense   # local import to avoid cycle
    expenses = Expense.objects.filter(shift=shift).aggregate(s=Sum("amount"))["s"] or Decimal("0")
    cash_sales = tender_map.get("cash") or Decimal("0")
    expected_cash = (shift.opening_cash or Decimal("0")) + cash_sales - expenses

    _audit(request.user, "pos.shift_x_report", shift, {"bill_count": bill_count})
    return Response({
        "report_kind": "X",
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
# Discount policies (admin CRUD)
# -------------------------------------------------------------------

class _IsAdmin(IsAuthenticated):
    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN)
        )


def _policy_dict(p: DiscountPolicy):
    return {
        "id": p.id,
        "outlet": p.outlet_id,
        "outlet_name": p.outlet.outlet_name if p.outlet_id else None,
        "role": p.role,
        "max_line_discount_pct": str(p.max_line_discount_pct),
        "max_bill_discount_pct": str(p.max_bill_discount_pct),
        "max_bill_discount_amount": str(p.max_bill_discount_amount),
        "require_manager_pin_above_pct": str(p.require_manager_pin_above_pct),
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


@api_view(["GET", "POST"])
@permission_classes([_IsAdmin])
def discount_policies(request):
    if request.method == "GET":
        qs = DiscountPolicy.objects.select_related("outlet").all()
        outlet_q = request.query_params.get("outlet")
        if outlet_q:
            qs = qs.filter(outlet_id=outlet_q)
        return Response({"count": qs.count(), "results": [_policy_dict(p) for p in qs]})

    data = request.data
    role = (data.get("role") or "").strip()
    if role not in {r for r, _ in User.Role.choices}:
        return Response({"detail": f"Invalid role: {role}"}, status=400)
    outlet_id = data.get("outlet")
    outlet_obj = None
    if outlet_id:
        outlet_obj = get_object_or_404(Outlet, pk=outlet_id)
    if DiscountPolicy.objects.filter(outlet=outlet_obj, role=role).exists():
        return Response({"detail": "Policy already exists for this (outlet, role)."}, status=400)
    try:
        p = DiscountPolicy.objects.create(
            outlet=outlet_obj, role=role,
            max_line_discount_pct=Decimal(str(data.get("max_line_discount_pct", 10))),
            max_bill_discount_pct=Decimal(str(data.get("max_bill_discount_pct", 10))),
            max_bill_discount_amount=Decimal(str(data.get("max_bill_discount_amount", 5000))),
            require_manager_pin_above_pct=Decimal(str(data.get("require_manager_pin_above_pct", 5))),
        )
    except Exception as e:
        return Response({"detail": str(e)}, status=400)
    _audit(request.user, "pos.discount_policy_create", p, _policy_dict(p))
    return Response(_policy_dict(p), status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([_IsAdmin])
def discount_policy_detail(request, policy_id):
    p = get_object_or_404(DiscountPolicy.objects.select_related("outlet"), pk=policy_id)
    if request.method == "GET":
        return Response(_policy_dict(p))
    if request.method == "DELETE":
        _audit(request.user, "pos.discount_policy_delete", p, _policy_dict(p))
        p.delete()
        return Response(status=204)
    # PATCH
    data = request.data
    changes = {}
    for f in ("max_line_discount_pct", "max_bill_discount_pct",
              "max_bill_discount_amount", "require_manager_pin_above_pct"):
        if f in data:
            try:
                setattr(p, f, Decimal(str(data[f])))
                changes[f] = str(data[f])
            except Exception:
                return Response({"detail": f"Invalid {f}"}, status=400)
    p.save()
    _audit(request.user, "pos.discount_policy_update", p, {"changes": changes})
    return Response(_policy_dict(p))


# -------------------------------------------------------------------
# Batch / Expiry endpoints
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([CanSell])
def item_batches(request, item_id):
    """List active batches for an item (qty > 0), FEFO-ordered."""
    outlet = _user_outlet(request)
    item = get_object_or_404(Item, pk=item_id)
    if outlet and item.outlet_id != outlet.id and request.user.role not in (
        User.Role.ADMIN, User.Role.SUPER_ADMIN,
    ):
        return Response({"detail": "Not in your outlet."}, status=403)

    today = date.today()
    qs = (
        ItemBatch.objects.filter(item=item, is_active=True, qty__gt=0)
        .extra(select={"_exp_null": "expiry_date IS NULL"})
        .order_by("_exp_null", "expiry_date", "id")
    )
    out = []
    for b in qs:
        days_to_expiry = None
        if b.expiry_date:
            days_to_expiry = (b.expiry_date - today).days
        out.append({
            "batch_id": b.id,
            "batch_no": b.batch_no,
            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
            "days_to_expiry": days_to_expiry,
            "qty": str(b.qty),
            "cost_price": str(b.cost_price),
            "supplier_name": b.supplier.name if b.supplier_id else "",
        })
    return Response({"count": len(out), "results": out})


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def near_expiry_report(request):
    """
    GET /api/pos/reports/near-expiry/?days=30&outlet=N
    Lists active batches with qty > 0 expiring within the next `days` days.
    """
    try:
        days = int(request.query_params.get("days") or 30)
    except Exception:
        days = 30
    today = date.today()
    cutoff = today + timedelta(days=max(days, 0))

    qs = ItemBatch.objects.select_related("item", "supplier").filter(
        is_active=True, qty__gt=0, expiry_date__isnull=False,
        expiry_date__lte=cutoff,
    )

    outlet_q = request.query_params.get("outlet")
    user_outlet = _user_outlet(request)
    if outlet_q:
        qs = qs.filter(item__outlet_id=outlet_q)
    elif user_outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(item__outlet_id=user_outlet.id)

    qs = qs.order_by("expiry_date", "id")

    results = []
    total_value = Decimal("0")
    for b in qs:
        value = (b.qty or Decimal("0")) * (b.cost_price or Decimal("0"))
        total_value += value
        results.append({
            "batch_id": b.id,
            "item_id": b.item_id,
            "item_code": b.item.item_code,
            "item_name": b.item.item_name,
            "batch_no": b.batch_no,
            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
            "days_to_expiry": (b.expiry_date - today).days if b.expiry_date else None,
            "qty": str(b.qty),
            "cost_price": str(b.cost_price),
            "value": str(value.quantize(Decimal("0.01"))),
            "supplier_name": b.supplier.name if b.supplier_id else "",
        })
    return Response({
        "count": len(results),
        "days": days,
        "total_at_risk_value": str(total_value.quantize(Decimal("0.01"))),
        "results": results,
    })


# -------------------------------------------------------------------
# Phase 2 Agent 7 — Coupons + Gift Cards
# -------------------------------------------------------------------

def _is_manager_plus(user):
    return user.role in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def coupons(request):
    outlet = _user_outlet(request)
    if request.method == "GET":
        qs = Coupon.objects.all()
        if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            qs = qs.filter(Q(outlet=outlet) | Q(outlet__isnull=True))
        return Response({"count": qs.count(), "results": CouponSerializer(qs, many=True).data})
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager required."}, status=403)
    ser = CouponInput(data=request.data)
    ser.is_valid(raise_exception=True)
    coupon = Coupon.objects.create(created_by=request.user, **ser.validated_data)
    _audit(request.user, "pos.coupon_create", coupon, CouponSerializer(coupon).data)
    return Response(CouponSerializer(coupon).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def coupon_detail(request, coupon_id):
    coupon = get_object_or_404(Coupon, pk=coupon_id)
    if request.method == "GET":
        return Response(CouponSerializer(coupon).data)
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager required."}, status=403)
    if request.method == "DELETE":
        coupon.is_active = False
        coupon.save(update_fields=["is_active"])
        _audit(request.user, "pos.coupon_deactivate", coupon)
        return Response(status=204)
    ser = CouponInput(coupon, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    _audit(request.user, "pos.coupon_update", coupon, {"changes": list(request.data.keys())})
    return Response(CouponSerializer(coupon).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def coupon_redeem_check(request):
    """Dry-run validation: returns discount that would apply."""
    code = (request.data.get("code") or "").strip()
    customer_id = request.data.get("customer_id")
    bill_subtotal = request.data.get("bill_subtotal") or 0
    customer = None
    if customer_id:
        customer = Customer.objects.filter(pk=customer_id).first()
    try:
        res = apply_coupon(code=code, customer=customer, bill_subtotal=Decimal(str(bill_subtotal)))
    except ValueError as e:
        return Response({"detail": str(e), "code": "COUPON_INVALID"}, status=400)
    return Response({
        "coupon": CouponSerializer(res["coupon"]).data,
        "discount": str(res["discount"]),
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def gift_cards(request):
    outlet = _user_outlet(request)
    if request.method == "GET":
        qs = GiftCard.objects.all()
        if outlet and request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            qs = qs.filter(outlet=outlet)
        return Response({"count": qs.count(), "results": GiftCardSerializer(qs, many=True).data})
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager required."}, status=403)
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)
    ser = GiftCardIssueInput(data=request.data)
    ser.is_valid(raise_exception=True)
    v = ser.validated_data
    if GiftCard.objects.filter(serial=v["serial"]).exists():
        return Response({"detail": "Serial already exists."}, status=400)
    cust = None
    if v.get("customer_id"):
        cust = Customer.objects.filter(pk=v["customer_id"]).first()
    with transaction.atomic():
        gc = GiftCard.objects.create(
            outlet=outlet, serial=v["serial"],
            initial_balance=v["initial_balance"], current_balance=v["initial_balance"],
            customer=cust, expires_at=v.get("expires_at"),
            issued_by=request.user,
        )
        GiftCardTxn.objects.create(
            card=gc, amount=v["initial_balance"], balance_after=v["initial_balance"],
            kind=GiftCardTxn.Kind.ISSUE,
            created_by=request.user,
            note="Issued",
        )
    _audit(request.user, "pos.gift_card_issue", gc, {
        "serial": gc.serial, "initial_balance": str(gc.initial_balance),
    })
    return Response(GiftCardSerializer(gc).data, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def gift_card_detail(request, serial):
    gc = get_object_or_404(GiftCard, serial=serial)
    return Response(GiftCardSerializer(gc).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def gift_card_adjust(request, serial):
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager required."}, status=403)
    gc = get_object_or_404(GiftCard, serial=serial)
    try:
        amount = Decimal(str(request.data.get("amount") or 0))
    except Exception:
        return Response({"detail": "Invalid amount."}, status=400)
    note = (request.data.get("note") or "").strip()
    with transaction.atomic():
        gc = GiftCard.objects.select_for_update().get(pk=gc.pk)
        new_balance = (gc.current_balance or Decimal("0")) + amount
        if new_balance < 0:
            return Response({"detail": "Resulting balance is negative."}, status=400)
        gc.current_balance = new_balance
        if gc.status == GiftCard.Status.REDEEMED and new_balance > 0:
            gc.status = GiftCard.Status.ACTIVE
        gc.save(update_fields=["current_balance", "status"])
        GiftCardTxn.objects.create(
            card=gc, amount=amount, balance_after=new_balance,
            kind=GiftCardTxn.Kind.ADJUST, created_by=request.user, note=note,
        )
    _audit(request.user, "pos.gift_card_adjust", gc, {"amount": str(amount), "note": note})
    return Response(GiftCardSerializer(gc).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def gift_card_void(request, serial):
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager required."}, status=403)
    gc = get_object_or_404(GiftCard, serial=serial)
    with transaction.atomic():
        gc = GiftCard.objects.select_for_update().get(pk=gc.pk)
        if gc.status == GiftCard.Status.VOID:
            return Response({"detail": "Already void."}, status=400)
        prev = gc.current_balance
        gc.current_balance = Decimal("0")
        gc.status = GiftCard.Status.VOID
        gc.save(update_fields=["current_balance", "status"])
        GiftCardTxn.objects.create(
            card=gc, amount=-prev, balance_after=Decimal("0"),
            kind=GiftCardTxn.Kind.VOID, created_by=request.user, note="Voided",
        )
    _audit(request.user, "pos.gift_card_void", gc, {})
    return Response(GiftCardSerializer(gc).data)


# -------------------------------------------------------------------
# Phase 3 Agent 8 — TaxComponent CRUD
# -------------------------------------------------------------------

from .serializers import TaxComponentSerializer


def _can_manage_tax(user):
    return user.is_authenticated and user.role in (
        User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN,
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tax_components(request):
    """List or create TaxComponent rows.

    GET — anyone with `pos.reports`. Returns outlet-specific + chain-wide rows
    visible to the user's outlet (super_admin sees all if `?all=1`).
    POST — manager+ only. AuditLog'd.
    """
    if request.method == "GET":
        if not user_has_permission_safe(request.user, "pos.reports") and \
           request.user.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN):
            return Response({"detail": "Not allowed."}, status=403)
        outlet = _user_outlet(request)
        qs = TaxComponent.objects.all().order_by("priority", "code")
        if request.query_params.get("all") != "1" or request.user.role not in (
            User.Role.ADMIN, User.Role.SUPER_ADMIN,
        ):
            if outlet:
                qs = qs.filter(Q(outlet=outlet) | Q(outlet__isnull=True))
            else:
                qs = qs.filter(outlet__isnull=True)
        if request.query_params.get("active") in ("1", "true"):
            qs = qs.filter(is_active=True)
        rows = TaxComponentSerializer(qs, many=True).data
        return Response({"count": len(rows), "results": rows})

    # POST
    if not _can_manage_tax(request.user):
        return Response({"detail": "Manager+ only."}, status=403)
    data = dict(request.data)
    # Default outlet to user's outlet if not super_admin/admin and no outlet given.
    if "outlet" not in data or data.get("outlet") in (None, ""):
        if request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            data["outlet"] = None
        else:
            data["outlet"] = request.user.outlet_id
    ser = TaxComponentSerializer(data=data)
    ser.is_valid(raise_exception=True)
    obj = ser.save(created_by=request.user if request.user.is_authenticated else None)
    _audit(request.user, "pos.tax_component_create", obj, {
        "code": obj.code, "rate_pct": str(obj.rate_pct),
        "inclusive": obj.inclusive, "outlet_id": obj.outlet_id,
    })
    return Response(TaxComponentSerializer(obj).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def tax_component_detail(request, comp_id):
    obj = get_object_or_404(TaxComponent, pk=comp_id)
    # Outlet scoping for non-admins.
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if obj.outlet_id is not None and obj.outlet_id != request.user.outlet_id:
            return Response({"detail": "Not yours."}, status=403)

    if request.method == "GET":
        return Response(TaxComponentSerializer(obj).data)

    if request.method == "DELETE":
        if not _can_manage_tax(request.user):
            return Response({"detail": "Manager+ only."}, status=403)
        # Soft-delete
        obj.is_active = False
        obj.save(update_fields=["is_active", "updated_at"])
        _audit(request.user, "pos.tax_component_delete", obj, {"code": obj.code})
        return Response(status=204)

    # PATCH
    if not _can_manage_tax(request.user):
        return Response({"detail": "Manager+ only."}, status=403)
    ser = TaxComponentSerializer(obj, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    obj = ser.save()
    _audit(request.user, "pos.tax_component_update", obj, {
        "changes": list(request.data.keys()),
    })
    return Response(TaxComponentSerializer(obj).data)


def user_has_permission_safe(user, code):
    """Best-effort permission check that won't crash if registry missing."""
    try:
        from apps.accounts.permission_registry import user_has_permission
        return user_has_permission(user, code)
    except Exception:
        return False


# -------------------------------------------------------------------
# Phase 3 Agent 9 — GL Export + Cash Handover
# -------------------------------------------------------------------

from .models import GLAccount, GLExport, GLEntry, CashHandover
from . import gl_export as _gl


def _gl_account_dict(acc):
    return {
        "id": acc.id,
        "outlet": acc.outlet_id,
        "code": acc.code,
        "name": acc.name,
        "purpose": acc.purpose,
        "is_active": acc.is_active,
        "created_at": acc.created_at.isoformat() if acc.created_at else None,
        "updated_at": acc.updated_at.isoformat() if acc.updated_at else None,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def gl_accounts(request):
    """List or create chart-of-accounts entries for GL export mapping."""
    outlet = _user_outlet(request)
    if request.method == "GET":
        qs = GLAccount.objects.all().order_by("outlet_id", "code")
        if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            if outlet:
                qs = qs.filter(Q(outlet=outlet) | Q(outlet__isnull=True))
            else:
                qs = qs.filter(outlet__isnull=True)
        if request.query_params.get("active") in ("1", "true"):
            qs = qs.filter(is_active=True)
        if request.query_params.get("purpose"):
            qs = qs.filter(purpose=request.query_params["purpose"])
        rows = [_gl_account_dict(a) for a in qs]
        return Response({"count": len(rows), "results": rows})

    # POST
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ only."}, status=403)
    data = request.data
    code = (data.get("code") or "").strip()
    name = (data.get("name") or "").strip()
    purpose = (data.get("purpose") or "").strip()
    if not code or not name or not purpose:
        return Response({"detail": "code, name, purpose required."}, status=400)
    if purpose not in dict(GLAccount.Purpose.choices):
        return Response({"detail": "Invalid purpose."}, status=400)
    target_outlet_id = data.get("outlet")
    if target_outlet_id in (None, ""):
        target_outlet_id = None if request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN) else (outlet.id if outlet else None)
    target_outlet = Outlet.objects.filter(pk=target_outlet_id).first() if target_outlet_id else None
    if GLAccount.objects.filter(outlet=target_outlet, code=code).exists():
        return Response({"detail": "Account code already exists for this outlet."}, status=400)
    acc = GLAccount.objects.create(
        outlet=target_outlet, code=code, name=name, purpose=purpose,
        is_active=bool(data.get("is_active", True)),
    )
    _audit(request.user, "pos.gl_account_create", acc, {"code": code, "purpose": purpose})
    return Response(_gl_account_dict(acc), status=201)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def gl_account_detail(request, account_id):
    acc = get_object_or_404(GLAccount, pk=account_id)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if acc.outlet_id and acc.outlet_id != (request.user.outlet_id or 0):
            return Response({"detail": "Not yours."}, status=403)
    if request.method == "GET":
        return Response(_gl_account_dict(acc))
    # PATCH
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ only."}, status=403)
    data = request.data
    for f in ("name", "purpose"):
        if f in data and data[f] is not None:
            setattr(acc, f, data[f])
    if "is_active" in data:
        acc.is_active = bool(data["is_active"])
    if "code" in data and data["code"]:
        acc.code = data["code"].strip()
    acc.save()
    _audit(request.user, "pos.gl_account_update", acc, {"changes": list(data.keys())})
    return Response(_gl_account_dict(acc))


def _gl_export_dict(exp, *, with_entries=False, with_csv=False):
    out = {
        "id": exp.id,
        "outlet": exp.outlet_id,
        "date_from": str(exp.date_from),
        "date_to": str(exp.date_to),
        "shift": exp.shift_id,
        "generated_by": exp.generated_by_id,
        "generated_by_username": exp.generated_by.username if exp.generated_by_id else None,
        "generated_at": exp.generated_at.isoformat() if exp.generated_at else None,
        "status": exp.status,
        "totals": exp.totals,
        "note": exp.note,
    }
    if with_csv:
        out["csv_text"] = exp.csv_text
    if with_entries:
        out["entries"] = [{
            "id": e.id, "bill": e.bill_id,
            "account_code": e.account_code, "account_name": e.account_name,
            "debit": str(e.debit), "credit": str(e.credit),
            "reference": e.reference, "memo": e.memo,
            "entry_date": str(e.entry_date),
        } for e in exp.entries.all().order_by("entry_date", "id")]
    return out


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def gl_export_generate(request):
    """Generate a GLExport for [date_from, date_to] (+ optional shift_id)."""
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ only."}, status=403)
    outlet = _user_outlet(request)
    raw_outlet_id = request.data.get("outlet")
    if raw_outlet_id and request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        outlet = Outlet.objects.filter(pk=raw_outlet_id).first() or outlet
    if not outlet:
        return Response({"detail": "No outlet."}, status=400)

    df_raw = request.data.get("date_from")
    dt_raw = request.data.get("date_to")
    try:
        df = datetime.strptime(df_raw, "%Y-%m-%d").date()
        dt = datetime.strptime(dt_raw, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return Response({"detail": "date_from/date_to required as YYYY-MM-DD."}, status=400)

    shift = None
    if request.data.get("shift_id"):
        shift = Shift.objects.filter(pk=request.data["shift_id"], outlet=outlet).first()
        if not shift:
            return Response({"detail": "Shift not found for this outlet."}, status=404)

    exp = _gl.generate_export(
        outlet=outlet, date_from=df, date_to=dt, user=request.user, shift=shift,
    )
    _audit(request.user, "pos.gl_export_generate", exp, {
        "date_from": str(df), "date_to": str(dt),
        "shift_id": shift.id if shift else None,
        "totals": exp.totals,
    })
    return Response(_gl_export_dict(exp, with_entries=True, with_csv=True), status=201)


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def gl_export_list(request):
    outlet = _user_outlet(request)
    qs = GLExport.objects.select_related("generated_by", "shift").all()
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and outlet:
        qs = qs.filter(outlet=outlet)
    df = request.query_params.get("date_from")
    dt = request.query_params.get("date_to")
    if df:
        try: qs = qs.filter(date_from__gte=datetime.strptime(df, "%Y-%m-%d").date())
        except ValueError: pass
    if dt:
        try: qs = qs.filter(date_to__lte=datetime.strptime(dt, "%Y-%m-%d").date())
        except ValueError: pass
    rows = [_gl_export_dict(e) for e in qs[:200]]
    return Response({"count": len(rows), "results": rows})


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def gl_export_detail(request, export_id):
    exp = get_object_or_404(GLExport, pk=export_id)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if exp.outlet_id != (request.user.outlet_id or 0):
            return Response({"detail": "Not yours."}, status=403)
    return Response(_gl_export_dict(exp, with_entries=True, with_csv=True))


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def gl_export_download(request, export_id):
    from django.http import HttpResponse
    exp = get_object_or_404(GLExport, pk=export_id)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if exp.outlet_id != (request.user.outlet_id or 0):
            return Response({"detail": "Not yours."}, status=403)
    body = exp.csv_text or _gl.render_tally_csv(list(exp.entries.all().order_by("entry_date", "id")))
    resp = HttpResponse(body, content_type="text/csv")
    fname = f"gl-export-{exp.id}-{exp.date_from}-to-{exp.date_to}.csv"
    resp["Content-Disposition"] = f'attachment; filename="{fname}"'
    return resp


# ---- Cash Handover ----

def _cash_handover_dict(h):
    return {
        "id": h.id,
        "shift": h.shift_id,
        "cashier": h.cashier_id,
        "cashier_username": h.cashier.username if h.cashier_id else None,
        "collected_by": h.collected_by_id,
        "collected_by_username": h.collected_by.username if h.collected_by_id else None,
        "expected_cash": str(h.expected_cash),
        "counted_cash": str(h.counted_cash),
        "variance": str(h.variance),
        "safe_deposit_ref": h.safe_deposit_ref,
        "note": h.note,
        "status": h.status,
        "collected_at": h.collected_at.isoformat() if h.collected_at else None,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cash_handover_create(request):
    """Record a cash handover from cashier to manager.

    Only allowed on a CLOSED shift. expected_cash is computed server-side
    from `_shift_aggregates(shift)`. variance = counted - expected.
    """
    shift_id = request.data.get("shift_id")
    if not shift_id:
        return Response({"detail": "shift_id required."}, status=400)
    shift = get_object_or_404(Shift.objects.select_related("outlet", "opened_by"), pk=shift_id)
    if shift.status != Shift.Status.CLOSED:
        return Response({"detail": "Shift must be closed before handover."}, status=400)
    if request.user.outlet_id and shift.outlet_id != request.user.outlet_id and \
       request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        return Response({"detail": "Not yours."}, status=403)

    try:
        counted = _money(request.data.get("counted_cash") or 0)
    except Exception:
        return Response({"detail": "counted_cash invalid."}, status=400)

    collected_by_id = request.data.get("collected_by_id") or request.user.id
    collected_by = User.objects.filter(pk=collected_by_id).first()
    if not collected_by:
        return Response({"detail": "collected_by user not found."}, status=400)

    aggs = _shift_aggregates(shift)
    expected = _money(aggs["expected_cash"])
    variance = _money(counted - expected)

    is_self_close = (collected_by.id == shift.opened_by_id) or \
                    (collected_by.role not in (User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPER_ADMIN))
    initial_status = CashHandover.Status.PENDING if is_self_close else CashHandover.Status.ACCEPTED

    h = CashHandover.objects.create(
        shift=shift, cashier=shift.opened_by, collected_by=collected_by,
        expected_cash=expected, counted_cash=counted, variance=variance,
        safe_deposit_ref=(request.data.get("safe_deposit_ref") or "").strip(),
        note=(request.data.get("note") or "")[:500],
        status=initial_status,
    )
    _audit(request.user, "pos.cash_handover_create", h, {
        "shift_id": shift.id,
        "expected": str(expected), "counted": str(counted), "variance": str(variance),
        "status": h.status,
    })
    return Response(_cash_handover_dict(h), status=201)


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def cash_handover_list(request):
    qs = CashHandover.objects.select_related("shift", "cashier", "collected_by").all()
    outlet = _user_outlet(request)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and outlet:
        qs = qs.filter(shift__outlet=outlet)
    if request.query_params.get("shift_id"):
        qs = qs.filter(shift_id=request.query_params["shift_id"])
    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    df = request.query_params.get("date_from")
    dt = request.query_params.get("date_to")
    if df:
        try: qs = qs.filter(collected_at__date__gte=datetime.strptime(df, "%Y-%m-%d").date())
        except ValueError: pass
    if dt:
        try: qs = qs.filter(collected_at__date__lte=datetime.strptime(dt, "%Y-%m-%d").date())
        except ValueError: pass
    rows = [_cash_handover_dict(h) for h in qs[:300]]
    return Response({"count": len(rows), "results": rows})


# -------------------------------------------------------------------
# Phase 3 Agent 10 — Sales Rep + Commission
# -------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sales_reps(request):
    """Active users in the caller's outlet who can be attributed as sales rep.

    Includes cashiers, managers, store users (anyone who can sell). Admins
    see all outlets when no outlet filter is supplied.
    """
    outlet = _user_outlet(request)
    qs = User.objects.filter(is_active=True)
    sellable_roles = [
        User.Role.STORE_USER, User.Role.STAFF,
        User.Role.MANAGER, User.Role.ADMIN,
    ]
    qs = qs.filter(role__in=sellable_roles)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN) and outlet:
        qs = qs.filter(outlet=outlet)
    elif request.query_params.get("outlet"):
        try:
            qs = qs.filter(outlet_id=int(request.query_params["outlet"]))
        except (TypeError, ValueError):
            pass
    rows = [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "outlet_id": u.outlet_id,
        }
        for u in qs.order_by("username")[:500]
    ]
    return Response({"count": len(rows), "results": rows})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def commission_rules(request):
    """List or create commission rules. Manager+ only for writes."""
    outlet = _user_outlet(request)
    if request.method == "GET":
        qs = CommissionRule.objects.select_related("rep", "outlet").all()
        if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            if outlet:
                qs = qs.filter(Q(outlet=outlet) | Q(outlet__isnull=True))
            else:
                qs = qs.filter(outlet__isnull=True)
        if request.query_params.get("active") in ("1", "true"):
            qs = qs.filter(is_active=True)
        if request.query_params.get("rep"):
            try:
                qs = qs.filter(rep_id=int(request.query_params["rep"]))
            except (TypeError, ValueError):
                pass
        rows = CommissionRuleSerializer(qs.order_by("priority", "id"), many=True).data
        return Response({"count": len(rows), "results": rows})

    # POST
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ only."}, status=403)
    data = dict(request.data)
    if data.get("outlet") in (None, ""):
        if request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
            data["outlet"] = None
        else:
            data["outlet"] = request.user.outlet_id
    ser = CommissionRuleSerializer(data=data)
    ser.is_valid(raise_exception=True)
    obj = ser.save(created_by=request.user if request.user.is_authenticated else None)
    _audit(request.user, "pos.commission_rule_create", obj, {
        "rep_id": obj.rep_id, "category": obj.item_category,
        "rate_pct": str(obj.rate_pct), "basis": obj.basis,
        "outlet_id": obj.outlet_id,
    })
    return Response(CommissionRuleSerializer(obj).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def commission_rule_detail(request, rule_id):
    obj = get_object_or_404(CommissionRule, pk=rule_id)
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if obj.outlet_id is not None and obj.outlet_id != request.user.outlet_id:
            return Response({"detail": "Not yours."}, status=403)

    if request.method == "GET":
        return Response(CommissionRuleSerializer(obj).data)

    if request.method == "DELETE":
        if not _is_manager_plus(request.user):
            return Response({"detail": "Manager+ only."}, status=403)
        obj.is_active = False
        obj.save(update_fields=["is_active", "updated_at"])
        _audit(request.user, "pos.commission_rule_delete", obj, {"rep_id": obj.rep_id})
        return Response(status=204)

    # PATCH
    if not _is_manager_plus(request.user):
        return Response({"detail": "Manager+ only."}, status=403)
    ser = CommissionRuleSerializer(obj, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    obj = ser.save()
    _audit(request.user, "pos.commission_rule_update", obj, {
        "changes": list(request.data.keys()),
    })
    return Response(CommissionRuleSerializer(obj).data)


@api_view(["GET"])
@permission_classes([CanViewPosReports])
def commission_report(request):
    """Aggregate commission earnings by rep over a date range."""
    df_str = request.query_params.get("date_from")
    dt_str = request.query_params.get("date_to")
    today = timezone.now().date()
    try:
        df = datetime.strptime(df_str, "%Y-%m-%d").date() if df_str else today
    except ValueError:
        return Response({"detail": "Bad date_from."}, status=400)
    try:
        dt = datetime.strptime(dt_str, "%Y-%m-%d").date() if dt_str else today
    except ValueError:
        return Response({"detail": "Bad date_to."}, status=400)

    outlet = _user_outlet(request)
    bills_qs = Bill.objects.filter(
        status=Bill.Status.CLOSED,
        kind=Bill.Kind.SALE,
        created_at__date__gte=df,
        created_at__date__lte=dt,
    ).select_related("sales_rep", "outlet")

    target_outlet = None
    outlet_param = request.query_params.get("outlet")
    if outlet_param:
        try:
            target_outlet = Outlet.objects.filter(pk=int(outlet_param)).first()
        except (TypeError, ValueError):
            target_outlet = None
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        target_outlet = outlet
    if target_outlet:
        bills_qs = bills_qs.filter(outlet=target_outlet)

    rep_filter = request.query_params.get("rep")
    rep_filter_id = None
    if rep_filter:
        try:
            rep_filter_id = int(rep_filter)
        except (TypeError, ValueError):
            rep_filter_id = None
        if rep_filter_id:
            bills_qs = bills_qs.filter(
                Q(sales_rep_id=rep_filter_id) | Q(lines__sales_rep_id=rep_filter_id)
            ).distinct()

    rules_qs = CommissionRule.objects.filter(is_active=True)
    if target_outlet:
        rules_qs = rules_qs.filter(Q(outlet=target_outlet) | Q(outlet__isnull=True))
    rules = list(rules_qs.order_by("priority", "id"))

    rep_totals = {}
    line_rows = []
    total_line_total = Decimal("0")
    total_commission = Decimal("0")
    bill_count = 0

    for bill in bills_qs.distinct():
        bill_count += 1
        per_rep = compute_bill_commissions(bill=bill, rules=rules)
        for rep_id, slot in per_rep.items():
            if rep_filter_id and rep_id != rep_filter_id:
                continue
            agg = rep_totals.setdefault(rep_id, {
                "bill_ids": set(), "line_total": Decimal("0"),
                "commission": Decimal("0"),
            })
            agg["bill_ids"].add(bill.id)
            agg["commission"] += slot["amount"]
            for entry in slot["breakdown"]:
                lt = Decimal(entry["line_total"])
                agg["line_total"] += lt
                total_line_total += lt
                total_commission += Decimal(entry["amount"])
                line_rows.append({
                    "bill_no": bill.bill_no,
                    "bill_id": bill.id,
                    "rep_id": rep_id,
                    "category": entry["category"],
                    "line_total": entry["line_total"],
                    "rate_pct": entry["rate_pct"],
                    "basis": entry["basis"],
                    "commission": entry["amount"],
                })

    rep_ids = list(rep_totals.keys())
    users_map = {u.id: u for u in User.objects.filter(pk__in=rep_ids)}
    by_rep = []
    for rid, agg in rep_totals.items():
        u = users_map.get(rid)
        by_rep.append({
            "rep_id": rid,
            "rep_username": u.username if u else "",
            "rep_full_name": (u.username if u else ""),
            "bill_count": len(agg["bill_ids"]),
            "line_total": str(agg["line_total"].quantize(Decimal("0.01"))),
            "commission": str(agg["commission"].quantize(Decimal("0.01"))),
        })
    by_rep.sort(key=lambda x: Decimal(x["commission"]), reverse=True)

    for r in line_rows:
        u = users_map.get(r["rep_id"])
        r["rep_username"] = u.username if u else ""

    return Response({
        "date_from": df.isoformat(),
        "date_to": dt.isoformat(),
        "totals": {
            "bills": bill_count,
            "line_total": str(total_line_total.quantize(Decimal("0.01"))),
            "commission": str(total_commission.quantize(Decimal("0.01"))),
        },
        "by_rep": by_rep,
        "lines": line_rows,
    })
