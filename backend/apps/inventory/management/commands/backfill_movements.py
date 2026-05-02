"""
Backfill stock_movements from existing line tables — one-shot, idempotent.

Phase 0 cutover plan (live system, zero downtime):
  1. Deploy code with INVENTORY_LEDGER_ENABLED=False (default).
  2. Run migrations (additive — no risk).
  3. Run this command in DRY RUN to estimate volume:
       python manage.py backfill_movements --dry-run
  4. Run it for real (idempotent — UNIQUE constraint blocks duplicates):
       python manage.py backfill_movements
     Can be interrupted and re-run; it picks up where it left off.
  5. Verify totals match latest PosSnapshot per (outlet, item):
       python manage.py backfill_movements --verify
  6. Once verified, set INVENTORY_LEDGER_ENABLED=True. From this moment
     forward, signals append new movements as they happen. Existing rows
     do NOT need re-processing.
  7. Rebuild the StockBalance cache:
       python manage.py backfill_movements --rebuild-balances

Safety guarantees:
  - PosSnapshot, GrnLine, SalesLine, etc. are only READ. Never modified.
  - All inserts are additive into stock_movements.
  - Idempotent: re-running is safe — duplicates blocked by UNIQUE
    (source_table, source_id, movement_type).
  - Chunked: each producer is processed in CHUNK rows at a time so you
    can Ctrl+C without losing progress.
"""
from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.inventory.models import StockMovement, StockBalance
from apps.items.models import Item
from apps.uploads.models import (
    PosSnapshot,
    GrnLine,
    SalesLine,
    SalesReturnLine,
    DamageLine,
    OfficeLine,
    RtsLine,
)
from apps.dashboard.models import StockCount


CHUNK = 5000
MT = StockMovement.MovementType


def _coerce_dt(value):
    """Date or datetime → tz-aware datetime."""
    if value is None:
        return timezone.now()
    if hasattr(value, "hour"):
        return value if timezone.is_aware(value) else timezone.make_aware(value)
    dt = datetime.combine(value, datetime.min.time())
    return timezone.make_aware(dt)


