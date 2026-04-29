"""
Stock-effecting operations for StockTransfer state transitions.

Each helper is wrapped in transaction.atomic() and locks the rows it
mutates with select_for_update before writing. Called by views.py.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.items.inventory import apply_movement, consume_fefo
from apps.items.models import Item, ItemBatch, StockMovement

from .models import StockTransfer, StockTransferLine, TransferEvent
from .state_machine import assert_can

S = StockTransfer.Status


def _record_event(transfer, from_status, to_status, user, note="", payload=None):
    return TransferEvent.objects.create(
        transfer=transfer,
        from_status=from_status,
        to_status=to_status,
        actor=user if (user and getattr(user, "is_authenticated", False)) else None,
        note=note or "",
        payload=payload or {},
    )


@transaction.atomic
def request_transfer(transfer, user, note=""):
    """DRAFT → REQUESTED. No stock effect."""
    transfer = StockTransfer.objects.select_for_update().get(pk=transfer.pk)
    assert_can(transfer.status, S.REQUESTED)
    prev = transfer.status
    transfer.status = S.REQUESTED
    transfer.requested_by = user if (user and user.is_authenticated) else None
    transfer.requested_at = timezone.now()
    transfer.save(update_fields=["status", "requested_by", "requested_at", "updated_at"])
    _record_event(transfer, prev, S.REQUESTED, user, note)
    return transfer


@transaction.atomic
def dispatch_transfer(transfer, user, line_overrides=None, note=""):
    """
    REQUESTED → DISPATCHED.

    For each line:
      - Lock source-outlet Item row.
      - If batches exist for the item, consume FEFO and snapshot
        batches_dispatched as [{batch_id, batch_no, expiry_date, qty}].
      - Apply a TRANSFER_OUT StockMovement (qty_change negative) on the
        source outlet.

    `line_overrides` is an optional list of {line_id, qty_dispatched}; any
    line absent from it defaults to qty_requested.
    """
    transfer = StockTransfer.objects.select_for_update().get(pk=transfer.pk)
    assert_can(transfer.status, S.DISPATCHED)

    overrides = {}
    for ov in (line_overrides or []):
        try:
            overrides[int(ov["line_id"])] = Decimal(str(ov.get("qty_dispatched") or 0))
        except (KeyError, TypeError, ValueError):
            continue

    lines = list(
        StockTransferLine.objects.select_for_update()
        .filter(transfer=transfer)
        .select_related("item")
    )
    if not lines:
        raise ValueError("Transfer has no lines to dispatch.")

    src_outlet = transfer.source_outlet
    for line in lines:
        qty = overrides.get(line.id, line.qty_requested)
        qty = Decimal(qty or 0)
        if qty <= 0:
            line.qty_dispatched = Decimal("0")
            line.batches_dispatched = []
            line.save(update_fields=["qty_dispatched", "batches_dispatched"])
            continue

        # Lock the source item row before stock checks.
        src_item = Item.objects.select_for_update().get(pk=line.item_id)
        if (src_item.on_hand or Decimal("0")) < qty:
            raise ValueError(
                f"Insufficient stock for {src_item.item_code}: "
                f"have {src_item.on_hand}, need {qty}"
            )

        # FEFO consume from batches when present (best-effort).
        snapshot = []
        has_batches = ItemBatch.objects.filter(
            item=src_item, is_active=True, qty__gt=0
        ).exists()
        if has_batches:
            try:
                consumed = consume_fefo(
                    item=src_item, qty=qty, user=user,
                    ref_type="StockTransfer", ref_id=transfer.id,
                )
                for b, taken in consumed:
                    snapshot.append({
                        "batch_id": b.id,
                        "batch_no": b.batch_no,
                        "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                        "qty": str(taken),
                    })
            except ValueError:
                # Not enough batched stock — fall through to unbatched.
                snapshot = []

        # Stock-out ledger entry on source outlet.
        apply_movement(
            item=src_item, outlet=src_outlet,
            kind=StockMovement.Kind.TRANSFER_OUT,
            qty_change=-qty,
            user=user,
            unit_cost=line.unit_cost or src_item.cost_price,
            ref_type="StockTransfer", ref_id=transfer.id,
            note=f"TR {transfer.ref_no} → outlet {transfer.dest_outlet_id}",
        )

        line.qty_dispatched = qty
        line.batches_dispatched = snapshot
        if not line.unit_cost:
            line.unit_cost = src_item.cost_price or Decimal("0")
        line.save(update_fields=["qty_dispatched", "batches_dispatched", "unit_cost"])

    prev = transfer.status
    transfer.status = S.DISPATCHED
    transfer.dispatched_by = user if (user and user.is_authenticated) else None
    transfer.dispatched_at = timezone.now()
    transfer.save(update_fields=["status", "dispatched_by", "dispatched_at", "updated_at"])
    _record_event(transfer, prev, S.DISPATCHED, user, note)
    return transfer


def _ensure_dest_item(*, src_item, dest_outlet):
    """
    Get-or-create a corresponding Item at the destination outlet, keyed by
    item_code. Cheap mirror — copies enough fields for stock to flow.
    """
    dest_item, created = Item.objects.get_or_create(
        outlet=dest_outlet,
        item_code=src_item.item_code,
        defaults={
            "item_name": src_item.item_name,
            "category": src_item.category,
            "barcode": src_item.barcode,
            "tax_rate_pct": src_item.tax_rate_pct,
            "sell_price": src_item.sell_price,
            "cost_price": src_item.cost_price,
            "status": src_item.status,
            "is_nbci": src_item.is_nbci,
        },
    )
    return dest_item


@transaction.atomic
def receive_transfer(transfer, lines_received, user, note=""):
    """
    DISPATCHED → RECEIVED or VARIANCE_REVIEW.

    `lines_received` is [{line_id, qty_received}].
    For each line:
      - Locate or create a destination-outlet Item mirroring the source.
      - If the source line had batches_dispatched, recreate ItemBatch rows
        at dest (clone batch_no + expiry, qty pro-rated against received).
        Pooled fallback: when no batch snapshot, create a single ItemBatch
        named TR-{ref_no}-{item_code}.
      - apply_movement(TRANSFER_IN, +qty_received).

    Variance: if any line.qty_received != line.qty_dispatched the
    transfer lands in VARIANCE_REVIEW; else RECEIVED.
    """
    transfer = StockTransfer.objects.select_for_update().get(pk=transfer.pk)
    if transfer.status not in (S.DISPATCHED,):
        raise ValueError(f"Cannot receive from status {transfer.status}")

    qty_by_line = {}
    for r in (lines_received or []):
        try:
            qty_by_line[int(r["line_id"])] = Decimal(str(r.get("qty_received") or 0))
        except (KeyError, TypeError, ValueError):
            continue

    lines = list(
        StockTransferLine.objects.select_for_update()
        .filter(transfer=transfer)
        .select_related("item")
    )
    dest_outlet = transfer.dest_outlet
    today = date.today()
    has_variance = False

    for line in lines:
        qty = qty_by_line.get(line.id, line.qty_dispatched)
        qty = Decimal(qty or 0)
        if qty < 0:
            qty = Decimal("0")

        if qty != (line.qty_dispatched or Decimal("0")):
            has_variance = True

        if qty <= 0:
            line.qty_received = Decimal("0")
            line.save(update_fields=["qty_received"])
            continue

        src_item = Item.objects.get(pk=line.item_id)
        dest_item = _ensure_dest_item(src_item=src_item, dest_outlet=dest_outlet)
        dest_item = Item.objects.select_for_update().get(pk=dest_item.pk)

        # Replicate dispatched batches at destination, scaled to qty actually received.
        snapshot = list(line.batches_dispatched or [])
        total_disp = Decimal("0")
        for s in snapshot:
            try:
                total_disp += Decimal(str(s.get("qty") or 0))
            except Exception:
                pass

        if snapshot and total_disp > 0:
            # Pro-rate received qty across the snapshot (last gets remainder).
            remaining = qty
            for idx, s in enumerate(snapshot):
                src_qty = Decimal(str(s.get("qty") or 0))
                if idx == len(snapshot) - 1:
                    take = remaining
                else:
                    take = (src_qty / total_disp) * qty
                    take = take.quantize(Decimal("0.001"))
                if take <= 0:
                    continue
                exp_raw = s.get("expiry_date")
                expiry = None
                if exp_raw:
                    try:
                        from datetime import datetime as _dt
                        expiry = _dt.fromisoformat(exp_raw).date()
                    except Exception:
                        expiry = None
                batch_no = f"TR-{transfer.ref_no}-{s.get('batch_no') or src_item.item_code}"
                batch, _ = ItemBatch.objects.get_or_create(
                    item=dest_item, batch_no=batch_no,
                    defaults={
                        "expiry_date": expiry,
                        "qty": Decimal("0"),
                        "received_qty": Decimal("0"),
                        "cost_price": line.unit_cost or Decimal("0"),
                        "grn_ref": transfer.ref_no,
                        "received_at": today,
                        "is_active": True,
                    },
                )
                batch.qty = (batch.qty or Decimal("0")) + take
                batch.received_qty = (batch.received_qty or Decimal("0")) + take
                batch.save(update_fields=["qty", "received_qty"])
                remaining -= take
        else:
            # Pooled fallback batch for non-batched receives.
            batch_no = f"TR-{transfer.ref_no}-{src_item.item_code}"
            batch, _ = ItemBatch.objects.get_or_create(
                item=dest_item, batch_no=batch_no,
                defaults={
                    "qty": Decimal("0"),
                    "received_qty": Decimal("0"),
                    "cost_price": line.unit_cost or Decimal("0"),
                    "grn_ref": transfer.ref_no,
                    "received_at": today,
                    "is_active": True,
                },
            )
            batch.qty = (batch.qty or Decimal("0")) + qty
            batch.received_qty = (batch.received_qty or Decimal("0")) + qty
            batch.save(update_fields=["qty", "received_qty"])

        # Stock-in ledger on destination outlet.
        apply_movement(
            item=dest_item, outlet=dest_outlet,
            kind=StockMovement.Kind.TRANSFER_IN,
            qty_change=qty,
            user=user,
            unit_cost=line.unit_cost or src_item.cost_price,
            ref_type="StockTransfer", ref_id=transfer.id,
            note=f"TR {transfer.ref_no} ← outlet {transfer.source_outlet_id}",
        )

        line.qty_received = qty
        line.save(update_fields=["qty_received"])

    new_status = S.VARIANCE_REVIEW if has_variance else S.RECEIVED
    assert_can(transfer.status, new_status)
    prev = transfer.status
    transfer.status = new_status
    transfer.received_by = user if (user and user.is_authenticated) else None
    transfer.received_at = timezone.now()
    transfer.save(update_fields=["status", "received_by", "received_at", "updated_at"])
    _record_event(transfer, prev, new_status, user, note,
                  payload={"variance": has_variance})
    return transfer


@transaction.atomic
def cancel_transfer(transfer, user, reason=""):
    """
    Cancel a transfer. If currently DISPATCHED, reverses the source-outlet
    stock movements (TRANSFER_IN against the source). Refuses if already
    RECEIVED — at that point a counter-transfer is the right tool.
    """
    transfer = StockTransfer.objects.select_for_update().get(pk=transfer.pk)
    if transfer.status in (S.RECEIVED, S.VARIANCE_REVIEW, S.CLOSED, S.CANCELLED):
        raise ValueError(f"Cannot cancel from status {transfer.status}")
    assert_can(transfer.status, S.CANCELLED)

    if transfer.status == S.DISPATCHED:
        # Reverse the source-outlet stock movements.
        for line in StockTransferLine.objects.select_for_update().filter(transfer=transfer):
            qty = Decimal(line.qty_dispatched or 0)
            if qty <= 0:
                continue
            src_item = Item.objects.select_for_update().get(pk=line.item_id)
            apply_movement(
                item=src_item, outlet=transfer.source_outlet,
                kind=StockMovement.Kind.TRANSFER_IN,
                qty_change=qty,
                user=user,
                unit_cost=line.unit_cost or src_item.cost_price,
                ref_type="StockTransferReversal", ref_id=transfer.id,
                note=f"Cancel TR {transfer.ref_no}: {reason}",
            )
            # Restore batch quantities best-effort: bump qty back on each
            # snapshot batch if it still exists.
            for s in (line.batches_dispatched or []):
                bid = s.get("batch_id")
                if not bid:
                    continue
                try:
                    b = ItemBatch.objects.select_for_update().get(pk=bid)
                except ItemBatch.DoesNotExist:
                    continue
                try:
                    take = Decimal(str(s.get("qty") or 0))
                except Exception:
                    take = Decimal("0")
                if take <= 0:
                    continue
                b.qty = (b.qty or Decimal("0")) + take
                b.save(update_fields=["qty", "updated_at"])

    prev = transfer.status
    transfer.status = S.CANCELLED
    transfer.save(update_fields=["status", "updated_at"])
    _record_event(transfer, prev, S.CANCELLED, user, reason,
                  payload={"reason": reason})
    return transfer


@transaction.atomic
def close_transfer(transfer, user, variance_note=""):
    """RECEIVED or VARIANCE_REVIEW → CLOSED. No stock effect."""
    transfer = StockTransfer.objects.select_for_update().get(pk=transfer.pk)
    assert_can(transfer.status, S.CLOSED)
    prev = transfer.status
    transfer.status = S.CLOSED
    transfer.closed_by = user if (user and user.is_authenticated) else None
    transfer.closed_at = timezone.now()
    if variance_note:
        transfer.variance_note = variance_note
    transfer.save(update_fields=[
        "status", "closed_by", "closed_at", "variance_note", "updated_at",
    ])
    _record_event(transfer, prev, S.CLOSED, user, variance_note)
    return transfer
