"""
Smoke test for the storefront API.

Hits health, list_categories, list_products, product_detail through the
DRF test client (no live server needed) and prints the responses. Useful
to verify Phase 1 wiring end-to-end before any frontend exists.

  python manage.py storefront_smoke
  python manage.py storefront_smoke --slug some-product
"""
import json

from django.core.management.base import BaseCommand
from django.test import Client


class Command(BaseCommand):
    help = "Smoke test the /api/storefront/ endpoints."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default="", help="Optional product slug for detail check.")

    def handle(self, *args, **opts):
        c = Client()

        def hit(label, url):
            self.stdout.write(self.style.NOTICE(f"\n>>> {label}: GET {url}"))
            resp = c.get(url, HTTP_HOST="localhost")
            self.stdout.write(f"    status: {resp.status_code}")
            try:
                body = resp.json()
                preview = json.dumps(body, indent=2, default=str)[:600]
                self.stdout.write(preview)
            except Exception:
                self.stdout.write(resp.content.decode("utf-8", "ignore")[:400])

        hit("health", "/api/storefront/health/")
        hit("categories", "/api/storefront/categories/")
        hit("products (page 1)", "/api/storefront/products/?page=1&page_size=5")
        if opts["slug"]:
            hit("product detail", f"/api/storefront/products/{opts['slug']}/")

        self.stdout.write(self.style.SUCCESS("\nSmoke test done."))
