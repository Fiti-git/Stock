"""
Producer signals — feed the stock_movements ledger from existing line tables.

Safety contract:
  1. Every handler is gated by settings.INVENTORY_LEDGER_ENABLED. When False
     (the default), handlers no-op. Live system is unaffected.
  2. Every write is wrapped in transaction.on_commit() so the parent save
     succeeds independent of any ledger error.
  3. Every write is idempotent on (source_table, source_id, movement_type)
     via a UNIQUE constraint — replays from a backfill or re-fired signal
     cannot double-count.
  4. Errors are logged, not raised. The producer's flow is never blocked
     by a ledger failure during the rollout window.
  5. Signals only handle CREATE events (created=True). Existing rows are
     migrated via the backfill management command.
"""
import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import StockMovement

logger = logging.getLogger(__name__)


def _enabled() -> bool:
    return getattr(settings, "INVENTORY_LEDGER_ENABLED", False)


def _resolve_item_id(outlet_id, item_code):
    """Most line tables store item_code (string), not item FK. Resolve once."""
    from apps.items.models import Item
    return (
        Item.objects.filter(outlet_id=outlet_id, item_code=item_code)
        .values_list("id", flat=True)
        .first()
    )


def _safe_create(**kwargs):
    """Insert one movement; swallow duplicate-key errors (idempotency)."""
    try:
        StockMovement.objects.create(**kwargs)
    except IntegrityError:
        # UNIQUE(source_table, source_id, movement_type) — already recorded.
        pass
    except Exception:
        logger.exception("inventory.signals: failed to record movement %s", kwargs)


def _record(qty_sign, movement_type, outlet_id, item_id, source_table, source_id,
            moved_at, unit_cost=None, source_doc="", user_id=None):
    """Defer the insert until after the producer's transaction commits."""
    if item_id is None:
        return
    payload = dict(
        outlet_id=outlet_id,
        item_id=item_id,
        qty=qty_sign,
        movement_type=movement_type,
        source_table=source_table,
        source_id=source_id,
        source_doc=source_doc,
        unit_cost=unit_cost,
        moved_at=moved_at,
        created_by_id=user_id,
    )
    transaction.on_commit(lambda: _safe_create(**payload))


# ---------------------------------------------------------------------------
# Producers — one handler per line model.
# ---------------------------------------------------------------------------
def _coerce_moved_at(line, fallback_attr="txn_date"):
    """Build a tz-aware datetime from a date field on the line, or now()."""
    raw = getattr(line, fallback_attr, None)
    if raw is None:
        return timezone.now()
    if hasattr(raw, "hour"):
        return raw if timezone.is_aware(raw) else timezone.make_aware(raw)
    # plain date — combine with min time
    from datetime import datetime
    dt = datetime.combine(raw, datetime.min.time())
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt


