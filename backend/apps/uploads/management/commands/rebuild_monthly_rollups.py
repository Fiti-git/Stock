"""
Manual entry point for pos_snapshots_monthly rebuilds.

Usage:
  # Rebuild current + previous month (same as the nightly Celery job):
  python manage.py rebuild_monthly_rollups

  # Rebuild the last 6 months:
  python manage.py rebuild_monthly_rollups --months-back 6

  # Full backfill from a specific month to today:
  python manage.py rebuild_monthly_rollups --from 2025-01-01

  # Custom range:
  python manage.py rebuild_monthly_rollups --from 2025-06-01 --to 2025-12-01
"""
from datetime import date, datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.uploads.rollups import (
    rebuild_recent, rebuild_range, month_floor,
)


def _parse_month(s: str) -> date:
    try:
        return month_floor(datetime.strptime(s, "%Y-%m-%d").date())
    except ValueError:
        raise CommandError(f"Bad date {s!r} — use YYYY-MM-DD")


class Command(BaseCommand):
    help = "Rebuild pos_snapshots_monthly rollup rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--months-back",
            type=int,
            default=None,
            help="Rebuild the last N months (default: 2 = current + previous). "
                 "Ignored when --from/--to are given.",
        )
        parser.add_argument(
            "--from",
            dest="from_month",
            type=str,
            default=None,
            help="Start month (YYYY-MM-DD, day-of-month ignored). Enables range mode.",
        )
        parser.add_argument(
            "--to",
            dest="to_month",
            type=str,
            default=None,
            help="End month (YYYY-MM-DD, inclusive). Defaults to current month.",
        )

    def handle(self, *args, **opts):
        from_month = opts["from_month"]
        to_month = opts["to_month"]
        months_back = opts["months_back"]

        if from_month:
            start = _parse_month(from_month)
            end = _parse_month(to_month) if to_month else month_floor(timezone.localdate())
            self.stdout.write(f"Rebuilding rollups from {start} to {end}…")
            results = rebuild_range(start, end)
        else:
            n = months_back if months_back is not None else 2
            self.stdout.write(f"Rebuilding rollups for last {n} month(s)…")
            results = rebuild_recent(months_back=n)

        total_rows = sum(r.upserted_rows for r in results)
        total_ms = sum(r.elapsed_ms for r in results)
        for r in results:
            self.stdout.write(
                f"  {r.year_month:%Y-%m}  {r.upserted_rows:>7} rows  {r.elapsed_ms:>5} ms"
            )
        self.stdout.write(self.style.SUCCESS(
            f"Done. {len(results)} month(s), {total_rows} row(s) upserted, {total_ms} ms total."
        ))
