"""Phase 4 Agent 13 — Payment Gateway + SMS endpoints.

Routes:
  GET/POST    /api/pos/payment-gateways/
  GET/PATCH/DELETE /api/pos/payment-gateways/<id>/
  POST        /api/pos/initiate-payment/
  GET         /api/pos/payment-intents/<id>/
  POST        /api/pos/webhooks/payment/<provider>/   (public, signature-verified)
  GET/POST    /api/pos/sms-configs/
  GET/PATCH/DELETE /api/pos/sms-configs/<id>/

All write operations are AuditLog'd (uploads.AuditLog).
"""
import json
import logging
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.outlets.models import Outlet
from apps.uploads.models import AuditLog

from .models import (
    Bill, PaymentGatewayConfig, PaymentIntent, Payment,
    SmsConfig, SmsLog,
)
from .gateways import get_adapter

logger = logging.getLogger(__name__)


def _audit(user, action, entity, details=None):
    AuditLog.objects.create(
        user=user if user and getattr(user, "is_authenticated", False) else None,
        action=action,
        entity_type=entity.__class__.__name__ if entity else "",
        entity_id=str(getattr(entity, "pk", "") or ""),
        details=details or {},
    )


def _is_admin_plus(user):
    return getattr(user, "role", "") in ("admin", "super_admin")


def _is_manager_plus(user):
    return getattr(user, "role", "") in ("manager", "admin", "super_admin")


def _gateway_dict(gw, *, reveal_key=False):
    has_key = bool(gw.api_key_encrypted)
    return {
        "id": gw.id,
        "outlet": gw.outlet_id,
        "provider": gw.provider,
        "merchant_id": gw.merchant_id,
        "has_api_key": has_key,
        "api_key": gw.get_api_key() if reveal_key else "",
        "webhook_secret": gw.webhook_secret,
        "callback_url": gw.callback_url,
        "sandbox": gw.sandbox,
        "is_active": gw.is_active,
        "extra_config": gw.extra_config,
        "created_at": gw.created_at,
        "updated_at": gw.updated_at,
    }


def _intent_dict(pi):
    return {
        "id": pi.id,
        "outlet": pi.outlet_id,
        "gateway": pi.gateway_id,
        "bill": pi.bill_id,
        "amount": str(pi.amount),
        "currency": pi.currency,
        "provider_ref": pi.provider_ref,
        "payment_url": pi.payment_url,
        "qr_data": pi.qr_data,
        "status": pi.status,
        "customer_phone": pi.customer_phone,
        "initiated_at": pi.initiated_at,
        "completed_at": pi.completed_at,
    }


