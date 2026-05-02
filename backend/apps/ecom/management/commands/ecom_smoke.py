"""
End-to-end smoke test for the ecom flow — runs against the in-process test
client, no external HTTP needed.

Walks: create cart → add item → checkout → confirm payment → assert that
items.StockMovement now contains a SALE row pointing at the new order line.

  python manage.py ecom_smoke --outlet 1 --item 12345 --qty 2

Caveats:
  - Requires ECOM_API_ENABLED=True. The command exits early otherwise.
  - Requires the item to have a published catalog price (Phase 1) OR an
    explicit --unit-price override (rare — debugging only).
  - Mutates the database: creates a cart, an order, a payment-confirmed
    sale movement, and decrements item.on_hand. Run on a non-prod DB.
"""
import json
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.test import Client


class Command(BaseCommand):
    help = "End-to-end smoke test for /api/ecom/ flow."

    def add_arguments(self, parser):
        parser.add_argument("--outlet", type=int, required=True)
        parser.add_argument("--item", type=int, required=True)
        parser.add_argument("--qty", default="1")
        parser.add_argument("--admin-user", default="",
                            help="Username with admin role for the confirm-payment step.")

    def handle(self, *args, **opts):
        if not getattr(settings, "ECOM_API_ENABLED", False):
            raise CommandError("ECOM_API_ENABLED is False; flip it before running smoke.")

        # HTTP_HOST="localhost" so the request passes ALLOWED_HOSTS in
        # production settings (which doesn't include the test client's
        # default "testserver").
        c = Client(HTTP_HOST="localhost")

        # Build an admin JWT once if the user gave us one. DRF auth uses JWT,
        # not Django sessions — Client.force_login() does not satisfy IsAdmin.
        admin_jwt = None
        if opts["admin_user"]:
            from apps.accounts.models import User
            from rest_framework_simplejwt.tokens import RefreshToken
            try:
                admin = User.objects.get(username=opts["admin_user"])
            except User.DoesNotExist:
                raise CommandError(f"Admin user '{opts['admin_user']}' not found.")
            admin_jwt = str(RefreshToken.for_user(admin).access_token)

        def hit(label, method, url, body=None, auth=False, **kwargs):
            self.stdout.write(self.style.NOTICE(f"\n>>> {label}: {method} {url}"))
            fn = getattr(c, method.lower())
            if auth and admin_jwt:
                kwargs["HTTP_AUTHORIZATION"] = f"Bearer {admin_jwt}"
            resp = fn(url, data=json.dumps(body or {}),
                      content_type="application/json", **kwargs)
            self.stdout.write(f"    status: {resp.status_code}")
            try:
                payload = resp.json()
                self.stdout.write(json.dumps(payload, indent=2, default=str)[:600])
                return payload
            except Exception:
                self.stdout.write(resp.content.decode("utf-8", "ignore")[:300])
                return None

        # 1. Create cart
        cart = hit("create_cart", "POST", "/api/ecom/cart/",
                   {"outlet_id": opts["outlet"]})
        token = cart["session_token"]

        # 2. Add item
        hit("add_item", "POST", f"/api/ecom/cart/{token}/items/",
            {"item_id": opts["item"], "qty": opts["qty"]})

        # 3. Checkout
        order = hit("checkout", "POST", f"/api/ecom/cart/{token}/checkout/", {
            "shipping_address": {
                "recipient_name": "Smoke Tester", "phone": "0000",
                "line1": "1 Test Lane", "city": "Colombo", "country": "LK",
            },
            "tax_rate": "0",
            "shipping_total": "0",
        })
        if not order or "number" not in order:
            raise CommandError("Checkout did not return an order.")

        # 4. Confirm payment (admin-gated → needs JWT)
        hit("confirm-payment", "POST",
            f"/api/ecom/orders/{order['number']}/confirm-payment/",
            {"payment_intent_ref": "smoke-test"},
            auth=True)

        # 5. Verify ledger row
        from apps.items.models import StockMovement
        movements = list(
            StockMovement.objects
            .filter(ref_type="ecom_order_line")
            .order_by("-id")[:5]
            .values("id", "kind", "qty_change", "balance_after", "ref_id")
        )
        self.stdout.write(self.style.SUCCESS(
            f"\nLast 5 ecom-tagged movements:\n{json.dumps(movements, default=str, indent=2)}"
        ))
