"""
Ecom domain services. Pure functions / orchestrators called by the views.

Three concerns kept separate:
  cart.py-style operations    — get_or_create / add / update / remove
  checkout                    — cart → order, with stock reservations
  payment_committed           — gateway webhook landed → consume reservations,
                                write StockMovement via apply_movement(),
                                flip order to PAID
"""
from __future__ import annotations

import secrets
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.catalog_ext.pricing import resolve_prices
from apps.inventory.models import StockReservation
from apps.items.inventory import apply_movement
from apps.items.models import Item, StockMovement
from apps.outlets.models import Outlet
from apps.pos.models import Customer

from .models import EcomCart, EcomCartItem, EcomOrder, EcomOrderLine

RESERVATION_TTL_MINUTES = 15


# ---------------------------------------------------------------------------
# Cart operations
# ---------------------------------------------------------------------------
def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def get_or_create_cart(*, session_token: str | None, outlet_id: int,
                      customer: Customer | None = None) -> EcomCart:
    """
    Look up by session_token; create one if missing or expired. Single
    source of truth for "this browser's open cart at this outlet".
    """
    if session_token:
        cart = (
            EcomCart.objects
            .filter(session_token=session_token, status=EcomCart.Status.ACTIVE)
            .first()
        )
        if cart:
            return cart
    return EcomCart.objects.create(
        outlet_id=outlet_id,
        customer=customer,
        session_token=new_session_token(),
        status=EcomCart.Status.ACTIVE,
    )


def _resolve_unit_price(item_id: int) -> Decimal:
    """Look up the storefront price; fall back to item.selling_price if any."""
    prices = resolve_prices([item_id])
    if item_id in prices:
        return Decimal(prices[item_id]["unit_price"])
    # Last-resort fallback: 0. Items without a price list are not sellable
    # — caller can refuse the add.
    return Decimal("0")


def add_item(*, cart: EcomCart, item_id: int, qty: Decimal) -> EcomCartItem:
    """Add (or increment) an item in the cart at the current resolved price."""
    if qty <= 0:
        raise ValueError("qty must be > 0")
    item = get_object_or_404(Item, pk=item_id)
    price = _resolve_unit_price(item_id)
    with transaction.atomic():
        line, created = EcomCartItem.objects.select_for_update().get_or_create(
            cart=cart, item=item,
            defaults={"qty": qty, "unit_price_snapshot": price},
        )
        if not created:
            line.qty = (line.qty or Decimal("0")) + qty
            # Refresh price snapshot to current — ecom UX expects "what you
            # see is what you pay" through the session.
            line.unit_price_snapshot = price
            line.save(update_fields=["qty", "unit_price_snapshot", "updated_at"])
        cart.save(update_fields=["last_activity_at"])
    return line


def update_qty(*, cart: EcomCart, item_id: int, qty: Decimal) -> EcomCartItem | None:
    """Set absolute qty for a line; deletes the line if qty <= 0."""
    with transaction.atomic():
        line = (
            EcomCartItem.objects
            .select_for_update()
            .filter(cart=cart, item_id=item_id)
            .first()
        )
        if not line:
            return None
        if qty <= 0:
            line.delete()
            cart.save(update_fields=["last_activity_at"])
            return None
        line.qty = qty
        line.save(update_fields=["qty", "updated_at"])
        cart.save(update_fields=["last_activity_at"])
    return line


def remove_item(*, cart: EcomCart, item_id: int) -> bool:
    deleted, _ = EcomCartItem.objects.filter(cart=cart, item_id=item_id).delete()
    if deleted:
        cart.save(update_fields=["last_activity_at"])
    return bool(deleted)


# ---------------------------------------------------------------------------
# Stock availability — what's actually buyable right now
# ---------------------------------------------------------------------------
def available_qty(*, outlet_id: int, item_id: int) -> Decimal:
    """
    available = item.on_hand - SUM(active reservations for this outlet+item).

    Reads from the existing items.Item.on_hand cache (kept in sync by
    apply_movement) rather than re-aggregating the ledger every call.
    """
    on_hand = (
        Item.objects.filter(pk=item_id).values_list("on_hand", flat=True).first()
        or Decimal("0")
    )
    held = (
        StockReservation.objects
        .filter(outlet_id=outlet_id, item_id=item_id,
                status=StockReservation.Status.ACTIVE)
        .aggregate(s=Sum("qty"))["s"]
        or Decimal("0")
    )
    return Decimal(on_hand) - Decimal(held)


