"""
POS tests — run with:
    python manage.py test apps.pos
"""
import json
import threading
import uuid
from datetime import date, timedelta
from decimal import Decimal

from django.core.signing import TimestampSigner
from django.db import connections, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.pos.views import APPROVAL_TOKEN_SALT

from apps.accounts.models import User
from apps.outlets.models import Outlet
from apps.items.models import Item
from apps.uploads.models import PosSnapshot

from apps.items.models import StockMovement, ItemPriceHistory
from .models import (
    Shift, Bill, BillLine, Payment, Customer, CustomerCreditTxn,
    BillSequence, IdempotencyKey, DiscountPolicy,
    PaymentGatewayConfig, PaymentIntent, SmsConfig, SmsLog,
)


class _Setup(TestCase):
    def setUp(self):
        self.outlet = Outlet.objects.create(outlet_name="Main")
        self.cashier = User.objects.create_user(username="cash", password="x",
                                                role=User.Role.STORE_USER, outlet=self.outlet)
        self.manager = User.objects.create_user(username="mgr", password="x",
                                                role=User.Role.MANAGER, outlet=self.outlet)
        self.it1 = Item.objects.create(outlet=self.outlet, item_code="A1", item_name="Rice 1kg", barcode="111")
        self.it2 = Item.objects.create(outlet=self.outlet, item_code="A2", item_name="Bread", barcode="222")
        PosSnapshot.objects.create(outlet=self.outlet, item=self.it1, snapshot_date=date.today(),
                                   pos_quantity=100, cost_price=80, selling_price=100)
        PosSnapshot.objects.create(outlet=self.outlet, item=self.it2, snapshot_date=date.today(),
                                   pos_quantity=50, cost_price=40, selling_price=60)

    def c(self, user):
        c = APIClient(); c.force_authenticate(user); return c


class ShiftTests(_Setup):
    def test_open_and_close_shift(self):
        c = self.c(self.cashier)
        r = c.post("/api/pos/shifts/open/", {"opening_cash": "500"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        shift_id = r.data["id"]
        # Can't open a second shift
        r2 = c.post("/api/pos/shifts/open/", {"opening_cash": "500"}, format="json")
        self.assertEqual(r2.status_code, 400)
        # My-open returns it
        r3 = c.get("/api/pos/shifts/my-open/")
        self.assertEqual(r3.data["id"], shift_id)
        # Close
        r4 = c.post(f"/api/pos/shifts/{shift_id}/close/", {"counted_cash": "500"}, format="json")
        self.assertEqual(r4.status_code, 200)
        self.assertEqual(r4.data["status"], "closed")


class BillTests(_Setup):
    def _open(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "100"}, format="json")
        return Shift.objects.get()

    def test_bill_create_and_totals(self):
        shift = self._open()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [
                {"item_id": self.it1.id, "qty": "2", "unit_price": "100"},
                {"item_id": self.it2.id, "qty": "1", "unit_price": "60"},
            ],
            "payments": [{"tender": "cash", "amount": "300"}],
            "bill_discount": "0",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["status"], "closed")
        self.assertEqual(Decimal(r.data["grand_total"]), Decimal("260.00"))
        self.assertEqual(Decimal(r.data["change_due"]), Decimal("40.00"))
        self.assertEqual(len(r.data["lines"]), 2)

    def test_bill_requires_open_shift(self):
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def test_short_payment_rejected(self):
        self._open()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "50"}],
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Bill.objects.count(), 0)

    def test_split_tender(self):
        self._open()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [
                {"tender": "cash", "amount": "60"},
                {"tender": "card", "amount": "40"},
            ],
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Payment.objects.count(), 2)

    def test_void_requires_reason(self):
        self._open()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
        }, format="json")
        bill_id = r.data["id"]
        rv = self.c(self.cashier).post(f"/api/pos/bills/{bill_id}/void/", {}, format="json")
        self.assertEqual(rv.status_code, 400)
        rv2 = self.c(self.cashier).post(f"/api/pos/bills/{bill_id}/void/", {"reason": "mistake"}, format="json")
        self.assertEqual(rv2.status_code, 200)
        self.assertEqual(rv2.data["status"], "void")

    def test_sale_decrements_stock(self):
        self._open()
        self.it1.on_hand = Decimal("10")
        self.it1.save()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "3", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "300"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.it1.refresh_from_db()
        self.assertEqual(self.it1.on_hand, Decimal("7.000"))
        mv = StockMovement.objects.filter(item=self.it1, kind="sale").first()
        self.assertIsNotNone(mv)
        self.assertEqual(mv.qty_change, Decimal("-3.000"))
        self.assertEqual(mv.balance_after, Decimal("7.000"))

    def test_void_restores_stock(self):
        self._open()
        self.it1.on_hand = Decimal("10")
        self.it1.save()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "4", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "400"}],
        }, format="json")
        bill_id = r.data["id"]
        self.c(self.manager).post(f"/api/pos/bills/{bill_id}/void/", {"reason": "oops"}, format="json")
        self.it1.refresh_from_db()
        self.assertEqual(self.it1.on_hand, Decimal("10.000"))

    def test_customer_auto_created_and_loyalty(self):
        self._open()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "500"}],
            "payments": [{"tender": "cash", "amount": "500"}],
            "customer_name": "Nimal", "customer_phone": "0771234567",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        cust = Customer.objects.get()
        self.assertEqual(cust.name, "Nimal")
        self.assertEqual(cust.phone, "0771234567")
        # 500 LKR * 0.01 pts/LKR = 5 points
        self.assertEqual(cust.loyalty_points, 5)

    def test_grn_entry_adds_stock_and_updates_price(self):
        self.it1.on_hand = Decimal("5")
        self.it1.save()
        r = self.c(self.manager).post("/api/pos/grn/", {
            "supplier_name": "ACME", "invoice_no": "INV1",
            "received_date": str(date.today()),
            "lines": [
                {"item_id": self.it1.id, "qty": "20", "cost_price": "90", "sell_price": "110"},
            ],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.it1.refresh_from_db()
        self.assertEqual(self.it1.on_hand, Decimal("25.000"))
        self.assertEqual(self.it1.sell_price, Decimal("110.00"))
        self.assertTrue(StockMovement.objects.filter(kind="grn", item=self.it1).exists())
        self.assertTrue(ItemPriceHistory.objects.filter(item=self.it1, source="grn").exists())

    def test_bulk_price_update(self):
        r = self.c(self.manager).post("/api/pos/prices/bulk-update/", {
            "updates": [
                {"item_id": self.it1.id, "new_sell": "150"},
                {"item_id": self.it2.id, "new_sell": "75"},
            ],
            "note": "monthly update",
        }, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["updated"], 2)
        self.it1.refresh_from_db(); self.it2.refresh_from_db()
        self.assertEqual(self.it1.sell_price, Decimal("150.00"))
        self.assertEqual(self.it2.sell_price, Decimal("75.00"))
        self.assertEqual(ItemPriceHistory.objects.count(), 2)

    def test_customer_credit_topup_and_redeem(self):
        # Create customer with credit
        cust = Customer.objects.create(outlet=self.outlet, name="X", phone="0771", credit_balance=Decimal("500"))
        self._open()
        # Redeem 200 of credit on a 300 bill; pay remaining 100 cash
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "3", "unit_price": "100"}],
            "payments": [
                {"tender": "credit", "amount": "200"},
                {"tender": "cash", "amount": "100"},
            ],
            "customer_phone": "0771", "customer_name": "X",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        cust.refresh_from_db()
        self.assertEqual(cust.credit_balance, Decimal("300.00"))
        self.assertTrue(CustomerCreditTxn.objects.filter(customer=cust, kind="redeem").exists())

    def test_credit_tender_rejects_insufficient_balance(self):
        Customer.objects.create(outlet=self.outlet, name="Y", phone="0772", credit_balance=Decimal("50"))
        self._open()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "credit", "amount": "100"}],
            "customer_phone": "0772",
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Bill.objects.count(), 0)

    def test_credit_topup_endpoint(self):
        cust = Customer.objects.create(outlet=self.outlet, name="Z", phone="0773", credit_balance=Decimal("0"))
        r = self.c(self.manager).post(f"/api/pos/customers/{cust.id}/credit/", {
            "amount": "1000", "kind": "topup", "note": "cash deposit",
        }, format="json")
        self.assertEqual(r.status_code, 200)
        cust.refresh_from_db()
        self.assertEqual(cust.credit_balance, Decimal("1000.00"))

    def test_grn_autocreates_supplier(self):
        from apps.uploads.models import Supplier
        self.assertEqual(Supplier.objects.count(), 0)
        r = self.c(self.manager).post("/api/pos/grn/", {
            "supplier_name": "New Supplier Co",
            "invoice_no": "X1",
            "lines": [{"item_id": self.it1.id, "qty": "5", "cost_price": "10"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Supplier.objects.count(), 1)
        self.assertEqual(r.data["supplier_name"], "New Supplier Co")
        self.assertTrue(r.data["supplier_code"])

    def test_grn_links_to_existing_supplier(self):
        from apps.uploads.models import Supplier
        s = Supplier.objects.create(code="ACME", name="ACME Traders")
        r = self.c(self.manager).post("/api/pos/grn/", {
            "supplier_id": s.id,
            "invoice_no": "X2",
            "lines": [{"item_id": self.it1.id, "qty": "5", "cost_price": "10"}],
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Supplier.objects.count(), 1)
        self.assertEqual(r.data["supplier_id"], s.id)

    def test_promotion_crud_and_active_listing(self):
        from datetime import timedelta
        from django.utils import timezone as dj_tz
        now = dj_tz.now()
        r = self.c(self.manager).post("/api/pos/promotions/", {
            "name": "10% off", "kind": "percent", "value": "10", "scope": "bill",
            "min_bill_amount": "0",
            "starts_at": (now - timedelta(hours=1)).isoformat(),
            "ends_at": (now + timedelta(days=7)).isoformat(),
            "is_active": True,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        promo_id = r.data["id"]
        # Active list should include it
        r2 = self.c(self.cashier).get("/api/pos/promotions/active/")
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(any(p["id"] == promo_id for p in r2.data))

    def test_promotion_usage_increments_on_bill(self):
        from datetime import timedelta
        from django.utils import timezone as dj_tz
        from .models import Promotion
        now = dj_tz.now()
        promo = Promotion.objects.create(
            outlet=self.outlet, name="5% off", kind="percent", value=Decimal("5"),
            scope="bill", starts_at=now - timedelta(hours=1), ends_at=now + timedelta(days=7),
        )
        self._open()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
            "promotion_ids": [promo.id],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        promo.refresh_from_db()
        self.assertEqual(promo.usage_count, 1)

    def test_product_create_with_opening_stock(self):
        r = self.c(self.manager).post("/api/pos/products/", {
            "item_code": "NEW1", "item_name": "Milk 1L",
            "sell_price": "250", "cost_price": "200", "tax_rate_pct": "18",
            "on_hand": "30", "reorder_level": "10",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        from apps.items.models import Item, StockMovement
        it = Item.objects.get(item_code="NEW1")
        self.assertEqual(it.on_hand, Decimal("30.000"))
        self.assertTrue(StockMovement.objects.filter(item=it, kind="opening").exists())

    def test_low_stock_report(self):
        self.it1.reorder_level = Decimal("10"); self.it1.on_hand = Decimal("3"); self.it1.save()
        self.it2.reorder_level = Decimal("5"); self.it2.on_hand = Decimal("20"); self.it2.save()
        r = self.c(self.manager).get("/api/pos/reports/low-stock/")
        self.assertEqual(r.status_code, 200)
        codes = [x["item_code"] for x in r.data["results"]]
        self.assertIn("A1", codes); self.assertNotIn("A2", codes)

    def test_sale_captures_unit_cost_and_profit_report(self):
        self.it1.cost_price = Decimal("60"); self.it1.save()
        self._open()
        self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "2", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "200"}],
        }, format="json")
        r = self.c(self.manager).get("/api/pos/reports/profit/", {
            "date_from": str(date.today()), "date_to": str(date.today()), "group_by": "day",
        })
        self.assertEqual(r.status_code, 200)
        totals = r.data["totals"]
        self.assertEqual(Decimal(totals["revenue"]), Decimal("200.00"))
        self.assertEqual(Decimal(totals["cost"]), Decimal("120.00"))
        self.assertEqual(Decimal(totals["profit"]), Decimal("80.00"))

    def test_expense_create_and_list(self):
        self._open()
        r = self.c(self.cashier).post("/api/pos/expenses/", {
            "kind": "petty", "amount": "500", "note": "tea", "paid_to": "kade",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r2 = self.c(self.cashier).get("/api/pos/expenses/")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data["count"], 1)
        self.assertEqual(Decimal(r2.data["total_amount"]), Decimal("500.00"))

    def test_purchase_return_decrements_stock_and_payable(self):
        from apps.uploads.models import Supplier
        from apps.items.models import StockMovement
        from .models import SupplierPaymentTxn
        s = Supplier.objects.create(code="X", name="X")
        # Opening stock
        self.it1.on_hand = Decimal("50"); self.it1.cost_price = Decimal("80"); self.it1.save()
        # Build payable first via GRN
        self.c(self.manager).post("/api/pos/grn/", {
            "supplier_id": s.id,
            "invoice_no": "I1",
            "lines": [{"item_id": self.it1.id, "qty": "10", "cost_price": "80"}],
        }, format="json")
        self.assertEqual(Decimal(SupplierPaymentTxn.objects.filter(supplier=s).latest("created_at").balance_after),
                         Decimal("800.00"))
        self.it1.refresh_from_db()
        self.assertEqual(self.it1.on_hand, Decimal("60.000"))  # 50 + 10

        # Return 3 units
        r = self.c(self.manager).post("/api/pos/purchase-returns/create/", {
            "supplier_id": s.id, "original_invoice_no": "I1",
            "returned_on": str(date.today()),
            "lines": [{"item_id": self.it1.id, "qty": "3", "unit_cost": "80"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.it1.refresh_from_db()
        self.assertEqual(self.it1.on_hand, Decimal("57.000"))  # 60 - 3
        # Payable dropped by 240
        self.assertEqual(Decimal(SupplierPaymentTxn.objects.filter(supplier=s).latest("created_at").balance_after),
                         Decimal("560.00"))

    def test_count_items_fallback_to_on_hand_when_no_snapshot(self):
        # Remove POS snapshot → should use on_hand
        from apps.uploads.models import PosSnapshot
        PosSnapshot.objects.all().delete()
        self.it1.on_hand = Decimal("15"); self.it1.save()
        r = self.c(self.cashier).get("/api/dashboard/count-items/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("results", r.data)
        codes = {x["item_code"]: x for x in r.data["results"]}
        self.assertIn("A1", codes)
        self.assertEqual(codes["A1"]["source"], "on_hand")
        self.assertEqual(codes["A1"]["pos_qty"], 15.0)

    def test_shift_aggregates(self):
        shift = self._open()
        c = self.c(self.cashier)
        c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
        }, format="json")
        c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it2.id, "qty": "2", "unit_price": "60"}],
            "payments": [{"tender": "card", "amount": "120"}],
        }, format="json")
        r = c.get("/api/pos/shifts/my-open/")
        self.assertEqual(r.data["bill_count"], 2)
        self.assertEqual(Decimal(r.data["cash_sales"]), Decimal("100.00"))
        self.assertEqual(Decimal(r.data["non_cash_sales"]), Decimal("120.00"))
        self.assertEqual(Decimal(r.data["expected_cash"]), Decimal("200.00"))  # 100 opening + 100 cash


# -------------------------------------------------------------------
# Phase-1 Agent-1: Backend safety fixes
# -------------------------------------------------------------------

class IdempotencyTests(_Setup):
    def _open(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        return Shift.objects.get()

    def test_idempotency_replays_response(self):
        """Same Idempotency-Key + same body → second request returns cached body, no second Bill row."""
        self._open()
        key = "idem-" + uuid.uuid4().hex
        body = {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
        }
        c = self.c(self.cashier)
        r1 = c.post("/api/pos/bills/create/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(r1.status_code, 201, r1.data)
        bill_id_1 = r1.data["id"]
        self.assertEqual(Bill.objects.filter(status=Bill.Status.CLOSED).count(), 1)

        r2 = c.post("/api/pos/bills/create/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(r2.status_code, 201)
        # Same bill returned — no new row
        self.assertEqual(r2.data["id"], bill_id_1)
        self.assertEqual(Bill.objects.filter(status=Bill.Status.CLOSED).count(), 1)
        self.assertEqual(IdempotencyKey.objects.filter(key=key).count(), 1)

    def test_idempotency_different_body_returns_409(self):
        self._open()
        key = "idem-" + uuid.uuid4().hex
        c = self.c(self.cashier)
        r1 = c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
        }, format="json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(r1.status_code, 201)

        r2 = c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "2", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "200"}],
        }, format="json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(r2.status_code, 409, r2.data)
        self.assertIn("different payload", str(r2.data.get("detail", "")).lower())


class DiscountPolicyTests(_Setup):
    def _open(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        return Shift.objects.get()

    def test_discount_over_cap_blocked_without_token(self):
        # Default policy: 10% bill cap. Try a 50% bill discount.
        self._open()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "1000"}],
            "payments": [{"tender": "cash", "amount": "500"}],
            "bill_discount": "500",   # 50% off → way over 10% default
        }, format="json")
        self.assertEqual(r.status_code, 403, r.data)
        self.assertEqual(r.data.get("code"), "DISCOUNT_REQUIRES_APPROVAL")
        self.assertIn("limits", r.data)
        # No bill was created
        self.assertEqual(Bill.objects.filter(status=Bill.Status.CLOSED).count(), 0)

    def test_discount_over_cap_allowed_with_token(self):
        self._open()
        from apps.pos.views import _issue_approval_token
        token, _expires_at, _payload = _issue_approval_token(
            manager_id=self.manager.id,
            kind="discount",
            outlet_id=self.outlet.id,
            amount=Decimal("500"),
        )
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "1000"}],
            "payments": [{"tender": "cash", "amount": "500"}],
            "bill_discount": "500",
            "approval_token": token,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data["bill_discount"]), Decimal("500.00"))