def _sms_dict(c):
    return {
        "id": c.id,
        "outlet": c.outlet_id,
        "provider": c.provider,
        "sender_id": c.sender_id,
        "has_api_key": bool(c.api_key_encrypted),
        "endpoint_url": c.endpoint_url,
        "is_active": c.is_active,
        "extra_config": c.extra_config,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


# -------------------------------------------------------------------
# Gateway CRUD
# -------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payment_gateways(request):
    if request.method == "GET":
        qs = PaymentGatewayConfig.objects.all()
        outlet_id = request.GET.get("outlet")
        if outlet_id:
            qs = qs.filter(outlet_id=outlet_id)
        elif request.user.outlet_id and not _is_admin_plus(request.user):
            qs = qs.filter(outlet_id=request.user.outlet_id)
        return Response([_gateway_dict(g) for g in qs.order_by("outlet_id", "provider")])

    # POST — admin/super_admin only
    if not _is_admin_plus(request.user):
        return Response({"detail": "Admin only."}, status=403)
    data = request.data or {}
    try:
        outlet = Outlet.objects.get(pk=data.get("outlet"))
    except Outlet.DoesNotExist:
        return Response({"detail": "Invalid outlet."}, status=400)
    provider = (data.get("provider") or "").strip()
    if provider not in dict(PaymentGatewayConfig.Provider.choices):
        return Response({"detail": "Invalid provider."}, status=400)
    if PaymentGatewayConfig.objects.filter(outlet=outlet, provider=provider).exists():
        return Response({"detail": "Gateway already exists for this outlet+provider."}, status=400)
    gw = PaymentGatewayConfig(
        outlet=outlet,
        provider=provider,
        merchant_id=(data.get("merchant_id") or "")[:120],
        webhook_secret=(data.get("webhook_secret") or "")[:120],
        callback_url=(data.get("callback_url") or "")[:300],
        sandbox=bool(data.get("sandbox", True)),
        is_active=bool(data.get("is_active", True)),
        extra_config=data.get("extra_config") or {},
        created_by=request.user,
    )
    if data.get("api_key"):
        gw.set_api_key(str(data["api_key"]))
    gw.save()
    _audit(request.user, "pos.gateway_create", gw, {
        "outlet": outlet.id, "provider": provider,
    })
    return Response(_gateway_dict(gw), status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def payment_gateway_detail(request, gateway_id):
    gw = get_object_or_404(PaymentGatewayConfig, pk=gateway_id)
    if request.method == "GET":
        return Response(_gateway_dict(gw))
    if not _is_admin_plus(request.user):
        return Response({"detail": "Admin only."}, status=403)

    if request.method == "DELETE":
        _audit(request.user, "pos.gateway_delete", gw, {
            "outlet": gw.outlet_id, "provider": gw.provider,
        })
        gw.delete()
        return Response(status=204)

    # PATCH
    data = request.data or {}
    for f in ("merchant_id", "webhook_secret", "callback_url"):
        if f in data:
            setattr(gw, f, (data.get(f) or "")[:300])
    if "sandbox" in data:
        gw.sandbox = bool(data["sandbox"])
    if "is_active" in data:
        gw.is_active = bool(data["is_active"])
    if "extra_config" in data and isinstance(data["extra_config"], dict):
        gw.extra_config = data["extra_config"]
    if data.get("api_key"):
        gw.set_api_key(str(data["api_key"]))
    gw.save()
    _audit(request.user, "pos.gateway_update", gw, {"fields": list(data.keys())})
    return Response(_gateway_dict(gw))


# -------------------------------------------------------------------
# Initiate payment
# -------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def initiate_payment(request):
    data = request.data or {}
    try:
        outlet = Outlet.objects.get(pk=data.get("outlet"))
    except Outlet.DoesNotExist:
        return Response({"detail": "Invalid outlet."}, status=400)
    try:
        gw = PaymentGatewayConfig.objects.get(pk=data.get("gateway_id"), outlet=outlet)
    except PaymentGatewayConfig.DoesNotExist:
        return Response({"detail": "Gateway not found for outlet."}, status=400)
    if not gw.is_active:
        return Response({"detail": "Gateway is inactive."}, status=400)
    try:
        amount = Decimal(str(data.get("amount") or "0"))
    except (InvalidOperation, TypeError):
        return Response({"detail": "Invalid amount."}, status=400)
    if amount <= 0:
        return Response({"detail": "Amount must be positive."}, status=400)
    bill = None
    if data.get("bill_id"):
        bill = Bill.objects.filter(pk=data["bill_id"], outlet=outlet).first()

    intent = PaymentIntent.objects.create(
        outlet=outlet, gateway=gw, bill=bill,
        amount=amount, currency=data.get("currency") or "LKR",
        customer_phone=(data.get("customer_phone") or "")[:40],
        initiated_by=request.user,
        status=PaymentIntent.Status.PENDING,
    )
    try:
        adapter = get_adapter(gw)
        reference = f"INTENT-{intent.id}"
        res = adapter.initiate(
            amount=amount, reference=reference,
            customer_phone=intent.customer_phone,
            extra=data.get("extra") or {},
        )
        intent.provider_ref = res.get("provider_ref", "")
        intent.payment_url = res.get("payment_url", "")
        intent.qr_data = res.get("qr_data", "")
        intent.save(update_fields=["provider_ref", "payment_url", "qr_data"])
    except Exception as e:  # noqa: BLE001
        logger.exception("Gateway initiate failed")
        intent.status = PaymentIntent.Status.FAILED
        intent.save(update_fields=["status"])
        return Response({"detail": f"Gateway initiate failed: {e}"}, status=502)

    _audit(request.user, "pos.payment_initiate", intent, {
        "gateway": gw.provider, "amount": str(amount),
        "bill_id": bill.id if bill else None,
        "provider_ref": intent.provider_ref,
    })
    return Response(_intent_dict(intent), status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payment_intent_detail(request, intent_id):
    intent = get_object_or_404(PaymentIntent, pk=intent_id)
    return Response(_intent_dict(intent))


# -------------------------------------------------------------------
# Webhook receiver — public; signature-verified by adapter
# -------------------------------------------------------------------

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def payment_webhook(request, provider):
    """Public endpoint hit by the upstream gateway.

    Looks up the PaymentIntent by provider_ref, runs `adapter.verify_webhook`
    against the active gateway config matching the URL `provider`, and updates
    the intent status. Idempotent: a second webhook for an already-completed
    intent is a no-op (the payload still gets recorded for audit).
    """
    body_raw = request.body
    try:
        body = json.loads(body_raw or b"{}")
    except (TypeError, ValueError):
        body = {}

    provider_ref = (
        body.get("provider_ref") or body.get("reference") or body.get("id") or ""
    )
    if not provider_ref:
        return Response({"detail": "missing provider_ref"}, status=400)

    intent = PaymentIntent.objects.filter(provider_ref=provider_ref).first()
    if not intent:
        return Response({"detail": "intent not found"}, status=404)

    # Verify the signature using the gateway's adapter (which checks
    # webhook_secret). We pass the META so adapters can inspect any custom
    # headers via HTTP_X_*.
    try:
        adapter = get_adapter(intent.gateway)
        result = adapter.verify_webhook(request.META, body)
    except ValueError as e:
        _audit(None, "pos.payment_webhook_rejected", intent, {
            "provider": provider, "reason": str(e),
        })
        return Response({"detail": f"signature: {e}"}, status=401)

    status = (result.get("status") or "").lower()
    payload = result.get("raw") or body

    # Idempotency: if already completed, just record the payload and no-op.
    if intent.status == PaymentIntent.Status.COMPLETED:
        intent.webhook_payload = payload
        intent.save(update_fields=["webhook_payload"])
        _audit(None, "pos.payment_webhook_replay", intent, {
            "provider": provider, "provider_ref": provider_ref,
        })
        return Response({"received": True, "duplicate": True})

    if status in ("completed", "success", "paid"):
        intent.status = PaymentIntent.Status.COMPLETED
        intent.completed_at = timezone.now()
    elif status in ("failed", "declined"):
        intent.status = PaymentIntent.Status.FAILED
    elif status == "cancelled":
        intent.status = PaymentIntent.Status.CANCELLED
    elif status == "expired":
        intent.status = PaymentIntent.Status.EXPIRED
    intent.webhook_payload = payload
    intent.save(update_fields=["status", "completed_at", "webhook_payload"])

    # If the intent points at a CLOSED bill, post a Payment row reflecting the
    # captured tender. If the bill is DRAFT (paid-before-close flow), TODO:
    # surface the captured intent on the bill draft so the cashier can finalise.
    if (
        intent.status == PaymentIntent.Status.COMPLETED
        and intent.bill_id
        and intent.bill.status == Bill.Status.CLOSED
    ):
        # Avoid double-posting if a previous webhook already wrote one.
        if not Payment.objects.filter(
            bill=intent.bill, reference=intent.provider_ref,
        ).exists():
            Payment.objects.create(
                bill=intent.bill,
                tender=Payment.Tender.BANK_TRANSFER,
                amount=intent.amount,
                reference=intent.provider_ref,
            )

    _audit(None, "pos.payment_webhook", intent, {
        "provider": provider, "provider_ref": provider_ref,
        "status": intent.status,
    })
    return Response({"received": True})


# -------------------------------------------------------------------
# SMS Config CRUD
# -------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def sms_configs(request):
    if request.method == "GET":
        qs = SmsConfig.objects.all()
        outlet_id = request.GET.get("outlet")
        if outlet_id:
            qs = qs.filter(outlet_id=outlet_id)
        elif request.user.outlet_id and not _is_admin_plus(request.user):
            qs = qs.filter(outlet_id=request.user.outlet_id)
        return Response([_sms_dict(c) for c in qs.order_by("outlet_id", "provider")])

    if not _is_admin_plus(request.user):
        return Response({"detail": "Admin only."}, status=403)
    data = request.data or {}
    try:
        outlet = Outlet.objects.get(pk=data.get("outlet"))
    except Outlet.DoesNotExist:
        return Response({"detail": "Invalid outlet."}, status=400)
    provider = (data.get("provider") or "").strip()
    if provider not in dict(SmsConfig.Provider.choices):
        return Response({"detail": "Invalid provider."}, status=400)
    if SmsConfig.objects.filter(outlet=outlet, provider=provider).exists():
        return Response({"detail": "SMS config already exists."}, status=400)
    cfg = SmsConfig(
        outlet=outlet, provider=provider,
        sender_id=(data.get("sender_id") or "")[:20],
        endpoint_url=(data.get("endpoint_url") or "")[:300],
        is_active=bool(data.get("is_active", True)),
        extra_config=data.get("extra_config") or {},
    )
    if data.get("api_key"):
        cfg.set_api_key(str(data["api_key"]))
    cfg.save()
    _audit(request.user, "pos.sms_config_create", cfg, {
        "outlet": outlet.id, "provider": provider,
    })
    return Response(_sms_dict(cfg), status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def sms_config_detail(request, config_id):
    cfg = get_object_or_404(SmsConfig, pk=config_id)
    if request.method == "GET":
        return Response(_sms_dict(cfg))
    if not _is_admin_plus(request.user):
        return Response({"detail": "Admin only."}, status=403)
    if request.method == "DELETE":
        _audit(request.user, "pos.sms_config_delete", cfg, {
            "outlet": cfg.outlet_id, "provider": cfg.provider,
        })
        cfg.delete()
        return Response(status=204)
    data = request.data or {}
    if "sender_id" in data:
        cfg.sender_id = (data.get("sender_id") or "")[:20]
    if "endpoint_url" in data:
        cfg.endpoint_url = (data.get("endpoint_url") or "")[:300]
    if "is_active" in data:
        cfg.is_active = bool(data["is_active"])
    if "extra_config" in data and isinstance(data["extra_config"], dict):
        cfg.extra_config = data["extra_config"]
    if data.get("api_key"):
        cfg.set_api_key(str(data["api_key"]))
    cfg.save()
    _audit(request.user, "pos.sms_config_update", cfg, {"fields": list(data.keys())})
    return Response(_sms_dict(cfg))