# ---------------------------------------------------------------------------
# Checkout — convert a cart into an order with reservations
# ---------------------------------------------------------------------------
class CheckoutError(Exception):
    """Generic recoverable checkout failure (item out of stock, empty cart, ...)."""


def _next_order_number() -> str:
    """Order number = ECOM-YYMMDD-XXXX with XXXX = today's count + 1."""
    today = timezone.localdate()
    prefix = f"ECOM-{today:%y%m%d}-"
    count_today = EcomOrder.objects.filter(number__startswith=prefix).count()
    return f"{prefix}{count_today + 1:04d}"


@transaction.atomic
def begin_checkout(*, cart: EcomCart, shipping_address: dict,
                   billing_address: dict | None = None,
                   guest_name: str = "", guest_email: str = "",
                   guest_phone: str = "",
                   shipping_total: Decimal = Decimal("0"),
                   tax_rate: Decimal = Decimal("0")) -> EcomOrder:
    """
    Create an EcomOrder + EcomOrderLines from the cart. For every line:
      1. Verify available_qty >= line.qty (else raise CheckoutError).
      2. Create a StockReservation row (TTL = RESERVATION_TTL_MINUTES).
      3. Snapshot price + tax onto the order line.
    Cart is flipped to CONVERTED, but its items remain (audit trail).
    Order is left in PENDING_PAYMENT — payment_committed() is a separate call.
    """
    cart_items = list(
        EcomCartItem.objects
        .select_for_update()
        .filter(cart=cart)
        .select_related("item")
    )
    if not cart_items:
        raise CheckoutError("Cart is empty.")

    # 1. Stock check (before creating any rows).
    for ci in cart_items:
        avail = available_qty(outlet_id=cart.outlet_id, item_id=ci.item_id)
        if avail < ci.qty:
            raise CheckoutError(
                f"Item {ci.item.item_code} is short on stock "
                f"(requested {ci.qty}, available {avail})."
            )

    # 2. Create the order shell.
    order = EcomOrder.objects.create(
        number=_next_order_number(),
        outlet=cart.outlet,
        cart=cart,
        customer=cart.customer,
        guest_name=guest_name, guest_email=guest_email, guest_phone=guest_phone,
        status=EcomOrder.Status.PENDING_PAYMENT,
        shipping_address=shipping_address,
        billing_address=billing_address or shipping_address,
        shipping_total=shipping_total,
        currency="LKR",
    )

    # 3. Reservations + order lines.
    expires_at = timezone.now() + timedelta(minutes=RESERVATION_TTL_MINUTES)
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    for ci in cart_items:
        line_subtotal = (ci.unit_price_snapshot * ci.qty).quantize(Decimal("0.01"))
        line_tax = (line_subtotal * tax_rate).quantize(Decimal("0.01"))
        line_total = line_subtotal + line_tax

        reservation = StockReservation.objects.create(
            outlet=cart.outlet,
            item=ci.item,
            qty=ci.qty,
            status=StockReservation.Status.ACTIVE,
            owner_table="ecom_orders",
            owner_id=order.id,
            expires_at=expires_at,
        )
        EcomOrderLine.objects.create(
            order=order,
            item=ci.item,
            item_code_snapshot=ci.item.item_code,
            item_name_snapshot=ci.item.item_name,
            qty=ci.qty,
            unit_price=ci.unit_price_snapshot,
            line_subtotal=line_subtotal,
            tax_amount=line_tax,
            line_total=line_total,
            reservation=reservation,
        )
        ci.reservation = reservation
        ci.save(update_fields=["reservation", "updated_at"])
        subtotal += line_subtotal
        tax_total += line_tax

    grand_total = subtotal + tax_total + shipping_total
    EcomOrder.objects.filter(pk=order.pk).update(
        subtotal=subtotal,
        tax_total=tax_total,
        grand_total=grand_total,
    )
    order.refresh_from_db()

    # 4. Flip cart to converted (items stay for the receipt link).
    cart.status = EcomCart.Status.CONVERTED
    cart.save(update_fields=["status", "last_activity_at"])
    return order