class XReportTests(_Setup):
    def _open(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "100"}, format="json")
        return Shift.objects.get()

    def test_x_report_does_not_close_shift(self):
        shift = self._open()
        self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
        }, format="json")
        r = self.c(self.manager).get(f"/api/pos/shifts/{shift.id}/x-report/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["report_kind"], "X")
        self.assertEqual(r.data["bill_count"], 1)
        # Crucially, the shift is still OPEN.
        shift.refresh_from_db()
        self.assertEqual(shift.status, Shift.Status.OPEN)
        self.assertIsNone(shift.closed_at)


class BillSequenceConcurrencyTests(TransactionTestCase):
    """
    Uses TransactionTestCase so each thread can commit its own transaction
    against the real DB (default TestCase wraps everything in a single txn).
    """
    reset_sequences = True

    def setUp(self):
        from apps.outlets.models import Outlet
        from apps.items.models import Item
        self.outlet = Outlet.objects.create(outlet_name="Main")
        self.cashier = User.objects.create_user(
            username="cash_cc", password="x",
            role=User.Role.STORE_USER, outlet=self.outlet,
        )
        self.item = Item.objects.create(
            outlet=self.outlet, item_code="C1", item_name="Concurrent Item",
        )
        # Open one shift so create_bill can find it
        from .models import Shift as _Shift
        self.shift = _Shift.objects.create(
            outlet=self.outlet, opened_by=self.cashier, opening_cash=0,
        )

    def test_bill_no_concurrent_no_collision(self):
        from .views import _next_bill_no
        N = 12
        results = []
        errors = []

        def worker():
            try:
                # _next_bill_no must run inside a txn for SELECT FOR UPDATE.
                with transaction.atomic():
                    bn = _next_bill_no(self.outlet)
                results.append(bn)
            except Exception as e:
                errors.append(repr(e))
            finally:
                # Each thread uses its own DB connection — close it so the
                # test runner's teardown doesn't see leaks.
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(N)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), N)
        # All bill_no values must be distinct → no two cashiers got the same number.
        self.assertEqual(len(set(results)), N, f"collisions detected: {results}")
        # And the BillSequence row's counter equals N
        seq = BillSequence.objects.get(outlet=self.outlet)
        self.assertEqual(seq.counter, N)


# ---------------------------------------------------------------------------
# Manager PIN override (Phase 1 Agent 4)
# ---------------------------------------------------------------------------