class Command(BaseCommand):
    help = "Backfill stock_movements from existing line tables (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                            help="Print volumes; insert nothing.")
        parser.add_argument("--verify", action="store_true",
                            help="Compare SUM(movements) vs latest PosSnapshot per item.")
        parser.add_argument("--rebuild-balances", action="store_true",
                            help="Rebuild stock_balances from the ledger.")
        parser.add_argument("--only", default="",
                            help="Comma-separated subset: opening,grn,sales,sales_return,damage,office,rts,count")
        parser.add_argument("--outlet", type=int, default=None,
                            help="Restrict backfill to one outlet (for staged rollout).")

    # ------------------------------------------------------------------
    # Top-level dispatch
    # ------------------------------------------------------------------
    def handle(self, *args, **opts):
        self.dry = opts["dry_run"]
        self.outlet_id = opts.get("outlet")
        only = {s.strip() for s in opts["only"].split(",") if s.strip()}

        if opts["verify"]:
            return self.do_verify()
        if opts["rebuild_balances"]:
            return self.do_rebuild_balances()

        steps = [
            ("opening", self.backfill_opening),
            ("grn",     self.backfill_grn),
            ("sales",   self.backfill_sales),
            ("sales_return", self.backfill_sales_return),
            ("damage",  self.backfill_damage),
            ("office",  self.backfill_office),
            ("rts",     self.backfill_rts),
            ("count",   self.backfill_count_adjust),
        ]
        for name, fn in steps:
            if only and name not in only:
                continue
            self.stdout.write(self.style.NOTICE(f"\n=== {name} ==="))
            fn()
        self.stdout.write(self.style.SUCCESS("\nBackfill complete."))
        if self.dry:
            self.stdout.write(self.style.WARNING("(DRY RUN — no rows inserted)"))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _outlet_filter(self, qs, field="outlet_id"):
        if self.outlet_id is not None:
            return qs.filter(**{field: self.outlet_id})
        return qs

    def _item_id_map(self, outlet_id, item_codes):
        """Bulk resolve item_code → item_id for one outlet."""
        return dict(
            Item.objects
            .filter(outlet_id=outlet_id, item_code__in=list(item_codes))
            .values_list("item_code", "id")
        )

    def _bulk_insert(self, rows):
        if self.dry or not rows:
            return len(rows)
        # ignore_conflicts is the idempotency engine — re-runs skip duplicates.
        StockMovement.objects.bulk_create(rows, ignore_conflicts=True, batch_size=1000)
        return len(rows)

    def _process_line_table(self, label, model, sign, mt, source_table,
                            source_doc_field, ts_field="txn_date"):
        qs = self._outlet_filter(model.objects.all()).order_by("id")
        total = qs.count()
        self.stdout.write(f"  {label}: {total} rows")
        done = 0
        for start in range(0, total, CHUNK):
            chunk = list(qs[start:start + CHUNK])
            if not chunk:
                break
            # Resolve item_codes per outlet (chunk may span outlets)
            by_outlet = {}
            for line in chunk:
                by_outlet.setdefault(line.outlet_id, set()).add(line.item_code)
            id_maps = {oid: self._item_id_map(oid, codes) for oid, codes in by_outlet.items()}

            rows = []
            for line in chunk:
                item_id = id_maps.get(line.outlet_id, {}).get(line.item_code)
                if item_id is None:
                    continue
                qty_val = sign * (line.qty or Decimal("0"))
                if qty_val == 0:
                    continue
                rows.append(StockMovement(
                    outlet_id=line.outlet_id,
                    item_id=item_id,
                    qty=qty_val,
                    movement_type=mt,
                    source_table=source_table,
                    source_id=line.id,
                    source_doc=getattr(line, source_doc_field, "") or "",
                    unit_cost=getattr(line, "cost_price", None),
                    moved_at=_coerce_dt(getattr(line, ts_field, None)),
                ))
            self._bulk_insert(rows)
            done += len(chunk)
            self.stdout.write(f"    progress: {done}/{total}")

    # ------------------------------------------------------------------
    # Backfills
    # ------------------------------------------------------------------
    def backfill_opening(self):
        """
        Opening balance = earliest PosSnapshot per (outlet, item). Anchors
        the ledger. After this row, every later GRN/sale/etc. moves the
        running total around the snapshot's value.
        """
        qs = self._outlet_filter(
            PosSnapshot.objects.order_by("outlet_id", "item_id", "snapshot_date", "uploaded_at")
        )
        seen = set()
        rows = []
        n = 0
        for s in qs.iterator(chunk_size=2000):
            key = (s.outlet_id, s.item_id)
            if key in seen:
                continue
            seen.add(key)
            qty = s.pos_quantity or Decimal("0")
            if qty == 0:
                continue
            rows.append(StockMovement(
                outlet_id=s.outlet_id,
                item_id=s.item_id,
                qty=qty,
                movement_type=MT.OPENING_BALANCE,
                source_table="pos_snapshots",
                source_id=s.id,
                source_doc="opening",
                unit_cost=s.cost_price,
                moved_at=_coerce_dt(s.snapshot_date),
            ))
            if len(rows) >= 1000:
                self._bulk_insert(rows)
                n += len(rows)
                rows = []
        if rows:
            self._bulk_insert(rows)
            n += len(rows)
        self.stdout.write(f"  opening_balance rows queued: {n}")

    def backfill_grn(self):
        self._process_line_table("grn_lines", GrnLine, Decimal("1"),
                                 MT.GRN, "grn_lines", "do_no")

    def backfill_sales(self):
        self._process_line_table("sales_lines", SalesLine, Decimal("-1"),
                                 MT.SALE, "sales_lines", "invoice_no")

    def backfill_sales_return(self):
        self._process_line_table("sales_return_lines", SalesReturnLine, Decimal("1"),
                                 MT.SALES_RETURN, "sales_return_lines", "invoice_no")

    def backfill_damage(self):
        self._process_line_table("damage_lines", DamageLine, Decimal("-1"),
                                 MT.DAMAGE, "damage_lines", "doc_no")

    def backfill_office(self):
        self._process_line_table("office_lines", OfficeLine, Decimal("-1"),
                                 MT.OFFICE_USE, "office_lines", "doc_no")

    def backfill_rts(self):
        self._process_line_table("rts_lines", RtsLine, Decimal("-1"),
                                 MT.RTS, "rts_lines", "do_no")

    def backfill_count_adjust(self):
        """
        For each APPROVED count, write the variance delta as a count_adjust
        movement. Variance = actual_qty - on_hand_at_count_time, computed
        from the ledger as it stands AFTER all other producers are done.
        """
        qs = self._outlet_filter(
            StockCount.objects
            .filter(approval_status="approved")
            .order_by("counted_at", "id")
        )
        total = qs.count()
        self.stdout.write(f"  approved counts: {total}")
        rows = []
        n = 0
        for c in qs.iterator(chunk_size=2000):
            on_hand = (
                StockMovement.objects
                .filter(outlet_id=c.outlet_id, item_id=c.item_id, moved_at__lte=c.counted_at)
                .aggregate(s=Sum("qty"))["s"] or Decimal("0")
            )
            delta = (c.actual_qty or Decimal("0")) - on_hand
            if delta == 0:
                continue
            rows.append(StockMovement(
                outlet_id=c.outlet_id,
                item_id=c.item_id,
                qty=delta,
                movement_type=MT.COUNT_ADJUST,
                source_table="stock_counts",
                source_id=c.id,
                source_doc=f"count#{c.id}",
                moved_at=c.counted_at or timezone.now(),
                created_by_id=getattr(c, "approved_by_id", None) or getattr(c, "counted_by_id", None),
            ))
            if len(rows) >= 1000:
                self._bulk_insert(rows)
                n += len(rows)
                rows = []
        if rows:
            self._bulk_insert(rows)
            n += len(rows)
        self.stdout.write(f"  count_adjust rows queued: {n}")

    # ------------------------------------------------------------------
    # Verification & balance rebuild
    # ------------------------------------------------------------------
    def do_verify(self):
        """
        For each (outlet, item) compare SUM(stock_movements.qty) against
        the latest PosSnapshot.pos_quantity. Reports up to 50 mismatches.
        """
        self.stdout.write("Verifying ledger vs. latest PosSnapshot per item...")
        snap_qs = self._outlet_filter(PosSnapshot.objects.order_by(
            "outlet_id", "item_id", "-snapshot_date", "-uploaded_at"
        ))
        latest = {}
        for s in snap_qs.iterator(chunk_size=2000):
            k = (s.outlet_id, s.item_id)
            if k not in latest:
                latest[k] = s.pos_quantity or Decimal("0")

        led_qs = self._outlet_filter(
            StockMovement.objects.values("outlet_id", "item_id")
            .annotate(total=Sum("qty"))
        )
        ledger = {(r["outlet_id"], r["item_id"]): (r["total"] or Decimal("0")) for r in led_qs}

        diffs = []
        for k, snap_qty in latest.items():
            led_qty = ledger.get(k, Decimal("0"))
            if abs(led_qty - snap_qty) > Decimal("0.001"):
                diffs.append((k, snap_qty, led_qty, led_qty - snap_qty))

        self.stdout.write(f"  items checked: {len(latest)}")
        self.stdout.write(f"  ledger-only items (no snapshot): {len(ledger) - len(latest)}")
        self.stdout.write(self.style.WARNING(f"  mismatches: {len(diffs)}"))
        for (oid, iid), snap_q, led_q, d in diffs[:50]:
            self.stdout.write(f"    outlet={oid} item={iid} snapshot={snap_q} ledger={led_q} diff={d}")
        if len(diffs) > 50:
            self.stdout.write(f"    ... and {len(diffs) - 50} more")
        if not diffs:
            self.stdout.write(self.style.SUCCESS("  ✓ ledger matches snapshots"))

    def do_rebuild_balances(self):
        """Rebuild stock_balances from the ledger. Truncate-and-replace."""
        if self.dry:
            self.stdout.write("DRY RUN — would rebuild stock_balances")
            return
        self.stdout.write("Rebuilding stock_balances from ledger...")
        with transaction.atomic():
            qs = self._outlet_filter(StockBalance.objects.all())
            qs.delete()
            agg = (
                self._outlet_filter(StockMovement.objects)
                .values("outlet_id", "item_id")
                .annotate(on_hand=Sum("qty"))
            )
            rows = [
                StockBalance(outlet_id=r["outlet_id"], item_id=r["item_id"],
                             on_hand=r["on_hand"] or Decimal("0"))
                for r in agg
            ]
            StockBalance.objects.bulk_create(rows, batch_size=1000)
            self.stdout.write(self.style.SUCCESS(f"  ✓ {len(rows)} balances rebuilt"))