# ---------------------------------------------------------------------------
# Payment-committed — webhook from a successful payment gateway
# ---------------------------------------------------------------------------
class PaymentCommitError(Exception):
    pass


@transaction.atomic
def payment_committed(*, order: EcomOrder, payment=None,
                      payment_intent_ref: str = "") -> EcomOrder:
    """
    Mark an order PAID and commit its stock to the canonical ledger.

    Flow:
      1. Skip if already paid (idempotent — safe to retry on duplicate webhooks).
      2. For each line whose reservation is ACTIVE:
           - Flip reservation → CONSUMED.
           - Call apply_movement(kind=SALE, qty_change=-line.qty, ref_type="ecom_order_line", ref_id=line.id).
           - Mark the line is_committed=True.
      3. Update order: status=PAID, paid_at=now, optional payment FK,
         optional payment_intent_ref.

    `apply_movement()` writes to items.StockMovement and updates Item.on_hand
    atomically. It is the bridge between this app and the canonical ledger.
    """
    order = EcomOrder.objects.select_for_update().get(pk=order.pk)
    if order.status == EcomOrder.Status.PAID:
        return order  # idempotent

    if order.status not in (EcomOrder.Status.PENDING_PAYMENT,):
        raise PaymentCommitError(
            f"Cannot commit payment on order in status {order.status}"
        )

    lines = list(
        EcomOrderLine.objects
        .select_for_update()
        .filter(order=order, is_committed=False)
        .select_related("item", "reservation")
    )

    now = timezone.now()
    for line in lines:
        # 1. Consume the reservation (fail loud if missing/expired — that
        # would mean the reservation TTL elapsed before payment landed).
        if line.reservation_id:
            res = StockReservation.objects.select_for_update().get(pk=line.reservation_id)
            if res.status != StockReservation.Status.ACTIVE:
                raise PaymentCommitError(
                    f"Reservation {res.id} for line {line.id} is {res.status}; "
                    f"cannot commit payment. Stock may need to be re-checked."
                )
            res.status = StockReservation.Status.CONSUMED
            res.consumed_at = now
            res.save(update_fields=["status", "consumed_at"])

        # 2. Append the canonical ledger row + decrement Item.on_hand.
        apply_movement(
            item=line.item,
            outlet=order.outlet,
            kind=StockMovement.Kind.SALE,
            qty_change=-line.qty,
            unit_cost=None,  # ecom doesn't track COGS yet (Phase 5+)
            ref_type="ecom_order_line",
            ref_id=line.id,
            note=f"Ecom {order.number}",
        )
        line.is_committed = True
        line.committed_at = now
        line.save(update_fields=["is_committed", "committed_at"])

    order.status = EcomOrder.Status.PAID
    order.paid_at = now
    if payment is not None:
        order.payment = payment
    if payment_intent_ref:
        order.payment_intent_ref = payment_intent_ref
    order.save(update_fields=[
        "status", "paid_at", "payment", "payment_intent_ref", "updated_at",
    ])
    return order


@transaction.atomic
def cancel_order(*, order: EcomOrder, reason: str = "") -> EcomOrder:
    """
    Cancel a not-yet-paid order. Releases reservations. No ledger writes
    because nothing was committed.
    """
    order = EcomOrder.objects.select_for_update().get(pk=order.pk)
    if order.status not in (EcomOrder.Status.PENDING_PAYMENT,):
        raise PaymentCommitError(
            f"Only pending_payment orders can be cancelled; got {order.status}"
        )
    StockReservation.objects.filter(
        owner_table="ecom_orders", owner_id=order.id,
        status=StockReservation.Status.ACTIVE,
    ).update(status=StockReservation.Status.RELEASED)
    order.status = EcomOrder.Status.CANCELLED
    order.cancelled_at = timezone.now()
    if reason:
        order.notes = (order.notes + f" | cancelled: {reason}").strip(" |")[:500]
    order.save(update_fields=["status", "cancelled_at", "notes", "updated_at"])
    return order
