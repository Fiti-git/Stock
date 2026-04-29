"""
Tests for the inter-outlet stock transfer state machine.

Note: makemigrations/migrate are not run by this agent — these tests
exercise the model + helper layer once migrations are applied.
"""

from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import User
from apps.items.models import Item, ItemBatch
from apps.outlets.models import Outlet

from . import inventory_ops
from .models import StockTransfer, StockTransferLine
from .state_machine import S, can_transition


def _mk_user(name, role="manager", outlet=None):
    u = User.objects.create_user(username=name, password="pw", role=role)
    if outlet:
        u.outlet = outlet
        u.save(update_fields=["outlet"])
    return u


def _mk_item(outlet, code="X1", on_hand=Decimal("100"), cost=Decimal("10")):
    return Item.objects.create(
        outlet=outlet, item_code=code, item_name=f"Item {code}",
        on_hand=on_hand, cost_price=cost, sell_price=cost,
        status=Item.Status.ACTIVE,
    )


def _mk_transfer(src, dst, requested_by, items_qty):
    """items_qty = [(item, qty_requested), ...]"""
    t = StockTransfer.objects.create(
        ref_no=f"TR-TEST-{StockTransfer.objects.count() + 1:04d}",
        source_outlet=src, dest_outlet=dst,
        status=S.DRAFT, created_by=requested_by,
    )
    for it, q in items_qty:
        StockTransferLine.objects.create(
            transfer=t, item=it,
            item_code=it.item_code, item_name=it.item_name,
            qty_requested=Decimal(q),
            unit_cost=it.cost_price,
        )
    return t


class TransferStateMachineTests(TestCase):
    def setUp(self):
        self.src = Outlet.objects.create(outlet_name="SRC")
        self.dst = Outlet.objects.create(outlet_name="DST")
        self.mgr_src = _mk_user("mgr_src", outlet=self.src)
        self.mgr_dst = _mk_user("mgr_dst", outlet=self.dst)
        self.item_src = _mk_item(self.src, code="A1", on_hand=Decimal("50"))
        # Mirror item at dest may not exist yet — receive_transfer creates it.

    def test_create_draft(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        self.assertEqual(t.status, S.DRAFT)
        self.assertEqual(t.lines.count(), 1)

    def test_request_transitions_status(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        inventory_ops.request_transfer(t, self.mgr_src)
        t.refresh_from_db()
        self.assertEqual(t.status, S.REQUESTED)
        self.assertIsNotNone(t.requested_at)

    def test_invalid_transition_raises(self):
        # DRAFT cannot jump straight to RECEIVED.
        self.assertFalse(can_transition(S.DRAFT, S.RECEIVED))
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        with self.assertRaises(ValueError):
            inventory_ops.dispatch_transfer(t, self.mgr_src)

    def test_dispatch_decrements_source_stock(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        inventory_ops.request_transfer(t, self.mgr_src)
        inventory_ops.dispatch_transfer(t, self.mgr_src)
        self.item_src.refresh_from_db()
        self.assertEqual(self.item_src.on_hand, Decimal("40"))
        t.refresh_from_db()
        self.assertEqual(t.status, S.DISPATCHED)

    def test_dispatch_consumes_fefo_when_batches_present(self):
        ItemBatch.objects.create(
            item=self.item_src, batch_no="OLD",
            qty=Decimal("5"), received_qty=Decimal("5"),
            cost_price=Decimal("10"), is_active=True,
        )
        ItemBatch.objects.create(
            item=self.item_src, batch_no="NEW",
            qty=Decimal("10"), received_qty=Decimal("10"),
            cost_price=Decimal("10"), is_active=True,
        )
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "8")])
        inventory_ops.request_transfer(t, self.mgr_src)
        inventory_ops.dispatch_transfer(t, self.mgr_src)
        line = t.lines.first()
        self.assertEqual(len(line.batches_dispatched), 2)

    def test_dispatch_blocked_when_insufficient_stock(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "999")])
        inventory_ops.request_transfer(t, self.mgr_src)
        with self.assertRaises(ValueError):
            inventory_ops.dispatch_transfer(t, self.mgr_src)

    def test_receive_increments_dest_stock(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        inventory_ops.request_transfer(t, self.mgr_src)
        inventory_ops.dispatch_transfer(t, self.mgr_src)
        line = t.lines.first()
        inventory_ops.receive_transfer(
            t, [{"line_id": line.id, "qty_received": "10"}], self.mgr_dst,
        )
        # Dest item should exist now and carry +10.
        dst_item = Item.objects.get(outlet=self.dst, item_code=self.item_src.item_code)
        self.assertEqual(dst_item.on_hand, Decimal("10"))
        t.refresh_from_db()
        self.assertEqual(t.status, S.RECEIVED)

    def test_receive_with_qty_lower_than_dispatched_sets_variance_review(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        inventory_ops.request_transfer(t, self.mgr_src)
        inventory_ops.dispatch_transfer(t, self.mgr_src)
        line = t.lines.first()
        inventory_ops.receive_transfer(
            t, [{"line_id": line.id, "qty_received": "7"}], self.mgr_dst,
        )
        t.refresh_from_db()
        self.assertEqual(t.status, S.VARIANCE_REVIEW)

    def test_cancel_after_dispatch_reverses_source_stock(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        inventory_ops.request_transfer(t, self.mgr_src)
        inventory_ops.dispatch_transfer(t, self.mgr_src)
        self.item_src.refresh_from_db()
        self.assertEqual(self.item_src.on_hand, Decimal("40"))
        inventory_ops.cancel_transfer(t, self.mgr_src, reason="oops")
        self.item_src.refresh_from_db()
        self.assertEqual(self.item_src.on_hand, Decimal("50"))
        t.refresh_from_db()
        self.assertEqual(t.status, S.CANCELLED)

    def test_close_finalizes_transfer(self):
        t = _mk_transfer(self.src, self.dst, self.mgr_src, [(self.item_src, "10")])
        inventory_ops.request_transfer(t, self.mgr_src)
        inventory_ops.dispatch_transfer(t, self.mgr_src)
        line = t.lines.first()
        inventory_ops.receive_transfer(
            t, [{"line_id": line.id, "qty_received": "10"}], self.mgr_dst,
        )
        inventory_ops.close_transfer(t, self.mgr_src, variance_note="ok")
        t.refresh_from_db()
        self.assertEqual(t.status, S.CLOSED)
        self.assertIsNotNone(t.closed_at)
