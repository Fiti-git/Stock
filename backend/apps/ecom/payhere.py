"""
PayHere integration (https://support.payhere.lk/api-&-mobile-sdk/checkout-api).

Single-tenant config via env vars (PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET,
PAYHERE_SANDBOX, PAYHERE_RETURN_URL, PAYHERE_CANCEL_URL, PAYHERE_NOTIFY_URL).
Multi-outlet / per-tenant config can move into apps.pos.PaymentGatewayConfig
later if needed.

Two flows:
  build_initiate_payload(order)   -> returns the form fields the storefront
                                     auto-submits to PayHere's checkout URL.
  verify_notify(payload)          -> validates the md5sig PayHere POSTs to
                                     our notify_url. On success the caller
                                     calls services.payment_committed(order).

Hash formulas (per PayHere docs):

  initiate hash =
    UPPER(MD5( merchant_id + order_id + amount + currency
               + UPPER(MD5(merchant_secret)) ))

  notify hash =
    UPPER(MD5( merchant_id + order_id + amount + currency + status_code
               + UPPER(MD5(merchant_secret)) ))

`amount` must be formatted with exactly two decimal places, no commas.
"""
from decimal import Decimal
import hashlib

from django.conf import settings


def _md5_upper(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest().upper()


def _amount(value) -> str:
    return f"{Decimal(value):.2f}"


def is_configured() -> bool:
    return bool(getattr(settings, "PAYHERE_MERCHANT_ID", "")
                and getattr(settings, "PAYHERE_MERCHANT_SECRET", ""))


def checkout_url() -> str:
    sandbox = getattr(settings, "PAYHERE_SANDBOX", True)
    return ("https://sandbox.payhere.lk/pay/checkout"
            if sandbox else "https://www.payhere.lk/pay/checkout")


def build_initiate_payload(order) -> dict:
    """
    Return the form fields the storefront submits via auto-POST to
    `checkout_url()`. Customer is redirected to PayHere, pays, and we
    receive a server-to-server notify_url POST.
    """
    if not is_configured():
        raise RuntimeError("PayHere is not configured (PAYHERE_MERCHANT_ID / SECRET missing)")

    merchant_id = settings.PAYHERE_MERCHANT_ID
    merchant_secret = settings.PAYHERE_MERCHANT_SECRET
    currency = order.currency or "LKR"
    amount_str = _amount(order.grand_total or 0)

    secret_md5 = _md5_upper(merchant_secret)
    hash_value = _md5_upper(
        f"{merchant_id}{order.number}{amount_str}{currency}{secret_md5}"
    )

    addr = order.shipping_address or {}
    first_name = (order.guest_name or addr.get("recipient_name") or "Customer").split(" ", 1)[0]
    last_name = " ".join((order.guest_name or addr.get("recipient_name") or "").split(" ")[1:]) or "."

    return {
        "merchant_id": merchant_id,
        "return_url": getattr(settings, "PAYHERE_RETURN_URL", ""),
        "cancel_url": getattr(settings, "PAYHERE_CANCEL_URL", ""),
        "notify_url": getattr(settings, "PAYHERE_NOTIFY_URL", ""),
        "order_id": order.number,
        "items": ", ".join(
            f"{l.item_name_snapshot} x{l.qty}" for l in order.lines.all()[:5]
        )[:200] or order.number,
        "currency": currency,
        "amount": amount_str,
        "first_name": first_name,
        "last_name": last_name,
        "email": order.guest_email or "",
        "phone": order.guest_phone or addr.get("phone", ""),
        "address": addr.get("line1", ""),
        "city": addr.get("city", ""),
        "country": addr.get("country", "Sri Lanka"),
        "hash": hash_value,
    }


def verify_notify(data: dict) -> bool:
    """
    Verify PayHere's notify_url POST. Returns True if hash + status match.
    The caller should then load the order, idempotently flip it to PAID,
    and write the ledger row.
    """
    if not is_configured():
        return False

    merchant_id = data.get("merchant_id", "")
    order_id = data.get("order_id", "")
    amount_str = data.get("payhere_amount", "")
    currency = data.get("payhere_currency", "")
    status_code = data.get("status_code", "")
    received_sig = (data.get("md5sig") or "").upper()

    if merchant_id != settings.PAYHERE_MERCHANT_ID:
        return False

    secret_md5 = _md5_upper(settings.PAYHERE_MERCHANT_SECRET)
    expected = _md5_upper(
        f"{merchant_id}{order_id}{amount_str}{currency}{status_code}{secret_md5}"
    )
    return expected == received_sig


# PayHere status codes — only "2" is success.
STATUS_SUCCESS = "2"
STATUS_PENDING = "0"
STATUS_CANCELED = "-1"
STATUS_FAILED = "-2"
STATUS_CHARGEDBACK = "-3"
