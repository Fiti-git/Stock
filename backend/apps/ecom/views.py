"""
Ecom HTTP layer. Two surfaces:

  /api/ecom/cart/ ...   — public, anonymous-allowed, throttled. Carts are
                          identified by session_token; logged-in customers
                          can claim a cart by attaching their pos.Customer.
  /api/ecom/orders/...  — order detail (read by token or customer auth);
                          payment-confirm and cancel are admin-gated until
                          the gateway integration lands.

Every endpoint is gated by settings.ECOM_API_ENABLED. Off by default —
returns 503 so partial deploys cannot expose checkout.
"""
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import (
    api_view, permission_classes, throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.accounts.permissions import IsAdmin
from apps.outlets.models import Outlet

from . import services
from .models import EcomCart, EcomOrder
from .serializers import CartSerializer, OrderSerializer


class EcomAnonThrottle(AnonRateThrottle):
    scope = "storefront"


def _enabled():
    return getattr(settings, "ECOM_API_ENABLED", False)


def _disabled():
    return Response(
        {"detail": "Ecom API is not enabled on this deployment."},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _to_decimal(raw, field):
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{field} must be a number")


# ---------------------------------------------------------------------------
# Cart endpoints
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def create_cart(request):
    """
    POST /api/ecom/cart/
    Body: {"outlet_id": 1, "session_token": "..." (optional)}
    Returns: full cart payload incl. session_token (client persists in localStorage).
    """
    if not _enabled():
        return _disabled()

    outlet_id = request.data.get("outlet_id")
    if not outlet_id:
        return Response({"detail": "outlet_id is required."}, status=400)
    get_object_or_404(Outlet, pk=outlet_id)
    cart = services.get_or_create_cart(
        session_token=request.data.get("session_token") or None,
        outlet_id=int(outlet_id),
    )
    return Response(CartSerializer(cart).data, status=201)


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def get_cart(request, session_token):
    if not _enabled():
        return _disabled()
    cart = get_object_or_404(EcomCart, session_token=session_token)
    return Response(CartSerializer(cart).data)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def add_cart_item(request, session_token):
    """POST /api/ecom/cart/<token>/items/  body: {"item_id":..., "qty":...}"""
    if not _enabled():
        return _disabled()
    cart = get_object_or_404(EcomCart, session_token=session_token,
                             status=EcomCart.Status.ACTIVE)
    try:
        qty = _to_decimal(request.data.get("qty", 1), "qty")
        item_id = int(request.data.get("item_id"))
    except (TypeError, ValueError) as exc:
        return Response({"detail": str(exc)}, status=400)
    try:
        services.add_item(cart=cart, item_id=item_id, qty=qty)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response(CartSerializer(cart).data)


@api_view(["PATCH"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def update_cart_item(request, session_token, item_id):
    """PATCH /api/ecom/cart/<token>/items/<item_id>/  body: {"qty": N}"""
    if not _enabled():
        return _disabled()
    cart = get_object_or_404(EcomCart, session_token=session_token,
                             status=EcomCart.Status.ACTIVE)
    try:
        qty = _to_decimal(request.data.get("qty", 0), "qty")
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    services.update_qty(cart=cart, item_id=int(item_id), qty=qty)
    return Response(CartSerializer(cart).data)


@api_view(["DELETE"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def remove_cart_item(request, session_token, item_id):
    if not _enabled():
        return _disabled()
    cart = get_object_or_404(EcomCart, session_token=session_token,
                             status=EcomCart.Status.ACTIVE)
    services.remove_item(cart=cart, item_id=int(item_id))
    return Response(CartSerializer(cart).data)


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def checkout(request, session_token):
    """
    POST /api/ecom/cart/<token>/checkout/
    Body: {
      "shipping_address": {...},
      "billing_address": {...},  # optional
      "guest_name": "...", "guest_email": "...", "guest_phone": "...",
      "shipping_total": "0.00",  # optional
      "tax_rate": "0.00"         # optional, e.g. "0.18"
    }
    Returns: full order payload + payment_intent_ref placeholder.
    """
    if not _enabled():
        return _disabled()
    cart = get_object_or_404(EcomCart, session_token=session_token,
                             status=EcomCart.Status.ACTIVE)
    shipping = request.data.get("shipping_address")
    if not isinstance(shipping, dict) or not shipping:
        return Response({"detail": "shipping_address is required."}, status=400)
    billing = request.data.get("billing_address") if isinstance(
        request.data.get("billing_address"), dict) else None

    try:
        shipping_total = _to_decimal(request.data.get("shipping_total", 0), "shipping_total")
        tax_rate = _to_decimal(request.data.get("tax_rate", 0), "tax_rate")
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)

    fulfilment_method = (request.data.get("fulfilment_method") or "delivery").strip()
    if fulfilment_method not in ("delivery", "pickup"):
        return Response({"detail": "fulfilment_method must be 'delivery' or 'pickup'."}, status=400)

    payment_method = (request.data.get("payment_method") or "payhere").strip()
    if payment_method not in ("payhere", "store_cash", "store_card"):
        return Response({"detail": "payment_method must be payhere | store_cash | store_card."}, status=400)

    pickup_outlet_id = request.data.get("pickup_outlet_id")
    if pickup_outlet_id:
        try:
            pickup_outlet_id = int(pickup_outlet_id)
        except (TypeError, ValueError):
            return Response({"detail": "pickup_outlet_id must be an integer."}, status=400)

    try:
        order = services.begin_checkout(
            cart=cart,
            shipping_address=shipping,
            billing_address=billing,
            guest_name=request.data.get("guest_name", "") or "",
            guest_email=request.data.get("guest_email", "") or "",
            guest_phone=request.data.get("guest_phone", "") or "",
            shipping_total=shipping_total,
            tax_rate=tax_rate,
            fulfilment_method=fulfilment_method,
            pickup_outlet_id=pickup_outlet_id,
            payment_method=payment_method,
        )
    except services.CheckoutError as exc:
        return Response({"detail": str(exc)}, status=409)

    return Response(OrderSerializer(order).data, status=201)


# ---------------------------------------------------------------------------
# Order endpoints
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def order_detail(request, number):
    """
    GET /api/ecom/orders/<number>/
    Public — orders are looked up by their unique number. Phase 5 will
    add a per-order access token for tighter privacy if needed.
    """
    if not _enabled():
        return _disabled()
    order = get_object_or_404(EcomOrder, number=number)
    return Response(OrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def confirm_payment(request, number):
    """
    POST /api/ecom/orders/<number>/confirm-payment/
    Admin-gated. Until a gateway is wired (Phase 5+), this is how an order
    is marked PAID — manually by an operator. Idempotent: re-running on
    an already-PAID order is a no-op.

    Body: {"payment_intent_ref": "..."}  (optional)
    """
    if not _enabled():
        return _disabled()
    order = get_object_or_404(EcomOrder, number=number)
    try:
        order = services.payment_committed(
            order=order,
            payment_intent_ref=request.data.get("payment_intent_ref", "") or "",
        )
    except services.PaymentCommitError as exc:
        return Response({"detail": str(exc)}, status=409)
    return Response(OrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def cancel(request, number):
    """POST /api/ecom/orders/<number>/cancel/  body: {"reason": "..."}"""
    if not _enabled():
        return _disabled()
    order = get_object_or_404(EcomOrder, number=number)
    try:
        order = services.cancel_order(
            order=order, reason=request.data.get("reason", "") or "",
        )
    except services.PaymentCommitError as exc:
        return Response({"detail": str(exc)}, status=409)
    return Response(OrderSerializer(order).data)


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def health(request):
    return Response({"ok": True, "enabled": _enabled()})


# ---------------------------------------------------------------------------
# PayHere endpoints
# ---------------------------------------------------------------------------
from . import payhere as ph


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([EcomAnonThrottle])
def payhere_initiate(request, number):
    """
    POST /api/ecom/orders/<number>/payhere/initiate/

    Returns the form fields + checkout URL the storefront should auto-POST
    to PayHere. Anonymous because the customer just placed the order in the
    same browser session — PayHere's hash is what authenticates the request.
    """
    if not _enabled():
        return _disabled()
    if not ph.is_configured():
        return Response({"detail": "PayHere is not configured on this server."}, status=503)
    order = get_object_or_404(EcomOrder, number=number)
    if order.status != EcomOrder.Status.PENDING_PAYMENT:
        return Response(
            {"detail": f"Order is in status {order.status}; cannot initiate payment."},
            status=409,
        )
    if order.payment_method != EcomOrder.PaymentMethod.PAYHERE:
        return Response(
            {"detail": f"Order payment_method is {order.payment_method}, not payhere."},
            status=409,
        )
    return Response({
        "checkout_url": ph.checkout_url(),
        "fields": ph.build_initiate_payload(order),
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def payhere_notify(request):
    """
    POST /api/ecom/payhere/notify/   (server-to-server, called by PayHere)

    Verify md5sig + status_code, then idempotently commit the payment.
    Returns plain "OK" on success — PayHere only checks for HTTP 200.
    """
    if not _enabled():
        return _disabled()
    data = request.data if isinstance(request.data, dict) else dict(request.POST.items())
    if not ph.verify_notify(data):
        return Response({"detail": "invalid signature"}, status=400)

    status_code = (data.get("status_code") or "").strip()
    order_number = data.get("order_id") or ""
    payment_id = data.get("payment_id") or ""

    try:
        order = EcomOrder.objects.get(number=order_number)
    except EcomOrder.DoesNotExist:
        return Response({"detail": "order not found"}, status=404)

    if status_code == ph.STATUS_SUCCESS:
        try:
            services.payment_committed(
                order=order,
                payment_intent_ref=f"payhere:{payment_id}",
            )
            EcomOrder.objects.filter(pk=order.pk).update(payhere_payment_id=payment_id)
        except services.PaymentCommitError as exc:
            # Already-paid is fine; anything else is a real error.
            if "Already" not in str(exc) and "already" not in str(exc):
                return Response({"detail": str(exc)}, status=409)
    elif status_code in (ph.STATUS_FAILED, ph.STATUS_CANCELED):
        # PayHere reports a terminal failure. Mark the order cancelled so
        # reservations are released and stock returns to the available pool.
        try:
            services.cancel_order(order=order, reason=f"payhere:{status_code}")
        except services.PaymentCommitError:
            pass

    return Response({"ok": True})
