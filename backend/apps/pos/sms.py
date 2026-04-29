"""SMS receipt sender.

Public entrypoint: ``send_sms_for_bill(bill_id)``.

If Celery is installed it is decorated as a ``@shared_task`` so callers can
run it asynchronously via ``send_sms_for_bill.delay(bill_id)``. If not, the
function is plain and runs synchronously — callers should wrap it in
``transaction.on_commit(...)`` so a failed send never rolls back the bill.
"""
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)


def render_bill_sms(bill):
    """Compose the customer-facing receipt SMS body. Aim ≤ 160 chars."""
    customer = getattr(bill, "customer", None)
    pts = getattr(customer, "loyalty_points", None) if customer else None
    parts = [
        f"Thank you! Bill {bill.bill_no}",
        f"Total LKR {bill.grand_total}",
    ]
    if bill.paid_total and bill.paid_total != bill.grand_total:
        parts.append(f"Paid {bill.paid_total}")
    if pts is not None:
        parts.append(f"Pts: {pts}")
    return ". ".join(parts) + "."


def send_sms_for_bill(bill_id):
    """Queue+send the receipt SMS for a closed bill.

    Best-effort — any exception is logged and swallowed; never raised, so a
    bill commit is never undone by a downstream SMS hiccup.
    """
    # Local imports avoid circular-import at module load (models depends on
    # nothing that imports this module, but `views` does).
    from .models import Bill, SmsConfig, SmsLog
    from .sms_providers import get_sms_adapter

    try:
        bill = Bill.objects.select_related("customer", "outlet").get(pk=bill_id)
    except Bill.DoesNotExist:
        logger.warning("send_sms_for_bill: bill %s not found", bill_id)
        return

    phone = bill.customer_phone or (bill.customer.phone if bill.customer_id else "")
    if not phone:
        return  # no destination; quiet skip
    config = SmsConfig.objects.filter(outlet=bill.outlet, is_active=True).first()
    if not config:
        return  # outlet hasn't configured SMS

    body = render_bill_sms(bill)
    log = SmsLog.objects.create(
        outlet=bill.outlet, config=config, bill=bill,
        to_phone=phone, body=body, status=SmsLog.Status.QUEUED,
    )
    try:
        adapter = get_sms_adapter(config)
        result = adapter.send(to_phone=phone, body=body)
        log.provider_ref = result.get("provider_ref", "")
        log.status = SmsLog.Status.SENT
        log.sent_at = timezone.now()
        log.save(update_fields=["provider_ref", "status", "sent_at"])
    except Exception as e:  # noqa: BLE001 — best-effort
        logger.exception("SMS send failed for bill %s", bill_id)
        log.status = SmsLog.Status.FAILED
        log.error = str(e)[:500]
        log.save(update_fields=["status", "error"])


# If Celery is installed, expose the function as a shared task so production
# can dispatch it via the broker. Otherwise leave it as a plain callable.
try:  # pragma: no cover — depends on environment
    from celery import shared_task  # type: ignore
    send_sms_for_bill = shared_task(send_sms_for_bill)
except Exception:
    pass
