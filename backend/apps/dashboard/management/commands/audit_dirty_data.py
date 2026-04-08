"""
Management command: audit_dirty_data

Run this BEFORE `python manage.py migrate` to see exactly what data will be
cleaned up by the pending migrations. It makes NO changes — read-only report.

Usage:
    docker compose exec backend python manage.py audit_dirty_data
"""
from django.core.management.base import BaseCommand
from django.db.models import Count


class Command(BaseCommand):
    help = "Preview data that will be fixed by pending migrations (no changes made)."

    def handle(self, *args, **options):
        self._check_duplicate_stock_counts()
        self._check_duplicate_barcodes()
        self._check_mixed_case_categories()

    def _check_duplicate_stock_counts(self):
        from apps.dashboard.models import StockCount

        duplicates = (
            StockCount.objects.values("outlet_id", "item_id", "count_date")
            .annotate(cnt=Count("id"))
            .filter(cnt__gt=1)
        )
        if not duplicates.exists():
            self.stdout.write(self.style.SUCCESS("✓ No duplicate StockCount records found."))
            return

        self.stdout.write(self.style.WARNING(f"\n⚠  Duplicate StockCount records ({duplicates.count()} groups):"))
        for d in duplicates[:20]:
            self.stdout.write(
                f"   outlet={d['outlet_id']} item={d['item_id']} date={d['count_date']} → {d['cnt']} rows"
                " (migration will keep the most recent)"
            )
        if duplicates.count() > 20:
            self.stdout.write(f"   … and {duplicates.count() - 20} more groups")

    def _check_duplicate_barcodes(self):
        from apps.items.models import Item

        duplicates = (
            Item.objects.exclude(barcode__isnull=True)
            .exclude(barcode="")
            .values("barcode")
            .annotate(cnt=Count("id"))
            .filter(cnt__gt=1)
            .order_by("-cnt")
        )
        if not duplicates.exists():
            self.stdout.write(self.style.SUCCESS("✓ No duplicate barcodes found."))
            return

        self.stdout.write(self.style.WARNING(f"\n⚠  Duplicate barcodes ({duplicates.count()} barcodes):"))
        for d in duplicates[:20]:
            items = Item.objects.filter(barcode=d["barcode"]).select_related("outlet").order_by("barcode_assigned_at", "id")
            self.stdout.write(f"   Barcode {d['barcode']} → {d['cnt']} items:")
            for i, item in enumerate(items):
                action = "KEEP" if i == 0 else "NULL OUT"
                self.stdout.write(
                    f"     [{action}] id={item.id} code={item.item_code} outlet={item.outlet.outlet_name}"
                    f" assigned_at={item.barcode_assigned_at}"
                )
        if duplicates.count() > 20:
            self.stdout.write(f"   … and {duplicates.count() - 20} more barcodes")

    def _check_mixed_case_categories(self):
        from apps.items.models import Item

        mixed = Item.objects.exclude(category="").exclude(
            category__regex=r"^[A-Z0-9 /\-&().,']+$"
        )
        count = mixed.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS("✓ All categories already uppercase."))
            return

        self.stdout.write(self.style.WARNING(f"\n⚠  {count} items have mixed-case categories (will be uppercased):"))
        seen = set()
        for item in mixed.order_by("category")[:30]:
            if item.category not in seen:
                self.stdout.write(f"   '{item.category}' → '{item.category.strip().upper()}'")
                seen.add(item.category)
        if count > 30:
            self.stdout.write(f"   … and more")

        self.stdout.write(
            self.style.NOTICE("\nRun `python manage.py migrate` to apply all fixes automatically.")
        )