class ManagerPinTests(_Setup):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username="adm", password="x", role=User.Role.ADMIN, outlet=self.outlet,
        )
        self.other = User.objects.create_user(
            username="other", password="x", role=User.Role.STORE_USER, outlet=self.outlet,
        )
        self.manager.set_manager_pin("4321")
        # Ensure cache is clean between tests (rate-limit + nonce keys).
        try:
            from django.core.cache import cache as _c
            _c.clear()
        except Exception:
            pass

    def _cache_ok(self):
        try:
            from django.core.cache import cache as _c
            _c.set("__probe__", "1", 5)
            return _c.get("__probe__") == "1"
        except Exception:
            return False

    # --- set-manager-pin ---
    def test_set_manager_pin_admin_can_set_for_anyone(self):
        c = self.c(self.admin)
        r = c.post(f"/api/auth/users/{self.manager.id}/set-manager-pin/",
                   {"pin": "1111"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_manager_pin("1111"))

    def test_set_manager_pin_user_can_set_own(self):
        c = self.c(self.manager)
        r = c.post(f"/api/auth/users/{self.manager.id}/set-manager-pin/",
                   {"pin": "9876"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_manager_pin("9876"))

    def test_set_manager_pin_other_user_forbidden(self):
        c = self.c(self.other)
        r = c.post(f"/api/auth/users/{self.manager.id}/set-manager-pin/",
                   {"pin": "1111"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_set_manager_pin_rejects_non_digits(self):
        c = self.c(self.admin)
        r = c.post(f"/api/auth/users/{self.manager.id}/set-manager-pin/",
                   {"pin": "abcd"}, format="json")
        self.assertEqual(r.status_code, 400)
        r2 = c.post(f"/api/auth/users/{self.manager.id}/set-manager-pin/",
                    {"pin": "12"}, format="json")
        self.assertEqual(r2.status_code, 400)
        r3 = c.post(f"/api/auth/users/{self.manager.id}/set-manager-pin/",
                    {"pin": "12345678"}, format="json")
        self.assertEqual(r3.status_code, 400)

    # --- verify-manager-pin ---
    def _verify_payload(self, pin="4321", amount="500.00"):
        return {
            "manager_username": self.manager.username,
            "pin": pin,
            "context": {"outlet_id": self.outlet.id, "kind": "discount", "amount": amount},
        }

    def test_verify_pin_correct_returns_token(self):
        c = self.c(self.cashier)
        r = c.post("/api/pos/verify-manager-pin/", self._verify_payload(), format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn("approval_token", r.data)
        self.assertIn("expires_at", r.data)

    def test_verify_pin_wrong_returns_401(self):
        c = self.c(self.cashier)
        r = c.post("/api/pos/verify-manager-pin/",
                   self._verify_payload(pin="0000"), format="json")
        self.assertEqual(r.status_code, 401)

    def test_verify_pin_locks_after_5_failures(self):
        if not self._cache_ok():
            self.skipTest("cache not configured")
        c = self.c(self.cashier)
        for _ in range(5):
            c.post("/api/pos/verify-manager-pin/",
                   self._verify_payload(pin="0000"), format="json")
        r = c.post("/api/pos/verify-manager-pin/", self._verify_payload(), format="json")
        self.assertEqual(r.status_code, 423)

    # --- create_bill with approval_token ---
    def _open_shift(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "100"}, format="json")
        return Shift.objects.get(opened_by=self.cashier)

    def _high_discount_bill(self, approval_token=None):
        body = {
            "lines": [
                {"item_id": self.it1.id, "qty": "2", "unit_price": "100"},
            ],
            "payments": [{"tender": "cash", "amount": "100"}],
            # 200 subtotal, 100 bill discount = 50% — well over default 10%.
            "bill_discount": "100",
        }
        if approval_token:
            body["approval_token"] = approval_token
        return body

    def _get_token(self, amount="100", outlet_id=None):
        c = self.c(self.cashier)
        oid = outlet_id if outlet_id is not None else self.outlet.id
        r = c.post("/api/pos/verify-manager-pin/", {
            "manager_username": self.manager.username,
            "pin": "4321",
            "context": {"outlet_id": oid, "kind": "discount", "amount": amount},
        }, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        return r.data["approval_token"]

    def test_create_bill_with_valid_token_allows_over_cap(self):
        self._open_shift()
        token = self._get_token(amount="100")
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/",
                   self._high_discount_bill(approval_token=token),
                   format="json")
        self.assertEqual(r.status_code, 201, r.data)

    def test_create_bill_with_expired_token_rejects(self):
        self._open_shift()
        # Mint a token, then call _verify with max_age=0 by mocking time —
        # easiest: use a token with a backdated timestamp by monkeypatching
        # TimestampSigner.timestamp at sign time.
        import time as _time
        real_time = _time.time
        try:
            _time.time = lambda: real_time() - 400  # 6m40s ago
            signer = TimestampSigner(salt=APPROVAL_TOKEN_SALT)
            payload = json.dumps({
                "manager_id": self.manager.id, "kind": "discount",
                "outlet_id": self.outlet.id, "amount": "100",
                "issued_at": timezone.now().isoformat(), "nonce": "expnonce",
            })
            token = signer.sign(payload)
        finally:
            _time.time = real_time

        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/",
                   self._high_discount_bill(approval_token=token),
                   format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data.get("code"), "APPROVAL_TOKEN_INVALID")

    def test_create_bill_with_outlet_mismatch_rejects(self):
        self._open_shift()
        other_outlet = Outlet.objects.create(outlet_name="Other")
        token = self._get_token(amount="100", outlet_id=other_outlet.id)
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/",
                   self._high_discount_bill(approval_token=token),
                   format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data.get("code"), "APPROVAL_TOKEN_INVALID")

    def test_create_bill_with_replayed_nonce_rejects(self):
        if not self._cache_ok():
            self.skipTest("cache not configured")
        self._open_shift()
        token = self._get_token(amount="100")
        c = self.c(self.cashier)
        r1 = c.post("/api/pos/bills/create/",
                    self._high_discount_bill(approval_token=token),
                    format="json")
        self.assertEqual(r1.status_code, 201, r1.data)
        # Replay same token — should be rejected.
        r2 = c.post("/api/pos/bills/create/",
                    self._high_discount_bill(approval_token=token),
                    format="json")
        self.assertEqual(r2.status_code, 403)
        self.assertEqual(r2.data.get("code"), "APPROVAL_TOKEN_INVALID")


# =====================================================================
# Phase 2 / Agent 5 - Batch / Expiry / FEFO
# =====================================================================
from apps.items.models import ItemBatch, BatchMovement
from apps.items.inventory import consume_fefo


class BatchTests(_Setup):
    def _open_shift(self):
        self.c(self.cashier).post("/api/pos/shifts/open/",
                                  {"opening_cash": "100"}, format="json")
        return Shift.objects.get()

    def _grn(self, lines, supplier_name="ACME"):
        return self.c(self.manager).post("/api/pos/grn/", {
            "supplier_name": supplier_name,
            "invoice_no": f"INV-{uuid.uuid4().hex[:6]}",
            "received_date": str(date.today()),
            "lines": lines,
        }, format="json")

    def test_grn_creates_batch_with_expiry(self):
        exp = (date.today() + timedelta(days=60)).isoformat()
        r = self._grn([{
            "item_id": self.it1.id, "qty": "10",
            "cost_price": "80", "sell_price": "100",
            "batch_no": "B001", "expiry_date": exp,
        }])
        self.assertEqual(r.status_code, 201, r.data)
        b = ItemBatch.objects.get(item=self.it1, batch_no="B001")
        self.assertEqual(b.qty, Decimal("10"))
        self.assertEqual(b.received_qty, Decimal("10"))
        self.assertEqual(b.expiry_date.isoformat(), exp)

    def test_grn_same_batch_no_accumulates_qty(self):
        exp = (date.today() + timedelta(days=60)).isoformat()
        self._grn([{"item_id": self.it1.id, "qty": "10", "cost_price": "80",
                    "batch_no": "B001", "expiry_date": exp}])
        self._grn([{"item_id": self.it1.id, "qty": "5", "cost_price": "80",
                    "batch_no": "B001", "expiry_date": exp}])
        b = ItemBatch.objects.get(item=self.it1, batch_no="B001")
        self.assertEqual(b.qty, Decimal("15"))
        self.assertEqual(b.received_qty, Decimal("15"))

    def test_fefo_consumes_earliest_expiry_first(self):
        ItemBatch.objects.create(item=self.it1, batch_no="LATE",
                                 qty=Decimal("10"), received_qty=Decimal("10"),
                                 expiry_date=date.today() + timedelta(days=90))
        ItemBatch.objects.create(item=self.it1, batch_no="EARLY",
                                 qty=Decimal("10"), received_qty=Decimal("10"),
                                 expiry_date=date.today() + timedelta(days=10))
        with transaction.atomic():
            consumed = consume_fefo(item=self.it1, qty=Decimal("3"))
        self.assertEqual(len(consumed), 1)
        self.assertEqual(consumed[0][0].batch_no, "EARLY")
        self.assertEqual(consumed[0][1], Decimal("3"))
        early = ItemBatch.objects.get(batch_no="EARLY")
        self.assertEqual(early.qty, Decimal("7"))

    def test_fefo_spans_multiple_batches_when_one_isnt_enough(self):
        ItemBatch.objects.create(item=self.it1, batch_no="A",
                                 qty=Decimal("3"), received_qty=Decimal("3"),
                                 expiry_date=date.today() + timedelta(days=5))
        ItemBatch.objects.create(item=self.it1, batch_no="B",
                                 qty=Decimal("10"), received_qty=Decimal("10"),
                                 expiry_date=date.today() + timedelta(days=30))
        with transaction.atomic():
            consumed = consume_fefo(item=self.it1, qty=Decimal("7"))
        self.assertEqual(len(consumed), 2)
        self.assertEqual(consumed[0][0].batch_no, "A")
        self.assertEqual(consumed[0][1], Decimal("3"))
        self.assertEqual(consumed[1][0].batch_no, "B")
        self.assertEqual(consumed[1][1], Decimal("4"))

    def test_fefo_raises_when_insufficient_batched_stock(self):
        ItemBatch.objects.create(item=self.it1, batch_no="ONLY",
                                 qty=Decimal("2"), received_qty=Decimal("2"),
                                 expiry_date=date.today() + timedelta(days=5))
        with self.assertRaises(ValueError):
            with transaction.atomic():
                consume_fefo(item=self.it1, qty=Decimal("5"))

    def test_create_bill_records_batches_consumed_on_billline(self):
        self._open_shift()
        ItemBatch.objects.create(item=self.it1, batch_no="BX",
                                 qty=Decimal("5"), received_qty=Decimal("5"),
                                 expiry_date=date.today() + timedelta(days=20))
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "2", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "200"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        line = BillLine.objects.get(bill_id=r.data["id"])
        self.assertEqual(len(line.batches_consumed), 1)
        self.assertEqual(line.batches_consumed[0]["batch_no"], "BX")
        self.assertEqual(Decimal(line.batches_consumed[0]["qty"]), Decimal("2"))
        b = ItemBatch.objects.get(batch_no="BX")
        self.assertEqual(b.qty, Decimal("3"))

    def test_create_bill_falls_back_when_no_batches_exist(self):
        self._open_shift()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "100"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        line = BillLine.objects.get(bill_id=r.data["id"])
        self.assertEqual(line.batches_consumed, [])

    def test_void_bill_restores_batch_qty(self):
        self._open_shift()
        ItemBatch.objects.create(item=self.it1, batch_no="VR",
                                 qty=Decimal("5"), received_qty=Decimal("5"),
                                 expiry_date=date.today() + timedelta(days=20))
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "2", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "200"}],
        }, format="json")
        bill_id = r.data["id"]
        b = ItemBatch.objects.get(batch_no="VR")
        self.assertEqual(b.qty, Decimal("3"))
        rv = self.c(self.manager).post(f"/api/pos/bills/{bill_id}/void/",
                                       {"reason": "test"}, format="json")
        self.assertEqual(rv.status_code, 200, rv.data)
        b.refresh_from_db()
        self.assertEqual(b.qty, Decimal("5"))
        self.assertTrue(BatchMovement.objects.filter(batch=b, kind="void").exists())

    def test_near_expiry_report_filters_by_days(self):
        ItemBatch.objects.create(item=self.it1, batch_no="SOON",
                                 qty=Decimal("5"), received_qty=Decimal("5"),
                                 cost_price=Decimal("80"),
                                 expiry_date=date.today() + timedelta(days=5))
        ItemBatch.objects.create(item=self.it1, batch_no="LATER",
                                 qty=Decimal("3"), received_qty=Decimal("3"),
                                 cost_price=Decimal("80"),
                                 expiry_date=date.today() + timedelta(days=120))
        r = self.c(self.manager).get("/api/pos/reports/near-expiry/?days=30")
        self.assertEqual(r.status_code, 200, r.data)
        codes = {row["batch_no"] for row in r.data["results"]}
        self.assertIn("SOON", codes)
        self.assertNotIn("LATER", codes)
        self.assertEqual(Decimal(r.data["total_at_risk_value"]), Decimal("400.00"))


class BatchConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.outlet = Outlet.objects.create(outlet_name="C")
        self.cashier = User.objects.create_user(username="cc", password="x",
                                                role=User.Role.STORE_USER, outlet=self.outlet)
        self.item = Item.objects.create(outlet=self.outlet, item_code="X",
                                        item_name="X", barcode="x")
        self.batch = ItemBatch.objects.create(
            item=self.item, batch_no="ONE",
            qty=Decimal("5"), received_qty=Decimal("5"),
            expiry_date=date.today() + timedelta(days=30),
        )

    def test_concurrent_sales_dont_oversell_batch(self):
        successes = []
        failures = []

        def worker():
            try:
                with transaction.atomic():
                    consume_fefo(item=self.item, qty=Decimal("3"))
                successes.append(1)
            except ValueError:
                failures.append(1)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.batch.refresh_from_db()
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(failures), 1)
        self.assertEqual(self.batch.qty, Decimal("2"))


# ---------------------------------------------------------------------
# Phase 2 Agent 6 — Multi-Unit + Weighed Items
# ---------------------------------------------------------------------

from apps.items.models import UnitOfMeasure, ItemPackUnit
from apps.items.barcode_parsing import parse_ean13_type2


def _ean13_check(twelve):
    s_odd = sum(int(twelve[i]) for i in range(0, 12, 2))
    s_even = sum(int(twelve[i]) for i in range(1, 12, 2))
    return (10 - ((s_odd + 3 * s_even) % 10)) % 10


def _make_type2(plu5, weight_grams):
    """Build a valid type-2 EAN-13 for tests. weight_grams = int.
    Layout: 2 + PLU(5) + WEIGHT(5) + reserved(1) = 12-char body, then check digit.
    """
    plu = str(plu5).zfill(5)[-5:]
    body = f"2{plu}{int(weight_grams):05d}0"
    assert len(body) == 12, body
    return body + str(_ean13_check(body))


class WeighedBarcodeTests(TestCase):
    def test_ean13_type2_parser_extracts_weight(self):
        # 1.234 kg = 1234 g
        bc = _make_type2("12345", 1234)
        out = parse_ean13_type2(bc)
        self.assertIsNotNone(out)
        self.assertEqual(out["plu"], "12345")
        self.assertEqual(out["qty"], Decimal("1.234"))

    def test_ean13_type2_parser_rejects_non_type2(self):
        # Not starting with '2'
        self.assertIsNone(parse_ean13_type2("1234567890128"))
        # Wrong length
        self.assertIsNone(parse_ean13_type2("21234"))
        # Bad check digit
        good = _make_type2("12345", 1234)
        bad = good[:-1] + ("0" if good[-1] != "0" else "1")
        self.assertIsNone(parse_ean13_type2(bad))


