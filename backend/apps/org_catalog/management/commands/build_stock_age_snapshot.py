"""
Rebuild stock_age_snapshots via FIFO lot aging across all approved upload
batches. Safe to re-run. Passing --outlet or --item-code narrows the rebuild
so partial recomputes after a single upload are fast.
"""
from django.core.management.base import BaseCommand

from apps.org_catalog.services.stock_age import rebuild_stock_age


class Command(BaseCommand):
    help = "Rebuild StockAgeSnapshot rows from approved upload lines."

    def add_arguments(self, parser):
        parser.add_argument("--outlet", type=int, default=None, help="Only rebuild this outlet.")
        parser.add_argument("--item-code", type=str, default=None, help="Only rebuild this item_code.")

    def handle(self, *args, **options):
        n = rebuild_stock_age(
            outlet_id=options.get("outlet"),
            item_code=options.get("item_code"),
        )
        self.stdout.write(self.style.SUCCESS(f"Built {n} stock-age snapshot rows."))
