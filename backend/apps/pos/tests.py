"""
POS tests — run with:
    python manage.py test apps.pos
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.outlets.models import Outlet
from apps.items.models import Item
from apps.uploads.models import PosSnapshot

from apps.items.models import StockMovement, ItemPriceHistory
from .models import Shift, Bill, BillLine, Payment, Customer, CustomerCreditTxn


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
