"""
Phase A tests for the count approval + variance reconciliation workflow.

Run with:
    python manage.py test apps.dashboard
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.outlets.models import Outlet
from apps.items.models import Item
from apps.uploads.models import PosSnapshot, AuditLog

from .models import StockCount, CountSession, VarianceRecord


class _Setup(TestCase):
    def setUp(self):
        self.outlet = Outlet.objects.create(outlet_name="Main")
        self.manager = User.objects.create_user(
            username="mgr", password="x", role=User.Role.MANAGER, outlet=self.outlet,
        )
        self.store_user = User.objects.create_user(
            username="sup", password="x", role=User.Role.STORE_USER, outlet=self.outlet,
        )
        self.item = Item.objects.create(outlet=self.outlet, item_code="SKU1", item_name="Widget")
        self.today = date.today()
        PosSnapshot.objects.create(
            outlet=self.outlet, item=self.item, snapshot_date=self.today,
            pos_quantity=Decimal("10"), cost_price=Decimal("2.00"), selling_price=Decimal("3.00"),
        )

    def mgr_client(self):
        c = APIClient()
        c.force_authenticate(self.manager)
        return c

    def user_client(self):
        c = APIClient()
        c.force_authenticate(self.store_user)
        return c


class SubmitCountTests(_Setup):
    def test_submit_creates_submitted_count_and_session(self):
        c = self.user_client()
        res = c.post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "8.000",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        sc = StockCount.objects.get()
        self.assertEqual(sc.approval_status, StockCount.ApprovalStatus.SUBMITTED)
        self.assertIsNotNone(sc.session_id)
        self.assertIsNotNone(sc.submitted_at)
        session = CountSession.objects.get()
        self.assertEqual(session.status, CountSession.Status.OPEN)
        self.assertEqual(session.outlet, self.outlet)
        self.assertEqual(session.count_date, self.today)

    def test_submit_rejects_negative_qty(self):
        c = self.user_client()
        res = c.post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "-1",
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_submit_upserts_same_location(self):
        c = self.user_client()
        r1 = c.post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "5", "location_tag": "A",
        }, format="json")
        self.assertEqual(r1.status_code, 201)
        r2 = c.post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "7", "location_tag": "A",
        }, format="json")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(StockCount.objects.count(), 1)
        self.assertEqual(StockCount.objects.get().actual_qty, Decimal("7.000"))

    def test_submit_flags_outlier(self):
        c = self.user_client()
        res = c.post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "9999",
        }, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(StockCount.objects.get().flagged_outlier)

    def test_submit_preserves_mobile_response_shape(self):
        c = self.user_client()
        res = c.post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "5",
        }, format="json")
        # Mobile expects id + item_id + actual_qty at minimum; new fields are additive
        for key in ("id", "item_id", "actual_qty", "count_date"):
            self.assertIn(key, res.data)


class ApproveRejectTests(_Setup):
    def _make_submitted(self):
        self.user_client().post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "8",
        }, format="json")
        return StockCount.objects.get()

    def test_manager_can_approve(self):
        sc = self._make_submitted()
        c = self.mgr_client()
        res = c.post(f"/api/dashboard/counts/{sc.id}/approve/")
        self.assertEqual(res.status_code, 200, res.data)
        sc.refresh_from_db()
        self.assertEqual(sc.approval_status, StockCount.ApprovalStatus.APPROVED)
        self.assertEqual(sc.approved_by, self.manager)
        self.assertTrue(AuditLog.objects.filter(action="stock_count.approve").exists())

    def test_store_user_cannot_approve(self):
        sc = self._make_submitted()
        c = self.user_client()
        res = c.post(f"/api/dashboard/counts/{sc.id}/approve/")
        self.assertEqual(res.status_code, 403)

    def test_reject_requires_reason(self):
        sc = self._make_submitted()
        c = self.mgr_client()
        res = c.post(f"/api/dashboard/counts/{sc.id}/reject/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        res = c.post(f"/api/dashboard/counts/{sc.id}/reject/", {"reason": "bad count"}, format="json")
        self.assertEqual(res.status_code, 200)
        sc.refresh_from_db()
        self.assertEqual(sc.approval_status, StockCount.ApprovalStatus.REJECTED)
        self.assertEqual(sc.rejection_reason, "bad count")

    def test_audit_captures_before_and_after(self):
        sc = self._make_submitted()
        self.mgr_client().post(f"/api/dashboard/counts/{sc.id}/approve/")
        log = AuditLog.objects.get(action="stock_count.approve")
        self.assertIn("before", log.details)
        self.assertIn("after", log.details)
        self.assertEqual(log.details["before"]["approval_status"], "submitted")
        self.assertEqual(log.details["after"]["approval_status"], "approved")

    def test_bulk_approve(self):
        ids = []
        for qty in ["5", "6", "7"]:
            # Three different locations, single item
            self.user_client().post("/api/dashboard/counts/", {
                "item_id": self.item.id, "actual_qty": qty, "location_tag": f"L{qty}",
            }, format="json")
        ids = list(StockCount.objects.values_list("id", flat=True))
        c = self.mgr_client()
        res = c.post("/api/dashboard/counts/bulk-approve/", {"ids": ids}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 3)
        self.assertEqual(
            StockCount.objects.filter(approval_status="approved").count(), 3
        )


class SessionCloseTests(_Setup):
    def test_close_generates_variance_records(self):
        self.user_client().post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "7",  # POS = 10, variance = -3
        }, format="json")
        session = CountSession.objects.get()

        c = self.mgr_client()
        res = c.post(f"/api/dashboard/count-sessions/{session.id}/close/")
        self.assertEqual(res.status_code, 200, res.data)
        session.refresh_from_db()
        self.assertEqual(session.status, CountSession.Status.CLOSED)

        v = VarianceRecord.objects.get()
        self.assertEqual(v.variance_qty, Decimal("-3.000"))
        self.assertEqual(v.status, VarianceRecord.Status.PENDING)
        self.assertEqual(v.pos_qty, Decimal("10.000"))
        self.assertEqual(v.counted_qty, Decimal("7.000"))

    def test_close_approves_remaining_submitted(self):
        self.user_client().post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "7",
        }, format="json")
        session = CountSession.objects.get()
        self.mgr_client().post(f"/api/dashboard/count-sessions/{session.id}/close/")
        self.assertEqual(
            StockCount.objects.get().approval_status, StockCount.ApprovalStatus.APPROVED
        )

    def test_close_is_idempotent(self):
        self.user_client().post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "7",
        }, format="json")
        session = CountSession.objects.get()
        c = self.mgr_client()
        r1 = c.post(f"/api/dashboard/count-sessions/{session.id}/close/")
        r2 = c.post(f"/api/dashboard/count-sessions/{session.id}/close/")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(VarianceRecord.objects.count(), 1)


class VarianceResolveTests(_Setup):
    def _make_variance(self):
        self.user_client().post("/api/dashboard/counts/", {
            "item_id": self.item.id, "actual_qty": "7",
        }, format="json")
        session = CountSession.objects.get()
        self.mgr_client().post(f"/api/dashboard/count-sessions/{session.id}/close/")
        return VarianceRecord.objects.get()

    def test_resolve_sets_status_and_logs(self):
        v = self._make_variance()
        c = self.mgr_client()
        res = c.post(f"/api/dashboard/variance-records/{v.id}/resolve/", {
            "status": "explained", "note": "damaged in transit",
        }, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        v.refresh_from_db()
        self.assertEqual(v.status, "explained")
        self.assertEqual(v.resolution_note, "damaged in transit")
        self.assertTrue(AuditLog.objects.filter(action="variance.resolve").exists())

    def test_resolve_rejects_invalid_status(self):
        v = self._make_variance()
        c = self.mgr_client()
        res = c.post(f"/api/dashboard/variance-records/{v.id}/resolve/", {
            "status": "garbage",
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_store_user_cannot_resolve(self):
        v = self._make_variance()
        c = self.user_client()
        res = c.post(f"/api/dashboard/variance-records/{v.id}/resolve/", {
            "status": "explained",
        }, format="json")
        self.assertEqual(res.status_code, 403)
