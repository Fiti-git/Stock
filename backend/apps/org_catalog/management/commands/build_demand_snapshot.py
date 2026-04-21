"""
Rebuild org_demand_snapshots from approved SalesLine rows in the last 90 days.

Run nightly (cron/supervisor/etc.). Safe to re-run — the command truncates and
repopulates the table in a single transaction, so readers either see the old
snapshot or the new one.
"""
from datetime import timedelta, date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum, Max
from django.utils import timezone

from apps.items.models import Item
from apps.org_catalog.models import DemandSnapshot, ItemMasterLink
from apps.uploads.models import SalesLine, SalesUploadBatch


class Command(BaseCommand):
    help = "Rebuild DemandSnapshot rows from recent approved sales."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days", type=int, default=90,
            help="Window to aggregate (default 90).",
        )

    def handle(self, *args, **options):
        window_days = options["days"]
        today = timezone.localdate()
        start_date = today - timedelta(days=window_days)

        # Build item → master_id lookup. One query, dict lookup in the loop.
        links = dict(
            ItemMasterLink.objects.values_list("item_id", "master_product_id")
        )
        if not links:
            self.stdout.write("No item → master links exist yet; nothing to aggregate.")
            DemandSnapshot.objects.all().delete()
            return

        # Item (outlet_id, item_code) → item_id. Lets us reach the master from
        # SalesLine which only carries the raw item_code string.
        item_key = {
            (outlet_id, code): iid
            for iid, outlet_id, code in Item.objects.values_list("id", "outlet_id", "item_code")
        }

        approved_batches = SalesUploadBatch.objects.filter(
            status=SalesUploadBatch.Status.SUCCESS,
            approval_status__in=(
                SalesUploadBatch.ApprovalStatus.AUTO,
                SalesUploadBatch.ApprovalStatus.APPROVED,
            ),
        ).values_list("id", flat=True)

        qs = SalesLine.objects.filter(
            batch_id__in=list(approved_batches),
            txn_date__gte=start_date,
            txn_date__lte=today,
        ).values("outlet_id", "item_code", "txn_date").annotate(qty=Sum("qty"))

        # Accumulate per (master_id, outlet_id): 7d/30d/90d totals + last sale date.
        buckets = {}
        for row in qs.iterator(chunk_size=5000):
            key_lookup = (row["outlet_id"], row["item_code"])
            item_id = item_key.get(key_lookup)
            if not item_id:
                continue
            master_id = links.get(item_id)
            if not master_id:
                continue
            qty = float(row["qty"] or 0)
            if qty <= 0:
                continue
            d = row["txn_date"]
            bkey = (master_id, row["outlet_id"])
            bucket = buckets.setdefault(bkey, {
                "q7": 0.0, "q30": 0.0, "q90": 0.0, "last": None,
            })
            bucket["q90"] += qty
            age = (today - d).days
            if age < 30:
                bucket["q30"] += qty
            if age < 7:
                bucket["q7"] += qty
            if bucket["last"] is None or d > bucket["last"]:
                bucket["last"] = d

        window_7 = max(1, min(7, window_days))
        window_30 = max(1, min(30, window_days))
        window_90 = max(1, window_days)

        rows = [
            DemandSnapshot(
                master_product_id=mid,
                outlet_id=oid,
                avg_daily_qty_7d=b["q7"] / window_7,
                avg_daily_qty_30d=b["q30"] / window_30,
                avg_daily_qty_90d=b["q90"] / window_90,
                total_qty_30d=b["q30"],
                last_sale_date=b["last"],
                on_hand_qty=None,
            )
            for (mid, oid), b in buckets.items()
        ]

        with transaction.atomic():
            DemandSnapshot.objects.all().delete()
            DemandSnapshot.objects.bulk_create(rows, batch_size=1000)

        self.stdout.write(self.style.SUCCESS(
            f"Built {len(rows)} demand snapshots from {qs.count()} sale-line groups."
        ))