class _MultiUnitSetup(TestCase):
    def setUp(self):
        # Seed units (the data migration runs in real migrate flow but tests
        # use a clean DB so we ensure the rows exist explicitly).
        for code, name, is_w, prec in [
            ("PCS", "Piece", False, 0),
            ("KG", "Kilogram", True, 3),
            ("BOX12", "Box of 12", False, 0),
        ]:
            UnitOfMeasure.objects.update_or_create(
                code=code,
                defaults={"name": name, "is_weight": is_w, "precision": prec},
            )
        self.outlet = Outlet.objects.create(outlet_name="MU")
        self.cashier = User.objects.create_user(
            username="cmu", password="x",
            role=User.Role.STORE_USER, outlet=self.outlet,
        )
        self.pcs = UnitOfMeasure.objects.get(code="PCS")
        self.kg = UnitOfMeasure.objects.get(code="KG")
        self.box12 = UnitOfMeasure.objects.get(code="BOX12")

        self.item_pcs = Item.objects.create(
            outlet=self.outlet, item_code="P1", item_name="Soap",
            sell_price=Decimal("20"), base_unit=self.pcs,
        )
        self.pack = ItemPackUnit.objects.create(
            item=self.item_pcs, unit=self.box12,
            conversion_factor=Decimal("12"),
            sell_price=Decimal("240.00"),
            barcode="BOXSOAP",
            is_default=False,
        )
        self.weighed = Item.objects.create(
            outlet=self.outlet, item_code="W1", item_name="Tomato",
            sell_price=Decimal("100"), base_unit=self.kg, is_weighed=True,
            weighed_barcode_prefix="12345",
        )

    def c(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    def _open_shift(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        return Shift.objects.filter(outlet=self.outlet, opened_by=self.cashier).first()


class MultiUnitTests(_MultiUnitSetup):
    def test_scan_weighed_barcode_returns_item_and_auto_qty(self):
        bc = _make_type2("12345", 1500)  # 1.500 kg
        c = self.c(self.cashier)
        r = c.get(f"/api/pos/products/by-barcode/?barcode={bc}")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["id"], self.weighed.id)
        self.assertEqual(Decimal(r.data["auto_qty"]), Decimal("1.500"))

    def test_pack_unit_barcode_lookup_returns_pack_hint(self):
        c = self.c(self.cashier)
        r = c.get("/api/pos/products/by-barcode/?barcode=BOXSOAP")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["id"], self.item_pcs.id)
        self.assertEqual(r.data["auto_pack_unit_id"], self.pack.id)

    def test_pack_unit_qty_converts_to_base_units_in_billline(self):
        self._open_shift()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [{
                "item_id": self.item_pcs.id,
                "qty": "1",
                "pack_unit_id": self.pack.id,
                "qty_in_unit": "2",  # 2 boxes
            }],
            "payments": [{"tender": "cash", "amount": "480"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        bl = BillLine.objects.get(bill_id=r.data["id"])
        # 2 boxes of 12 = 24 PCS in base units
        self.assertEqual(bl.qty, Decimal("24.000"))
        self.assertEqual(bl.pack_unit_snapshot["unit_code"], "BOX12")
        self.assertEqual(bl.pack_unit_snapshot["qty_in_unit"], "2.000")

    def test_pack_unit_sell_price_overrides_base_price(self):
        self._open_shift()
        c = self.c(self.cashier)
        # base price is 20/PCS; pack price is 240/BOX12 (=> 20/PCS would be 240).
        # Change pack sell_price to 200 (special promo) — line_total should be 200, not 240.
        self.pack.sell_price = Decimal("200.00"); self.pack.save()
        r = c.post("/api/pos/bills/create/", {
            "lines": [{
                "item_id": self.item_pcs.id,
                "qty": "1",
                "pack_unit_id": self.pack.id,
                "qty_in_unit": "1",
            }],
            "payments": [{"tender": "cash", "amount": "200"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        bl = BillLine.objects.get(bill_id=r.data["id"])
        # 12 PCS × (200/12) = 200 line_total
        self.assertEqual(bl.line_total, Decimal("200.00"))
        self.assertEqual(bl.pack_unit_snapshot["unit_price_in_unit"], "200.00")

    def test_item_create_with_pack_units(self):
        mgr = User.objects.create_user(username="mgrmu", password="x",
                                       role=User.Role.MANAGER, outlet=self.outlet)
        c = self.c(mgr)
        r = c.post("/api/pos/products/", {
            "item_code": "NEW1", "item_name": "Multipack",
            "sell_price": "10", "cost_price": "8",
            "base_unit_code": "PCS",
            "is_weighed": False,
            "weighed_barcode_prefix": "",
            "pack_units": [
                {"unit_code": "BOX12", "conversion_factor": "12",
                 "sell_price": "115.00", "barcode": "BOXNEW", "is_default": True},
            ],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        new_item = Item.objects.get(outlet=self.outlet, item_code="NEW1")
        self.assertEqual(new_item.base_unit.code, "PCS")
        self.assertEqual(new_item.pack_units.count(), 1)
        pu = new_item.pack_units.first()
        self.assertEqual(pu.unit.code, "BOX12")
        self.assertEqual(pu.conversion_factor, Decimal("12.0000"))
        self.assertEqual(pu.sell_price, Decimal("115.00"))


class UnitSeedMigrationTests(TestCase):
    def test_unit_seed_migration_creates_basic_units(self):
        # The data migration runs before tests; check the rows exist.
        for code in ("PCS", "KG", "G", "L", "ML", "DOZEN"):
            self.assertTrue(
                UnitOfMeasure.objects.filter(code=code).exists(),
                f"Expected seeded unit {code} to exist",
            )


# ---------------------------------------------------------------------------
# Phase 2 Agent 6 — multi-unit + weighed barcode tests
# ---------------------------------------------------------------------------
from apps.items.barcode_parsing import parse_barcode, _ean13_check_digit


def _make_ean13(prefix):
    # Pad with a reserved "0" digit if caller supplied an 11-char prefix
    # (parser layout: 2 + PLU(5) + WEIGHT(5) + reserved(1) + check(1) = 13).
    body = prefix if len(prefix) == 12 else (prefix + "0")
    return body + str(_ean13_check_digit(body))


class MultiUnitTests(TestCase):
    def setUp(self):
        self.outlet = Outlet.objects.create(outlet_name="Multi")
        self.cashier = User.objects.create_user(
            username="muser", password="x",
            role=User.Role.STORE_USER, outlet=self.outlet,
        )
        UnitOfMeasure.objects.update_or_create(
            code="EA", defaults={"name": "Each", "is_weight": False, "precision": 0},
        )
        UnitOfMeasure.objects.update_or_create(
            code="KG", defaults={"name": "Kilogram", "is_weight": True, "precision": 3},
        )
        UnitOfMeasure.objects.update_or_create(
            code="PK", defaults={"name": "Pack", "is_weight": False, "precision": 0},
        )
        self.ea = UnitOfMeasure.objects.get(code="EA")
        self.kg = UnitOfMeasure.objects.get(code="KG")
        self.pk = UnitOfMeasure.objects.get(code="PK")

    def c(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    # parse_barcode -----------------------------------------------------
    def test_parse_plain_barcode(self):
        out = parse_barcode("123456789012")
        self.assertEqual(out["kind"], "plain")
        self.assertEqual(out["code"], "123456789012")

    def test_parse_weighed_ean13_extracts_weight_kg(self):
        # PLU=12345, weight=01234g => 1.234 kg
        raw = _make_ean13("2" + "12345" + "01234")
        out = parse_barcode(raw)
        self.assertEqual(out["kind"], "weighed")
        self.assertEqual(out["weight_kg"], Decimal("1.234"))

    def test_parse_weighed_ean13_extracts_plu(self):
        raw = _make_ean13("2" + "54321" + "00500")
        out = parse_barcode(raw)
        self.assertEqual(out["kind"], "weighed")
        self.assertEqual(out["plu_code"], "54321")
        self.assertEqual(out["source_code"], raw)

    # product_by_barcode weighed integration ----------------------------
    def test_product_by_barcode_weighed_returns_scanned_qty(self):
        item = Item.objects.create(
            outlet=self.outlet, item_code="WGH1", item_name="Tomatoes",
            sell_price=Decimal("250.00"), base_unit=self.kg,
            plu_code="22222",
        )
        # Sanity: save() should sync is_weighed from KG
        item.refresh_from_db()
        self.assertTrue(item.is_weighed)

        raw = _make_ean13("2" + "22222" + "01500")  # 1.500 kg
        c = self.c(self.cashier)
        r = c.get(f"/api/pos/products/by-barcode/?barcode={raw}")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["id"], item.id)
        self.assertEqual(Decimal(r.data["scanned_qty"]), Decimal("1.500"))
        self.assertEqual(r.data["scanned_unit"], "kg")

    # create_bill simple-pack path --------------------------------------
    def _open_shift(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        return Shift.objects.get(outlet=self.outlet)

    def test_create_bill_pack_unit_multiplies_stock_correctly(self):
        item = Item.objects.create(
            outlet=self.outlet, item_code="P1", item_name="Coke 330ml",
            sell_price=Decimal("100.00"), base_unit=self.ea,
            pack_unit=self.pk, pack_size=Decimal("12.000"),
            on_hand=Decimal("100.000"),
        )
        self._open_shift()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [{
                "item_id": item.id, "qty": "2",
                "unit_kind": "pack",
            }],
            "payments": [{"tender": "cash", "amount": "10000"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        item.refresh_from_db()
        # 2 packs * 12 = 24 base units consumed
        self.assertEqual(item.on_hand, Decimal("76.000"))

    def test_create_bill_pack_uses_pack_sell_price_when_set(self):
        item = Item.objects.create(
            outlet=self.outlet, item_code="P2", item_name="Eggs Box",
            sell_price=Decimal("30.00"), base_unit=self.ea,
            pack_unit=self.pk, pack_size=Decimal("10.000"),
            pack_sell_price=Decimal("280.00"),
            on_hand=Decimal("100.000"),
        )
        self._open_shift()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": item.id, "qty": "1", "unit_kind": "pack"}],
            "payments": [{"tender": "cash", "amount": "300"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        bill_id = r.data["id"]
        line = BillLine.objects.get(bill_id=bill_id)
        # qty stored in base units = 10
        self.assertEqual(line.qty, Decimal("10.000"))
        # Override pack price = 280 ; per-base-unit = 28
        self.assertEqual(line.unit_price, Decimal("28.00"))
        # gross = 10 * 28 = 280, matches pack price override
        self.assertEqual(line.line_total, Decimal("280.00"))

    def test_create_bill_pack_uses_computed_price_when_unset(self):
        item = Item.objects.create(
            outlet=self.outlet, item_code="P3", item_name="Soap Pack",
            sell_price=Decimal("50.00"), base_unit=self.ea,
            pack_unit=self.pk, pack_size=Decimal("6.000"),
            pack_sell_price=Decimal("0"),  # 0 = compute
            on_hand=Decimal("60.000"),
        )
        self._open_shift()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": item.id, "qty": "1", "unit_kind": "pack"}],
            "payments": [{"tender": "cash", "amount": "300"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        line = BillLine.objects.get(bill_id=r.data["id"])
        # computed: sell_price * pack_size = 50 * 6 = 300
        self.assertEqual(line.line_total, Decimal("300.00"))

    def test_billline_records_unit_kind_and_pack_size_at_sale(self):
        item = Item.objects.create(
            outlet=self.outlet, item_code="P4", item_name="Snack",
            sell_price=Decimal("20.00"), base_unit=self.ea,
            pack_unit=self.pk, pack_size=Decimal("8.000"),
            on_hand=Decimal("100.000"),
        )
        self._open_shift()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": item.id, "qty": "1", "unit_kind": "pack"}],
            "payments": [{"tender": "cash", "amount": "200"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        line = BillLine.objects.get(bill_id=r.data["id"])
        self.assertEqual(line.unit_kind, "pack")
        self.assertEqual(line.pack_size_at_sale, Decimal("8.000"))


# -------------------------------------------------------------------
# Phase 2 Agent 7 — Promotions / Coupons / Gift Cards
# -------------------------------------------------------------------

from datetime import time, datetime
from .models import (
    Promotion, Coupon, CouponRedemption, GiftCard, GiftCardTxn,
)
from .promotions import evaluate_promotions, apply_coupon


class _PromoBase(_Setup):
    def _open_shift(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        return Shift.objects.first()


class PromotionEngineTests(_PromoBase):
    def test_bogo_inserts_free_line(self):
        p = Promotion.objects.create(
            outlet=self.outlet, name="Buy 2 get 1", kind=Promotion.Kind.BOGO,
            value=0, scope=Promotion.Scope.ITEM, item=self.it1,
            buy_qty=Decimal("2"), get_qty=Decimal("1"),
            starts_at=timezone.now() - timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=1),
        )
        self._open_shift()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "2", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "200"}],
            "promotion_ids": [p.id],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        # Should now have 2 lines: paid 2, free 1
        self.assertEqual(len(r.data["lines"]), 2)
        free = [ln for ln in r.data["lines"] if Decimal(ln["unit_price"]) == 0]
        self.assertEqual(len(free), 1)
        self.assertEqual(Decimal(free[0]["qty"]), Decimal("1.000"))

    def test_combo_applies_discount_when_all_items_present(self):
        p = Promotion.objects.create(
            outlet=self.outlet, name="Combo", kind=Promotion.Kind.COMBO,
            value=0, scope=Promotion.Scope.BILL, combo_price=Decimal("120"),
            starts_at=timezone.now() - timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=1),
        )
        p.combo_items.set([self.it1, self.it2])
        plan = evaluate_promotions(
            outlet=self.outlet,
            lines=[
                {"item_id": self.it1.id, "qty": Decimal("1"),
                 "unit_price": Decimal("100"), "line_total": Decimal("100")},
                {"item_id": self.it2.id, "qty": Decimal("1"),
                 "unit_price": Decimal("60"), "line_total": Decimal("60")},
            ],
            bill_subtotal=Decimal("160"),
            promotion_ids=[p.id],
        )
        self.assertEqual(plan["bill_discount_added"], Decimal("40.00"))
        self.assertIn(p.id, plan["applied_promotions"])

    def test_combo_skipped_when_one_item_missing(self):
        p = Promotion.objects.create(
            outlet=self.outlet, name="Combo", kind=Promotion.Kind.COMBO,
            value=0, scope=Promotion.Scope.BILL, combo_price=Decimal("120"),
            starts_at=timezone.now() - timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=1),
        )
        p.combo_items.set([self.it1, self.it2])
        plan = evaluate_promotions(
            outlet=self.outlet,
            lines=[{"item_id": self.it1.id, "qty": Decimal("1"),
                    "unit_price": Decimal("100"), "line_total": Decimal("100")}],
            bill_subtotal=Decimal("100"),
            promotion_ids=[p.id],
        )
        self.assertEqual(plan["bill_discount_added"], Decimal("0.00"))
        self.assertNotIn(p.id, plan["applied_promotions"])

    def test_tiered_applies_correct_tier_for_qty(self):
        p = Promotion.objects.create(
            outlet=self.outlet, name="Tier", kind=Promotion.Kind.TIERED,
            value=0, scope=Promotion.Scope.ITEM, item=self.it1,
            tiers=[{"min_qty": 3, "discount_pct": 5},
                   {"min_qty": 10, "discount_pct": 15}],
            starts_at=timezone.now() - timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=1),
        )
        plan = evaluate_promotions(
            outlet=self.outlet,
            lines=[{"item_id": self.it1.id, "qty": Decimal("12"),
                    "unit_price": Decimal("100"), "line_total": Decimal("1200")}],
            bill_subtotal=Decimal("1200"),
            promotion_ids=[p.id],
        )
        # 15% of 1200 = 180
        self.assertEqual(plan["line_discounts"].get(0), Decimal("180.00"))

    def test_happy_hour_promotion_active_only_in_window(self):
        now = timezone.now()
        p = Promotion.objects.create(
            outlet=self.outlet, name="HH", kind=Promotion.Kind.HAPPY_HOUR,
            value=Decimal("10"), scope=Promotion.Scope.BILL,
            time_from=time(0, 0), time_to=time(23, 59),
            weekdays="",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=1),
        )
        plan = evaluate_promotions(
            outlet=self.outlet, lines=[],
            bill_subtotal=Decimal("100"),
            promotion_ids=[p.id], now=now,
        )
        self.assertIn(p.id, plan["applied_promotions"])
        self.assertEqual(plan["bill_discount_added"], Decimal("10.00"))

    def test_happy_hour_skipped_outside_window(self):
        now = timezone.now()
        # Force window to a 1-minute slot far from now
        far_t = (now + timedelta(hours=2)).time()
        far_t2 = (now + timedelta(hours=3)).time()
        p = Promotion.objects.create(
            outlet=self.outlet, name="HH", kind=Promotion.Kind.HAPPY_HOUR,
            value=Decimal("10"), scope=Promotion.Scope.BILL,
            time_from=far_t, time_to=far_t2, weekdays="",
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=1),
        )
        plan = evaluate_promotions(
            outlet=self.outlet, lines=[],
            bill_subtotal=Decimal("100"),
            promotion_ids=[p.id], now=now,
        )
        self.assertNotIn(p.id, plan["applied_promotions"])


class CouponTests(_PromoBase):
    def test_coupon_redeems_and_increments_usage(self):
        Coupon.objects.create(
            code="SAVE10", discount_kind=Coupon.DiscountKind.PERCENT,
            value=Decimal("10"), is_active=True,
        )
        self._open_shift()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "cash", "amount": "90"}],
            "coupon_code": "SAVE10",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data["bill_discount"]), Decimal("10.00"))
        c = Coupon.objects.get(code="SAVE10")
        self.assertEqual(c.usage_count, 1)
        self.assertEqual(CouponRedemption.objects.filter(coupon=c).count(), 1)

    def test_coupon_rejects_when_max_usage_reached(self):
        Coupon.objects.create(
            code="ONCE", discount_kind=Coupon.DiscountKind.AMOUNT,
            value=Decimal("5"), max_usage=1, usage_count=1, is_active=True,
        )
        with self.assertRaises(ValueError):
            apply_coupon(code="ONCE", customer=None, bill_subtotal=Decimal("100"))

    def test_coupon_rejects_when_expired(self):
        Coupon.objects.create(
            code="EXP", discount_kind=Coupon.DiscountKind.PERCENT,
            value=Decimal("5"), is_active=True,
            ends_at=timezone.now() - timedelta(days=1),
        )
        with self.assertRaises(ValueError):
            apply_coupon(code="EXP", customer=None, bill_subtotal=Decimal("100"))

    def test_coupon_per_customer_limit(self):
        c = Coupon.objects.create(
            code="PCL", discount_kind=Coupon.DiscountKind.PERCENT,
            value=Decimal("5"), per_customer_limit=1, is_active=True,
        )
        cust = Customer.objects.create(outlet=self.outlet, name="A", phone="555")
        # First call: ok
        apply_coupon(code="PCL", customer=cust, bill_subtotal=Decimal("100"))
        # simulate redemption
        from .models import Bill
        b = Bill.objects.create(
            shift=Shift.objects.create(outlet=self.outlet, opened_by=self.cashier),
            outlet=self.outlet, cashier=self.cashier,
            bill_no="X1",
        )
        CouponRedemption.objects.create(coupon=c, bill=b, customer=cust, discount_applied=Decimal("5"))
        with self.assertRaises(ValueError):
            apply_coupon(code="PCL", customer=cust, bill_subtotal=Decimal("100"))


class GiftCardTests(_PromoBase):
    def _gc(self, balance="500"):
        return GiftCard.objects.create(
            outlet=self.outlet, serial=f"GC{uuid.uuid4().hex[:8]}",
            initial_balance=Decimal(balance), current_balance=Decimal(balance),
        )

    def test_gift_card_redeem_deducts_balance(self):
        gc = self._gc("500")
        self._open_shift()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "gift_card", "amount": "100", "reference": gc.serial}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        gc.refresh_from_db()
        self.assertEqual(gc.current_balance, Decimal("400.00"))
        self.assertEqual(GiftCardTxn.objects.filter(card=gc, kind="redeem").count(), 1)

    def test_gift_card_redeem_blocks_when_insufficient(self):
        gc = self._gc("50")
        self._open_shift()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "gift_card", "amount": "100", "reference": gc.serial}],
        }, format="json")
        self.assertEqual(r.status_code, 400)
        gc.refresh_from_db()
        self.assertEqual(gc.current_balance, Decimal("50.00"))

    def test_gift_card_void_on_bill_void(self):
        gc = self._gc("500")
        self._open_shift()
        r = self.c(self.cashier).post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": "1", "unit_price": "100"}],
            "payments": [{"tender": "gift_card", "amount": "100", "reference": gc.serial}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        bill_id = r.data["id"]
        rv = self.c(self.manager).post(f"/api/pos/bills/{bill_id}/void/", {"reason": "test"}, format="json")
        self.assertEqual(rv.status_code, 200, rv.data)
        gc.refresh_from_db()
        self.assertEqual(gc.current_balance, Decimal("500.00"))
        self.assertEqual(GiftCardTxn.objects.filter(card=gc, kind="void").count(), 1)


class GiftCardConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.outlet = Outlet.objects.create(outlet_name="Main")
        self.cashier = User.objects.create_user(username="cashc", password="x",
                                                role=User.Role.STORE_USER, outlet=self.outlet)
        self.it = Item.objects.create(outlet=self.outlet, item_code="C1", item_name="X", barcode="C1")
        PosSnapshot.objects.create(outlet=self.outlet, item=self.it, snapshot_date=date.today(),
                                   pos_quantity=100, cost_price=10, selling_price=100)
        self.gc = GiftCard.objects.create(
            outlet=self.outlet, serial="CONC1",
            initial_balance=Decimal("100"), current_balance=Decimal("100"),
        )

    def test_gift_card_concurrent_redemption_no_overspend(self):
        # Open shift
        c = APIClient(); c.force_authenticate(self.cashier)
        c.post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        results = []

        def attempt():
            client = APIClient(); client.force_authenticate(self.cashier)
            try:
                r = client.post("/api/pos/bills/create/", {
                    "lines": [{"item_id": self.it.id, "qty": "1", "unit_price": "100"}],
                    "payments": [{"tender": "gift_card", "amount": "100", "reference": "CONC1"}],
                }, format="json")
                results.append(r.status_code)
            finally:
                connections.close_all()

        ts = [threading.Thread(target=attempt) for _ in range(2)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        self.gc.refresh_from_db()
        self.assertGreaterEqual(self.gc.current_balance, Decimal("0"))
        # exactly one should have succeeded
        success = sum(1 for s in results if s == 201)
        self.assertEqual(success, 1, f"results={results}")


# ====================================================================
# Phase 3 Agent 8 — Tax Engine tests
# ====================================================================

from .models import TaxComponent
from .tax_engine import (
    get_active_components, compute_line_taxes, aggregate_bill_breakdown,
)


class TaxEngineTests(TestCase):
    def setUp(self):
        self.outlet = Outlet.objects.create(outlet_name="TaxMain")
        self.cashier = User.objects.create_user(
            username="taxc", password="x",
            role=User.Role.STORE_USER, outlet=self.outlet,
        )
        self.it = Item.objects.create(
            outlet=self.outlet, item_code="TX1", item_name="Tax Item",
            barcode="t1", category="GENERAL", tax_rate_pct=Decimal("10"),
        )
        PosSnapshot.objects.create(
            outlet=self.outlet, item=self.it, snapshot_date=date.today(),
            pos_quantity=100, cost_price=50, selling_price=100,
        )

    def c(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def _open_shift(self):
        self.c(self.cashier).post(
            "/api/pos/shifts/open/", {"opening_cash": "0"}, format="json",
        )

    def _bill(self, lines, payments, customer_phone=None, customer_name=None):
        body = {"lines": lines, "payments": payments, "bill_discount": "0"}
        if customer_phone:
            body["customer_phone"] = customer_phone
            body["customer_name"] = customer_name or "TC"
        return self.c(self.cashier).post(
            "/api/pos/bills/create/", body, format="json",
        )

    def test_no_components_falls_back_to_legacy_single_rate(self):
        self._open_shift()
        r = self._bill(
            [{"item_id": self.it.id, "qty": "1", "unit_price": "100", "tax_rate_pct": "10"}],
            [{"tender": "cash", "amount": "110"}],
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data["tax_total"]), Decimal("10.00"))
        self.assertEqual(r.data["tax_breakdown"], [])

    def test_exclusive_tax_added_on_top_of_gross(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="VAT", name="VAT",
            rate_pct=Decimal("18.000"), inclusive=False, priority=10,
        )
        comps = get_active_components(self.outlet)
        res = compute_line_taxes(
            gross=Decimal("100"), item_category="GENERAL", components=comps,
        )
        self.assertEqual(res["tax_amount"], Decimal("18.00"))
        self.assertEqual(res["net_amount"], Decimal("100.00"))

    def test_inclusive_tax_extracted_from_price(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="VAT", name="VAT",
            rate_pct=Decimal("18.000"), inclusive=True, priority=10,
        )
        comps = get_active_components(self.outlet)
        res = compute_line_taxes(
            gross=Decimal("118"), item_category="GENERAL", components=comps,
        )
        self.assertEqual(res["tax_amount"], Decimal("18.00"))
        self.assertEqual(res["net_amount"], Decimal("100.00"))

    def test_multiple_components_aggregate_correctly(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="VAT", name="VAT",
            rate_pct=Decimal("18.000"), inclusive=False, priority=10,
        )
        TaxComponent.objects.create(
            outlet=self.outlet, code="SSCL", name="SSCL",
            rate_pct=Decimal("2.560"), inclusive=False, priority=20,
        )
        comps = get_active_components(self.outlet)
        res = compute_line_taxes(
            gross=Decimal("100"), item_category="GENERAL", components=comps,
        )
        self.assertEqual(res["tax_amount"], Decimal("20.56"))
        self.assertEqual(len(res["components"]), 2)
        agg = aggregate_bill_breakdown([res, res])
        by_code = {a["code"]: Decimal(a["amount"]) for a in agg}
        self.assertEqual(by_code["VAT"], Decimal("36.00"))
        self.assertEqual(by_code["SSCL"], Decimal("5.12"))

    def test_category_inclusion_filter(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="FOODTAX", name="FoodTax",
            rate_pct=Decimal("5"), applies_to_categories=["FOOD"],
        )
        comps = get_active_components(self.outlet)
        res_gen = compute_line_taxes(
            gross=Decimal("100"), item_category="GENERAL", components=comps,
        )
        self.assertEqual(res_gen["tax_amount"], Decimal("0.00"))
        res_food = compute_line_taxes(
            gross=Decimal("100"), item_category="FOOD", components=comps,
        )
        self.assertEqual(res_food["tax_amount"], Decimal("5.00"))

    def test_category_exclusion_filter(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="VAT", name="VAT",
            rate_pct=Decimal("18"), excluded_categories=["BOOKS"],
        )
        comps = get_active_components(self.outlet)
        res_books = compute_line_taxes(
            gross=Decimal("100"), item_category="BOOKS", components=comps,
        )
        self.assertEqual(res_books["tax_amount"], Decimal("0.00"))
        res_other = compute_line_taxes(
            gross=Decimal("100"), item_category="OTHER", components=comps,
        )
        self.assertEqual(res_other["tax_amount"], Decimal("18.00"))

    def test_tax_exempt_customer_zero_tax(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="VAT", name="VAT",
            rate_pct=Decimal("18"),
        )
        comps = get_active_components(self.outlet)
        res = compute_line_taxes(
            gross=Decimal("100"), item_category="ANY", components=comps,
            customer_tax_exempt=True,
        )
        self.assertEqual(res["tax_amount"], Decimal("0.00"))
        self.assertEqual(res["components"], [])
        self.assertEqual(res["net_amount"], Decimal("100.00"))

    def test_bill_stores_tax_breakdown_jsonfield(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="VAT", name="VAT",
            rate_pct=Decimal("18"), priority=10,
        )
        TaxComponent.objects.create(
            outlet=self.outlet, code="SSCL", name="SSCL",
            rate_pct=Decimal("2.560"), priority=20,
        )
        self._open_shift()
        r = self._bill(
            [{"item_id": self.it.id, "qty": "1", "unit_price": "100"}],
            [{"tender": "cash", "amount": "200"}],
        )
        self.assertEqual(r.status_code, 201, r.data)
        tb = r.data["tax_breakdown"]
        codes = {row["code"]: row for row in tb}
        self.assertIn("VAT", codes)
        self.assertIn("SSCL", codes)
        self.assertEqual(Decimal(codes["VAT"]["amount"]), Decimal("18.00"))
        self.assertEqual(Decimal(codes["SSCL"]["amount"]), Decimal("2.56"))
        self.assertEqual(Decimal(r.data["tax_total"]), Decimal("20.56"))

    def test_zero_rated_category_no_tax(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="SVAT", name="SVAT",
            rate_pct=Decimal("0"),
        )
        comps = get_active_components(self.outlet)
        res = compute_line_taxes(
            gross=Decimal("100"), item_category="GENERAL", components=comps,
        )
        self.assertEqual(res["tax_amount"], Decimal("0.00"))
        self.assertEqual(len(res["components"]), 1)
        self.assertEqual(res["components"][0]["code"], "SVAT")

    def test_inclusive_plus_exclusive_combined(self):
        TaxComponent.objects.create(
            outlet=self.outlet, code="VAT", name="VAT",
            rate_pct=Decimal("18"), inclusive=True, priority=10,
        )
        TaxComponent.objects.create(
            outlet=self.outlet, code="SSCL", name="SSCL",
            rate_pct=Decimal("2"), inclusive=False, priority=20,
        )
        comps = get_active_components(self.outlet)
        # gross 118 -> VAT extracted=18, net=100; SSCL = 118*2% = 2.36
        res = compute_line_taxes(
            gross=Decimal("118"), item_category="GENERAL", components=comps,
        )
        self.assertEqual(res["tax_amount"], Decimal("20.36"))
        self.assertEqual(res["net_amount"], Decimal("100.00"))


# -------------------------------------------------------------------
# Phase 3 Agent 9 — GL Export + Cash Handover
# -------------------------------------------------------------------

class GLExportTests(_Setup):
    def setUp(self):
        super().setUp()
        from apps.pos.models import GLAccount
        # Chart of accounts
        self.acc_cash = GLAccount.objects.create(
            outlet=self.outlet, code="1100", name="Cash on Hand", purpose="cash"
        )
        self.acc_card = GLAccount.objects.create(
            outlet=self.outlet, code="1110", name="Card Clearing", purpose="card"
        )
        self.acc_sales = GLAccount.objects.create(
            outlet=self.outlet, code="4000", name="Sales Revenue", purpose="sales"
        )
        self.acc_sales_ret = GLAccount.objects.create(
            outlet=self.outlet, code="4100", name="Sales Returns", purpose="sales_return"
        )
        self.acc_tax = GLAccount.objects.create(
            outlet=self.outlet, code="2210", name="VAT Payable", purpose="tax"
        )
        self.acc_disc = GLAccount.objects.create(
            outlet=self.outlet, code="5100", name="Discount Given", purpose="discount"
        )
        # Open shift + create one closed sale bill
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        self.shift = Shift.objects.get()

    def _make_bill(self, kind="sale", grand=Decimal("118"), tax=Decimal("18"),
                   tax_breakdown=None, tender_pairs=None):
        from apps.pos.models import Bill, BillLine, Payment
        bill = Bill.objects.create(
            shift=self.shift, outlet=self.outlet, cashier=self.cashier,
            kind=kind, status=Bill.Status.CLOSED,
            bill_no=f"B{kind}-{Bill.objects.count()+1:04d}",
            subtotal=grand - tax, tax_total=tax, grand_total=grand,
            paid_total=grand,
            tax_breakdown=tax_breakdown or [
                {"code": "VAT", "name": "VAT", "rate_pct": "18",
                 "amount": str(tax), "inclusive": False},
            ],
            closed_at=timezone.now(),
        )
        for tender, amount in (tender_pairs or [("cash", grand)]):
            Payment.objects.create(bill=bill, tender=tender, amount=amount)
        return bill

    def _generate(self):
        from apps.pos.gl_export import generate_export
        return generate_export(
            outlet=self.outlet,
            date_from=date.today(), date_to=date.today(),
            user=self.manager,
        )

    def test_gl_export_balanced_per_bill(self):
        self._make_bill()
        exp = self._generate()
        td = Decimal(exp.totals["total_debit"])
        tc = Decimal(exp.totals["total_credit"])
        self.assertEqual(td, tc)
        self.assertEqual(exp.totals["bills"], 1)

    def test_gl_export_handles_returns_with_opposite_signs(self):
        # Sale debits cash; return must credit cash.
        self._make_bill(kind="sale", grand=Decimal("100"), tax=Decimal("0"),
                        tax_breakdown=[])
        self._make_bill(kind="return", grand=Decimal("50"), tax=Decimal("0"),
                        tax_breakdown=[])
        exp = self._generate()
        cash_entries = exp.entries.filter(account_code="1100")
        cash_debits = sum((e.debit for e in cash_entries), Decimal("0"))
        cash_credits = sum((e.credit for e in cash_entries), Decimal("0"))
        # Sale: cash debit 100. Return: cash credit 50.
        self.assertEqual(cash_debits, Decimal("100.00"))
        self.assertEqual(cash_credits, Decimal("50.00"))
        # And it still balances overall
        self.assertEqual(
            Decimal(exp.totals["total_debit"]),
            Decimal(exp.totals["total_credit"]),
        )

    def test_gl_export_includes_per_tax_component_credit_lines(self):
        self._make_bill(
            grand=Decimal("120.36"), tax=Decimal("20.36"),
            tax_breakdown=[
                {"code": "VAT", "name": "VAT", "rate_pct": "18",
                 "amount": "18.00", "inclusive": False},
                {"code": "SSCL", "name": "SSCL", "rate_pct": "2",
                 "amount": "2.36", "inclusive": False},
            ],
        )
        exp = self._generate()
        tax_entries = exp.entries.filter(account_code="2210")
        # No per-component override → both fall back to the TAX account; two lines.
        self.assertEqual(tax_entries.count(), 2)
        total_tax_credit = sum((e.credit for e in tax_entries), Decimal("0"))
        self.assertEqual(total_tax_credit, Decimal("20.36"))

    def test_gl_export_csv_format_has_tally_header_and_dd_mm_yyyy(self):
        self._make_bill()
        exp = self._generate()
        first_line, second_line = exp.csv_text.split("\n")[:2]
        self.assertIn("Date,Voucher Type,Voucher Number,Account", first_line)
        # Second line begins with DD-MM-YYYY
        import re
        self.assertRegex(second_line.split(",")[0], r"^\d{2}-\d{2}-\d{4}$")

    def test_gl_export_skips_void_bills(self):
        from apps.pos.models import Bill
        self._make_bill()
        # Make a void bill — should be ignored.
        b = self._make_bill()
        b.status = Bill.Status.VOID
        b.save(update_fields=["status"])
        exp = self._generate()
        self.assertEqual(exp.totals["bills"], 1)


class CashHandoverTests(_Setup):
    def _open_shift(self):
        c = self.c(self.cashier)
        c.post("/api/pos/shifts/open/", {"opening_cash": "100"}, format="json")
        return Shift.objects.get()

    def test_cash_handover_computes_variance(self):
        shift = self._open_shift()
        # Close it first
        self.c(self.cashier).post(
            f"/api/pos/shifts/{shift.id}/close/",
            {"counted_cash": "100"}, format="json",
        )
        r = self.c(self.manager).post(
            "/api/pos/cash-handover/",
            {"shift_id": shift.id, "counted_cash": "95",
             "collected_by_id": self.manager.id, "safe_deposit_ref": "SD-1"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        # Expected = opening 100 + 0 cash sales = 100. Counted 95 -> variance -5.
        self.assertEqual(Decimal(r.data["expected_cash"]), Decimal("100.00"))
        self.assertEqual(Decimal(r.data["counted_cash"]), Decimal("95.00"))
        self.assertEqual(Decimal(r.data["variance"]), Decimal("-5.00"))

    def test_cash_handover_blocks_when_shift_still_open(self):
        shift = self._open_shift()
        r = self.c(self.manager).post(
            "/api/pos/cash-handover/",
            {"shift_id": shift.id, "counted_cash": "100",
             "collected_by_id": self.manager.id},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_cash_handover_audit_log_written(self):
        from apps.uploads.models import AuditLog
        shift = self._open_shift()
        self.c(self.cashier).post(
            f"/api/pos/shifts/{shift.id}/close/",
            {"counted_cash": "100"}, format="json",
        )
        before = AuditLog.objects.filter(action="pos.cash_handover_create").count()
        r = self.c(self.manager).post(
            "/api/pos/cash-handover/",
            {"shift_id": shift.id, "counted_cash": "100",
             "collected_by_id": self.manager.id},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        after = AuditLog.objects.filter(action="pos.cash_handover_create").count()
        self.assertEqual(after - before, 1)


# -------------------------------------------------------------------
# Phase 3 Agent 10 — Sales Rep + Commission
# -------------------------------------------------------------------

from apps.pos.models import CommissionRule
from apps.pos.commission import (
    find_rule_for, compute_line_commission, compute_bill_commissions,
)


class CommissionTests(_Setup):
    def setUp(self):
        super().setUp()
        # add a category to it1
        self.it1.category = "Beverages"
        self.it1.save(update_fields=["category"])
        self.it2.category = "Bakery"
        self.it2.save(update_fields=["category"])
        self.rep = User.objects.create_user(
            username="rep1", password="x", role=User.Role.STAFF, outlet=self.outlet,
        )
        self.rep2 = User.objects.create_user(
            username="rep2", password="x", role=User.Role.STAFF, outlet=self.outlet,
        )

    def _open(self):
        self.c(self.cashier).post("/api/pos/shifts/open/", {"opening_cash": "0"}, format="json")
        return Shift.objects.get(opened_by=self.cashier, status=Shift.Status.OPEN)

    def test_commission_rule_lookup_picks_most_specific(self):
        # Chain-wide blank-cat 1%
        r1 = CommissionRule.objects.create(rep=None, item_category="", rate_pct=Decimal("1"))
        # Rep-specific blank-cat 2%
        r2 = CommissionRule.objects.create(rep=self.rep, item_category="", rate_pct=Decimal("2"))
        # Chain-wide Beverages 3%
        r3 = CommissionRule.objects.create(rep=None, item_category="Beverages", rate_pct=Decimal("3"))
        # Rep-specific Beverages 5% (most specific)
        r4 = CommissionRule.objects.create(rep=self.rep, item_category="Beverages", rate_pct=Decimal("5"))
        rules = [r1, r2, r3, r4]
        chosen = find_rule_for(rules=rules, rep=self.rep, category="Beverages")
        self.assertEqual(chosen.id, r4.id)
        chosen2 = find_rule_for(rules=rules, rep=self.rep, category="Bakery")
        self.assertEqual(chosen2.id, r2.id)  # rep+blank > null+blank
        chosen3 = find_rule_for(rules=rules, rep=self.rep2, category="Beverages")
        self.assertEqual(chosen3.id, r3.id)
        chosen4 = find_rule_for(rules=rules, rep=self.rep2, category="Bakery")
        self.assertEqual(chosen4.id, r1.id)

    def test_commission_compute_line_total_basis(self):
        rule = CommissionRule.objects.create(rep=self.rep, rate_pct=Decimal("10"), basis="line_total")

        class L:
            qty = Decimal("2")
            unit_price = Decimal("100")
            unit_cost = Decimal("60")
            line_total = Decimal("200")
        amt = compute_line_commission(line=L(), rule=rule)
        self.assertEqual(amt, Decimal("20.00"))

    def test_commission_compute_line_profit_basis(self):
        rule = CommissionRule.objects.create(rep=self.rep, rate_pct=Decimal("10"), basis="line_profit")

        class L:
            qty = Decimal("2")
            unit_price = Decimal("100")
            unit_cost = Decimal("60")
            line_total = Decimal("200")
        # profit = (100-60)*2 = 80; 10% = 8
        self.assertEqual(compute_line_commission(line=L(), rule=rule), Decimal("8.00"))

    def test_commission_compute_line_qty_basis(self):
        rule = CommissionRule.objects.create(rep=self.rep, rate_pct=Decimal("5"), basis="line_qty")

        class L:
            qty = Decimal("3")
            unit_price = Decimal("100")
            unit_cost = Decimal("60")
            line_total = Decimal("300")
        # 3 units * 5 LKR/unit = 15
        self.assertEqual(compute_line_commission(line=L(), rule=rule), Decimal("15.00"))

    def _make_bill_with_rep(self, rep, qty=2, price=100):
        self._open()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [{"item_id": self.it1.id, "qty": str(qty), "unit_price": str(price)}],
            "payments": [{"tender": "cash", "amount": str(qty * price)}],
            "sales_rep_id": rep.id,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return Bill.objects.get(pk=r.data["id"])

    def test_bill_records_sales_rep(self):
        bill = self._make_bill_with_rep(self.rep)
        self.assertEqual(bill.sales_rep_id, self.rep.id)

    def test_billline_sales_rep_overrides_bill_rep(self):
        self._open()
        c = self.c(self.cashier)
        r = c.post("/api/pos/bills/create/", {
            "lines": [
                {"item_id": self.it1.id, "qty": "1", "unit_price": "100"},
                {"item_id": self.it2.id, "qty": "1", "unit_price": "60", "sales_rep_id": self.rep2.id},
            ],
            "payments": [{"tender": "cash", "amount": "160"}],
            "sales_rep_id": self.rep.id,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        bill = Bill.objects.get(pk=r.data["id"])
        self.assertEqual(bill.sales_rep_id, self.rep.id)
        lines = list(bill.lines.order_by("id"))
        self.assertIsNone(lines[0].sales_rep_id)
        self.assertEqual(lines[1].sales_rep_id, self.rep2.id)

        # 5% line_total rule for both reps
        CommissionRule.objects.create(rep=None, rate_pct=Decimal("5"), basis="line_total")
        per_rep = compute_bill_commissions(bill=bill, rules=list(CommissionRule.objects.all()))
        # rep1 gets line[0] (100*5%=5), rep2 gets line[1] (60*5%=3)
        self.assertEqual(per_rep[self.rep.id]["amount"], Decimal("5.00"))
        self.assertEqual(per_rep[self.rep2.id]["amount"], Decimal("3.00"))

    def test_commission_report_aggregates_by_rep(self):
        CommissionRule.objects.create(rep=None, rate_pct=Decimal("10"), basis="line_total")
        self._make_bill_with_rep(self.rep, qty=2, price=100)  # line_total 200, 10% = 20
        self._make_bill_with_rep(self.rep2, qty=1, price=60)
        today = date.today().isoformat()
        r = self.c(self.manager).get(
            f"/api/pos/commission-report/?date_from={today}&date_to={today}",
        )
        self.assertEqual(r.status_code, 200, r.data)
        by_rep = {row["rep_id"]: row for row in r.data["by_rep"]}
        self.assertIn(self.rep.id, by_rep)
        self.assertIn(self.rep2.id, by_rep)
        self.assertEqual(Decimal(by_rep[self.rep.id]["commission"]), Decimal("20.00"))
        self.assertEqual(Decimal(by_rep[self.rep2.id]["commission"]), Decimal("6.00"))

    def test_commission_report_filters_by_date(self):
        CommissionRule.objects.create(rep=None, rate_pct=Decimal("10"), basis="line_total")
        self._make_bill_with_rep(self.rep)
        future = (date.today() + timedelta(days=30)).isoformat()
        r = self.c(self.manager).get(
            f"/api/pos/commission-report/?date_from={future}&date_to={future}",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["totals"]["bills"], 0)
        self.assertEqual(r.data["by_rep"], [])

    def test_commission_report_filters_by_rep(self):
        CommissionRule.objects.create(rep=None, rate_pct=Decimal("10"), basis="line_total")
        self._make_bill_with_rep(self.rep)
        self._make_bill_with_rep(self.rep2)
        today = date.today().isoformat()
        r = self.c(self.manager).get(
            f"/api/pos/commission-report/?date_from={today}&date_to={today}&rep={self.rep.id}",
        )
        self.assertEqual(r.status_code, 200, r.data)
        rep_ids = [row["rep_id"] for row in r.data["by_rep"]]
        self.assertEqual(rep_ids, [self.rep.id])


# -------------------------------------------------------------------
# Phase 4 Agent 12 — Purchase Order ↔ GRN match
# -------------------------------------------------------------------


class PoGrnTests(_Setup):
    def setUp(self):
        super().setUp()
        from apps.uploads.models import Supplier
        self.supplier = Supplier.objects.create(code="SUP1", name="Acme Supplies")

    # ---- helpers ----
    def _make_draft_po(self, lines=None):
        body = {
            "supplier_id": self.supplier.id,
            "expected_on": (date.today() + timedelta(days=3)).isoformat(),
            "note": "test PO",
            "lines": lines or [
                {"item_id": self.it1.id, "qty_ordered": "10", "unit_cost": "50", "tax_rate_pct": "0"},
                {"item_id": self.it2.id, "qty_ordered": "5",  "unit_cost": "30", "tax_rate_pct": "0"},
            ],
        }
        r = self.c(self.manager).post("/api/pos/purchase-orders/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def _submit_po(self, po_id):
        r = self.c(self.manager).post(f"/api/pos/purchase-orders/{po_id}/submit/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    # ---- tests ----
    def test_create_po_draft_then_submit_assigns_po_no(self):
        po = self._make_draft_po()
        self.assertEqual(po["status"], "draft")
        self.assertTrue(po["po_no"].startswith("DRAFT-"))
        sub = self._submit_po(po["id"])
        self.assertEqual(sub["status"], "open")
        self.assertTrue(sub["po_no"].startswith("PO-"))
        self.assertRegex(sub["po_no"], r"^PO-\d{8}-\d{4}$")

    def test_grn_against_po_increments_qty_received(self):
        po = self._make_draft_po()
        self._submit_po(po["id"])
        line1, line2 = po["lines"]
        body = {
            "supplier_id": self.supplier.id,
            "invoice_no": "INV-1",
            "received_date": date.today().isoformat(),
            "purchase_order_id": po["id"],
            "lines": [
                {"item_id": self.it1.id, "qty": "4", "cost_price": "50",
                 "po_line_id": line1["id"]},
            ],
        }
        r = self.c(self.manager).post("/api/pos/grn/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        from .models import PurchaseOrderLine
        pl = PurchaseOrderLine.objects.get(pk=line1["id"])
        self.assertEqual(pl.qty_received, Decimal("4.000"))

    def test_grn_partial_keeps_po_open_partial(self):
        po = self._make_draft_po()
        self._submit_po(po["id"])
        line1, line2 = po["lines"]
        body = {
            "supplier_id": self.supplier.id, "invoice_no": "INV-2",
            "received_date": date.today().isoformat(),
            "purchase_order_id": po["id"],
            "lines": [
                {"item_id": self.it1.id, "qty": "3", "cost_price": "50",
                 "po_line_id": line1["id"]},
            ],
        }
        r = self.c(self.manager).post("/api/pos/grn/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["po_status"], "partial")

    def test_grn_full_marks_po_closed(self):
        po = self._make_draft_po()
        self._submit_po(po["id"])
        line1, line2 = po["lines"]
        body = {
            "supplier_id": self.supplier.id, "invoice_no": "INV-3",
            "received_date": date.today().isoformat(),
            "purchase_order_id": po["id"],
            "lines": [
                {"item_id": self.it1.id, "qty": "10", "cost_price": "50",
                 "po_line_id": line1["id"]},
                {"item_id": self.it2.id, "qty": "5", "cost_price": "30",
                 "po_line_id": line2["id"]},
            ],
        }
        r = self.c(self.manager).post("/api/pos/grn/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["po_status"], "closed")

    def test_grn_without_po_works_legacy_path(self):
        body = {
            "supplier_id": self.supplier.id, "invoice_no": "INV-LEG",
            "received_date": date.today().isoformat(),
            "lines": [
                {"item_id": self.it1.id, "qty": "2", "cost_price": "50"},
            ],
        }
        r = self.c(self.manager).post("/api/pos/grn/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIsNone(r.data["purchase_order_id"])
        self.assertIsNone(r.data["po_status"])

    def test_grn_cannot_link_to_cancelled_po(self):
        po = self._make_draft_po()
        self._submit_po(po["id"])
        rc = self.c(self.manager).post(
            f"/api/pos/purchase-orders/{po['id']}/cancel/",
            {"reason": "supplier closed"}, format="json",
        )
        self.assertEqual(rc.status_code, 200, rc.data)
        body = {
            "supplier_id": self.supplier.id, "invoice_no": "X",
            "received_date": date.today().isoformat(),
            "purchase_order_id": po["id"],
            "lines": [
                {"item_id": self.it1.id, "qty": "1", "cost_price": "50",
                 "po_line_id": po["lines"][0]["id"]},
            ],
        }
        r = self.c(self.manager).post("/api/pos/grn/", body, format="json")
        self.assertEqual(r.status_code, 400)

    def test_grn_cannot_overcommit_partial_received_increases_only(self):
        # Receiving more than ordered is allowed but qty_received accumulates;
        # status flips to closed once received >= ordered.
        po = self._make_draft_po(lines=[
            {"item_id": self.it1.id, "qty_ordered": "5", "unit_cost": "50", "tax_rate_pct": "0"},
        ])
        self._submit_po(po["id"])
        line1 = po["lines"][0]
        b1 = {"supplier_id": self.supplier.id, "received_date": date.today().isoformat(),
              "purchase_order_id": po["id"],
              "lines": [{"item_id": self.it1.id, "qty": "3", "cost_price": "50",
                         "po_line_id": line1["id"]}]}
        r1 = self.c(self.manager).post("/api/pos/grn/", b1, format="json")
        self.assertEqual(r1.data["po_status"], "partial")
        b2 = {"supplier_id": self.supplier.id, "received_date": date.today().isoformat(),
              "purchase_order_id": po["id"],
              "lines": [{"item_id": self.it1.id, "qty": "4", "cost_price": "50",
                         "po_line_id": line1["id"]}]}
        r2 = self.c(self.manager).post("/api/pos/grn/", b2, format="json")
        self.assertEqual(r2.data["po_status"], "closed")
        from .models import PurchaseOrderLine
        pl = PurchaseOrderLine.objects.get(pk=line1["id"])
        self.assertEqual(pl.qty_received, Decimal("7.000"))

    def test_close_po_manual_keeps_existing_received_qty(self):
        po = self._make_draft_po()
        self._submit_po(po["id"])
        line1 = po["lines"][0]
        b1 = {"supplier_id": self.supplier.id, "received_date": date.today().isoformat(),
              "purchase_order_id": po["id"],
              "lines": [{"item_id": self.it1.id, "qty": "2", "cost_price": "50",
                         "po_line_id": line1["id"]}]}
        self.c(self.manager).post("/api/pos/grn/", b1, format="json")
        rc = self.c(self.manager).post(f"/api/pos/purchase-orders/{po['id']}/close/", {}, format="json")
        self.assertEqual(rc.status_code, 200, rc.data)
        self.assertEqual(rc.data["status"], "closed")
        from .models import PurchaseOrderLine
        pl = PurchaseOrderLine.objects.get(pk=line1["id"])
        self.assertEqual(pl.qty_received, Decimal("2.000"))

    def test_grn_validates_outlet_and_item_match(self):
        # Build a PO at outlet, then try a GRN where the line's item doesn't
        # match the po_line — expect 400.
        po = self._make_draft_po()
        self._submit_po(po["id"])
        line1 = po["lines"][0]   # item=it1
        body = {
            "supplier_id": self.supplier.id, "received_date": date.today().isoformat(),
            "purchase_order_id": po["id"],
            "lines": [
                {"item_id": self.it2.id, "qty": "1", "cost_price": "50",
                 "po_line_id": line1["id"]},   # mismatched item
            ],
        }
        r = self.c(self.manager).post("/api/pos/grn/", body, format="json")
        self.assertEqual(r.status_code, 400)
        # Outlet mismatch — try to PATCH/cancel from a foreign-outlet user.
        other_outlet = Outlet.objects.create(outlet_name="Other")
        other_mgr = User.objects.create_user(username="omgr", password="x",
                                             role=User.Role.MANAGER, outlet=other_outlet)
        r2 = self.c(other_mgr).get(f"/api/pos/purchase-orders/{po['id']}/")
        self.assertEqual(r2.status_code, 403)


# -------------------------------------------------------------------
# Phase 4 Agent 13 — Payment gateway + SMS receipt tests
# -------------------------------------------------------------------

class PaymentGatewayTests(_Setup):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username="adm", password="x",
            role=User.Role.ADMIN, outlet=self.outlet,
        )

    def _gw(self, **overrides):
        body = {
            "outlet": self.outlet.id,
            "provider": "mock",
            "merchant_id": "M1",
            "api_key": "secret-key-1",
            "webhook_secret": "wh-sec-1",
            "callback_url": "https://example.com/cb",
            "sandbox": True,
            "is_active": True,
        }
        body.update(overrides)
        return body

    def test_create_payment_gateway_admin_only(self):
        r = self.c(self.cashier).post("/api/pos/payment-gateways/", self._gw(), format="json")
        self.assertEqual(r.status_code, 403)
        r2 = self.c(self.manager).post("/api/pos/payment-gateways/", self._gw(), format="json")
        self.assertEqual(r2.status_code, 403)
        r3 = self.c(self.admin).post("/api/pos/payment-gateways/", self._gw(), format="json")
        self.assertEqual(r3.status_code, 201, r3.data)
        self.assertTrue(r3.data["has_api_key"])
        gid = r3.data["id"]
        r4 = self.c(self.manager).get(f"/api/pos/payment-gateways/{gid}/")
        self.assertEqual(r4.status_code, 200)
        self.assertEqual(r4.data["api_key"], "")
        gw = PaymentGatewayConfig.objects.get(pk=gid)
        self.assertEqual(gw.get_api_key(), "secret-key-1")

    def test_initiate_payment_creates_pending_intent(self):
        gw = PaymentGatewayConfig.objects.create(
            outlet=self.outlet, provider="mock", webhook_secret="s1",
        )
        r = self.c(self.cashier).post("/api/pos/initiate-payment/", {
            "outlet": self.outlet.id, "gateway_id": gw.id, "amount": "500",
            "customer_phone": "0771234567",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["status"], "pending")
        self.assertTrue(r.data["provider_ref"].startswith("MOCK-"))
        self.assertTrue(r.data["qr_data"])
        r2 = self.c(self.cashier).get(f"/api/pos/payment-intents/{r.data['id']}/")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data["status"], "pending")

    def test_webhook_marks_intent_completed(self):
        gw = PaymentGatewayConfig.objects.create(
            outlet=self.outlet, provider="mock", webhook_secret="ok",
        )
        intent = PaymentIntent.objects.create(
            outlet=self.outlet, gateway=gw, amount=Decimal("100"),
            provider_ref="MOCK-AAA", status="pending",
        )
        r = self.c(self.cashier).generic(
            "POST", "/api/pos/webhooks/payment/mock/",
            data=json.dumps({"provider_ref": "MOCK-AAA", "status": "completed", "secret": "ok"}),
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        intent.refresh_from_db()
        self.assertEqual(intent.status, "completed")
        self.assertIsNotNone(intent.completed_at)

    def test_webhook_with_bad_secret_rejected(self):
        gw = PaymentGatewayConfig.objects.create(
            outlet=self.outlet, provider="mock", webhook_secret="rightsecret",
        )
        PaymentIntent.objects.create(
            outlet=self.outlet, gateway=gw, amount=Decimal("100"),
            provider_ref="MOCK-BBB", status="pending",
        )
        r = self.c(self.cashier).generic(
            "POST", "/api/pos/webhooks/payment/mock/",
            data=json.dumps({"provider_ref": "MOCK-BBB", "status": "completed", "secret": "wrong"}),
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 401)

    def test_webhook_idempotent(self):
        gw = PaymentGatewayConfig.objects.create(
            outlet=self.outlet, provider="mock", webhook_secret="ok",
        )
        intent = PaymentIntent.objects.create(
            outlet=self.outlet, gateway=gw, amount=Decimal("100"),
            provider_ref="MOCK-CCC", status="pending",
        )
        body = json.dumps({"provider_ref": "MOCK-CCC", "status": "completed", "secret": "ok"})
        c = APIClient()
        r1 = c.generic("POST", "/api/pos/webhooks/payment/mock/", data=body, content_type="application/json")
        self.assertEqual(r1.status_code, 200)
        r2 = c.generic("POST", "/api/pos/webhooks/payment/mock/", data=body, content_type="application/json")
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.data.get("duplicate"))
        intent.refresh_from_db()
        self.assertEqual(intent.status, "completed")
        self.assertEqual(Payment.objects.filter(reference="MOCK-CCC").count(), 0)


class SmsReceiptTests(TransactionTestCase):
    """SMS dispatch flows through transaction.on_commit, so we use
    TransactionTestCase (TestCase wraps each test in a rolled-back txn and
    never fires on_commit callbacks)."""

    def setUp(self):
        self.outlet = Outlet.objects.create(outlet_name="SMS Outlet")
        self.cashier = User.objects.create_user(
            username="smscash", password="x",
            role=User.Role.STORE_USER, outlet=self.outlet,
        )
        self.it = Item.objects.create(
            outlet=self.outlet, item_code="S1", item_name="Tea", barcode="999",
        )
        PosSnapshot.objects.create(
            outlet=self.outlet, item=self.it, snapshot_date=date.today(),
            pos_quantity=100, cost_price=50, selling_price=80,
        )

    def _client(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    def _open_shift(self):
        self._client(self.cashier).post(
            "/api/pos/shifts/open/", {"opening_cash": "0"}, format="json",
        )

    def _bill(self, *, customer=None, customer_phone=""):
        body = {
            "lines": [{"item_id": self.it.id, "qty": "1", "unit_price": "80"}],
            "payments": [{"tender": "cash", "amount": "80"}],
        }
        if customer is not None:
            body["customer_id"] = customer.id
            # The view resolves customer via customer_phone; mirror the phone so
            # the SMS dispatch (which reads bill.customer_phone || customer.phone)
            # has a target.
            if customer.phone and not customer_phone:
                body["customer_phone"] = customer.phone
        if customer_phone:
            body["customer_phone"] = customer_phone
        return self._client(self.cashier).post(
            "/api/pos/bills/create/", body, format="json",
        )

    def test_sms_sent_after_bill_close_when_phone_present(self):
        SmsConfig.objects.create(
            outlet=self.outlet, provider="mock", sender_id="SHOP", is_active=True,
        )
        cust = Customer.objects.create(
            outlet=self.outlet, name="Foo", phone="0710000001",
        )
        self._open_shift()
        r = self._bill(customer=cust)
        self.assertEqual(r.status_code, 201, r.data)
        log = SmsLog.objects.get()
        self.assertEqual(log.status, SmsLog.Status.SENT)
        self.assertEqual(log.to_phone, "0710000001")
        self.assertTrue(log.provider_ref.startswith("SMS-"))

    def test_sms_skipped_when_no_phone(self):
        SmsConfig.objects.create(
            outlet=self.outlet, provider="mock", is_active=True,
        )
        self._open_shift()
        r = self._bill()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(SmsLog.objects.count(), 0)

    def test_sms_skipped_when_no_active_config(self):
        SmsConfig.objects.create(
            outlet=self.outlet, provider="mock", is_active=False,
        )
        cust = Customer.objects.create(
            outlet=self.outlet, name="Bar", phone="0710000002",
        )
        self._open_shift()
        r = self._bill(customer=cust)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(SmsLog.objects.count(), 0)

    def test_sms_log_records_provider_ref_on_mock(self):
        SmsConfig.objects.create(
            outlet=self.outlet, provider="mock", is_active=True,
        )
        cust = Customer.objects.create(
            outlet=self.outlet, name="Baz", phone="0710000003",
        )
        self._open_shift()
        r = self._bill(customer=cust)
        self.assertEqual(r.status_code, 201)
        log = SmsLog.objects.get()
        self.assertTrue(log.provider_ref)
        self.assertEqual(log.config.provider, "mock")
        self.assertIsNotNone(log.sent_at)


