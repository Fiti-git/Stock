"""
Cross-trigger services for count sessions.

`finalize_count_session` is the single source of truth for what happens when
a session closes. Three triggers need it, all with the same downstream
effect:

  1. Manual "Close Session" button (apps.dashboard.views.close_count_session)
  2. Cron sweep at 72h (apps.dashboard.tasks.auto_close_stale_count_sessions)
  3. Next-day POS upload (apps.uploads.views.confirm_upload)

Before this existed, only (1) finalized correctly — auto-approving submitted
counts and generating variance records. (2) and (3) just flipped the status
to CLOSED, leaving submitted counts in limbo forever and no variances.
That's how sessions ended up with "0 ✓ / 243 pending" on the dashboard.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.uploads.models import PosSnapshot
from .audit import record_audit, snapshot_stock_count, snapshot_session
from .models import CountSession, StockCount, VarianceRecord


def finalize_count_session(session: CountSession, closed_by=None) -> dict:
    """
    Idempotent close-and-finalize for a single CountSession.

    Steps (inside one transaction):
      1. Auto-approve every still-`submitted` StockCount in this session.
         `approved_by` is set to `closed_by` (None for system-triggered).
      2. Generate VarianceRecord rows for every item in the POS snapshot
         where counted != pos. Uses update_or_create — re-runs are safe.
         SME outlets with no POS upload fall back to Item.on_hand.
      3. Flip `status → CLOSED`, set `closed_by` + `closed_at`.

    Re-finalizing an already-CLOSED session is also safe — step 1 finds
    nothing to approve, step 2 still updates variances if the data has
    shifted, step 3 leaves CLOSED alone (status update is a no-op).

    Returns: {"approved": int, "variances_created": int, "session_id": int}
    """
    snapshots = {
        s.item_id: s for s in
        PosSnapshot.objects
        .filter(outlet=session.outlet, snapshot_date=session.count_date)
        .select_related("item")
    }

    # SME fallback — no POS data uploaded? synthesize from Item.on_hand so
    # the close still produces meaningful variances.
    if not snapshots:
        from apps.items.models import Item as _Item
        active_items = _Item.objects.filter(outlet=session.outlet, status=_Item.Status.ACTIVE)

        class _Pseudo:
            def __init__(self, item):
                self.item_id = item.id
                self.item = item
                self.pos_quantity = item.on_hand or Decimal("0")
                self.cost_price = item.cost_price or None
                self.selling_price = item.sell_price or None

        snapshots = {it.id: _Pseudo(it) for it in active_items}

    summed = {
        row["item_id"]: row["total"] or Decimal("0")
        for row in StockCount.objects.filter(
            outlet=session.outlet,
            count_date=session.count_date,
            session=session,
            approval_status__in=[
                StockCount.ApprovalStatus.SUBMITTED,
                StockCount.ApprovalStatus.APPROVED,
            ],
        ).values("item_id").annotate(total=Sum("actual_qty"))
    }

    approved = 0
    created = 0
    with transaction.atomic():
        before_session = snapshot_session(session) if session.status == CountSession.Status.OPEN else None

        still_submitted = StockCount.objects.filter(
            session=session,
            approval_status=StockCount.ApprovalStatus.SUBMITTED,
        ).select_for_update()
        now = timezone.now()
        for sc in still_submitted:
            before = snapshot_stock_count(sc)
            sc.approval_status = StockCount.ApprovalStatus.APPROVED
            sc.approved_by = closed_by
            sc.approved_at = now
            sc.save(update_fields=["approval_status", "approved_by", "approved_at"])
            record_audit(
                user=closed_by, action="stock_count.approve_on_close", entity=sc,
                before=before, after=snapshot_stock_count(sc),
            )
            approved += 1

        for item_id, snap in snapshots.items():
            counted_qty = summed.get(item_id, Decimal("0"))
            pos_qty = Decimal(snap.pos_quantity)
            variance_qty = counted_qty - pos_qty
            if variance_qty == 0:
                continue
            unit = snap.cost_price or snap.selling_price or Decimal("0")
            variance_value = variance_qty * Decimal(unit or 0)

            _, was_created = VarianceRecord.objects.update_or_create(
                session=session,
                item_id=item_id,
                defaults=dict(
                    outlet=session.outlet,
                    count_date=session.count_date,
                    pos_qty=pos_qty,
                    counted_qty=counted_qty,
                    variance_qty=variance_qty,
                    variance_value=variance_value,
                ),
            )
            if was_created:
                created += 1

        if session.status != CountSession.Status.CLOSED:
            session.status = CountSession.Status.CLOSED
            session.closed_by = closed_by
            session.closed_at = timezone.now()
            session.save(update_fields=["status", "closed_by", "closed_at"])
            if before_session is not None:
                record_audit(
                    user=closed_by, action="count_session.close", entity=session,
                    before=before_session, after=snapshot_session(session),
                    extra={"variance_records_created": created, "approved_on_close": approved},
                )

    return {
        "session_id": session.id,
        "approved": approved,
        "variances_created": created,
    }