def _connect():
    """Lazy-bind signals so apps that own these models load first."""
    from apps.uploads.models import (
        GrnLine, SalesLine, DamageLine, OfficeLine, RtsLine, SalesReturnLine,
    )
    from apps.dashboard.models import StockCount

    @receiver(post_save, sender=GrnLine, dispatch_uid="ledger_grn")
    def on_grn(sender, instance, created, **kwargs):
        if not (created and _enabled()):
            return
        item_id = _resolve_item_id(instance.outlet_id, instance.item_code)
        _record(
            qty_sign=instance.qty,
            movement_type=StockMovement.MovementType.GRN,
            outlet_id=instance.outlet_id,
            item_id=item_id,
            source_table="grn_lines",
            source_id=instance.id,
            source_doc=instance.do_no or "",
            unit_cost=instance.cost_price,
            moved_at=_coerce_moved_at(instance),
        )

    @receiver(post_save, sender=SalesLine, dispatch_uid="ledger_sale")
    def on_sale(sender, instance, created, **kwargs):
        if not (created and _enabled()):
            return
        item_id = _resolve_item_id(instance.outlet_id, instance.item_code)
        _record(
            qty_sign=-instance.qty,
            movement_type=StockMovement.MovementType.SALE,
            outlet_id=instance.outlet_id,
            item_id=item_id,
            source_table="sales_lines",
            source_id=instance.id,
            source_doc=instance.invoice_no or "",
            unit_cost=instance.cost_price,
            moved_at=_coerce_moved_at(instance),
        )

    @receiver(post_save, sender=SalesReturnLine, dispatch_uid="ledger_sales_return")
    def on_sales_return(sender, instance, created, **kwargs):
        if not (created and _enabled()):
            return
        item_id = _resolve_item_id(instance.outlet_id, instance.item_code)
        _record(
            qty_sign=instance.qty,
            movement_type=StockMovement.MovementType.SALES_RETURN,
            outlet_id=instance.outlet_id,
            item_id=item_id,
            source_table="sales_return_lines",
            source_id=instance.id,
            source_doc=instance.invoice_no or "",
            unit_cost=instance.cost_price,
            moved_at=_coerce_moved_at(instance),
        )

    @receiver(post_save, sender=DamageLine, dispatch_uid="ledger_damage")
    def on_damage(sender, instance, created, **kwargs):
        if not (created and _enabled()):
            return
        item_id = _resolve_item_id(instance.outlet_id, instance.item_code)
        _record(
            qty_sign=-instance.qty,
            movement_type=StockMovement.MovementType.DAMAGE,
            outlet_id=instance.outlet_id,
            item_id=item_id,
            source_table="damage_lines",
            source_id=instance.id,
            source_doc=instance.doc_no or "",
            unit_cost=instance.cost_price,
            moved_at=_coerce_moved_at(instance),
        )

    @receiver(post_save, sender=OfficeLine, dispatch_uid="ledger_office")
    def on_office(sender, instance, created, **kwargs):
        if not (created and _enabled()):
            return
        item_id = _resolve_item_id(instance.outlet_id, instance.item_code)
        _record(
            qty_sign=-instance.qty,
            movement_type=StockMovement.MovementType.OFFICE_USE,
            outlet_id=instance.outlet_id,
            item_id=item_id,
            source_table="office_lines",
            source_id=instance.id,
            source_doc=instance.doc_no or "",
            unit_cost=instance.cost_price,
            moved_at=_coerce_moved_at(instance),
        )

    @receiver(post_save, sender=RtsLine, dispatch_uid="ledger_rts")
    def on_rts(sender, instance, created, **kwargs):
        if not (created and _enabled()):
            return
        item_id = _resolve_item_id(instance.outlet_id, instance.item_code)
        _record(
            qty_sign=-instance.qty,
            movement_type=StockMovement.MovementType.RTS,
            outlet_id=instance.outlet_id,
            item_id=item_id,
            source_table="rts_lines",
            source_id=instance.id,
            source_doc=instance.do_no or "",
            unit_cost=instance.cost_price,
            moved_at=_coerce_moved_at(instance),
        )

    @receiver(post_save, sender=StockCount, dispatch_uid="ledger_count_adjust")
    def on_count(sender, instance, created, **kwargs):
        """
        Count adjustments fire only when a count is APPROVED. The variance
        delta = approved actual_qty − system on_hand at counted_at. We
        compute the delta once here using the ledger itself. Idempotent:
        UNIQUE(source_table, source_id, movement_type) blocks duplicates.
        """
        if not _enabled():
            return
        if instance.approval_status != "approved":
            return
        try:
            from django.db.models import Sum
            on_hand = (
                StockMovement.objects
                .filter(outlet_id=instance.outlet_id, item_id=instance.item_id,
                        moved_at__lte=instance.counted_at)
                .aggregate(s=Sum("qty"))["s"] or 0
            )
            delta = instance.actual_qty - on_hand
            if delta == 0:
                return
            _record(
                qty_sign=delta,
                movement_type=StockMovement.MovementType.COUNT_ADJUST,
                outlet_id=instance.outlet_id,
                item_id=instance.item_id,
                source_table="stock_counts",
                source_id=instance.id,
                source_doc=f"count#{instance.id}",
                unit_cost=None,
                moved_at=instance.counted_at or timezone.now(),
                user_id=getattr(instance, "approved_by_id", None) or getattr(instance, "counted_by_id", None),
            )
        except Exception:
            logger.exception("inventory.signals.on_count failed for count %s", instance.id)


# Connect on import. Handlers themselves still respect the feature flag.
try:
    _connect()
except Exception:
    logger.exception("inventory.signals: failed to connect (will retry on next import)")
