"""
One-shot backfill for sessions that were half-closed by the pre-fix cron /
POS-upload trigger.

Symptom of a half-closed session:
  - status = CLOSED
  - has StockCount rows still in approval_status='submitted'
  - OR has zero VarianceRecord rows despite having approved counts

Runs services.finalize_count_session on each. The service is idempotent:
already-finalized sessions are no-ops.

Usage:
    python manage.py backfill_session_closures           # dry run, print counts
    python manage.py backfill_session_closures --apply   # do it
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from apps.dashboard.models import CountSession, StockCount, VarianceRecord
from apps.dashboard.services import finalize_count_session


class Command(BaseCommand):
    help = "Re-finalize sessions that the old auto-close left in a half-broken state."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually run the backfill (default is dry-run).")

    def handle(self, *args, **opts):
        apply = opts["apply"]

        # All sessions that have any submitted counts still hanging.
        stuck_submitted_ids = set(
            StockCount.objects
            .filter(approval_status=StockCount.ApprovalStatus.SUBMITTED)
            .values_list("session_id", flat=True)
            .distinct()
        )

        # CLOSED sessions with submitted counts → definitely half-closed.
        half_closed = list(
            CountSession.objects
            .filter(status=CountSession.Status.CLOSED, id__in=stuck_submitted_ids)
            .select_related("outlet")
            .order_by("count_date")
        )

        # Plus any CLOSED session that has approved counts but no variance
        # records at all — also a sign the closing path skipped step 2.
        # We exclude sessions where variances were never expected (no
        # POS snapshot + no items) by being conservative: only flag those
        # with > 0 approved counts.
        approved_with_no_variance = (
            CountSession.objects
            .filter(status=CountSession.Status.CLOSED)
            .annotate(
                approved_n=Count(
                    "counts",
                    filter=Q(counts__approval_status=StockCount.ApprovalStatus.APPROVED),
                ),
                variance_n=Count("variances"),
            )
            .filter(approved_n__gt=0, variance_n=0)
            .exclude(id__in=[s.id for s in half_closed])
            .select_related("outlet")
            .order_by("count_date")
        )
        approved_with_no_variance = list(approved_with_no_variance)

        total = half_closed + approved_with_no_variance
        self.stdout.write(
            f"Found {len(half_closed)} session(s) with submitted counts still hanging, "
            f"{len(approved_with_no_variance)} session(s) with approved counts but zero variances. "
            f"Total to process: {len(total)}."
        )

        if not apply:
            for s in total[:20]:
                self.stdout.write(f"  - id={s.id} outlet={s.outlet.outlet_name} count_date={s.count_date}")
            if len(total) > 20:
                self.stdout.write(f"  ... and {len(total) - 20} more.")
            self.stdout.write(self.style.WARNING("Dry run — pass --apply to execute."))
            return

        approved_total = 0
        variances_total = 0
        for s in total:
            try:
                r = finalize_count_session(s, closed_by=None)
                approved_total += r["approved"]
                variances_total += r["variances_created"]
                self.stdout.write(
                    f"  · session {s.id} ({s.outlet.outlet_name} / {s.count_date}): "
                    f"approved={r['approved']} variances_created={r['variances_created']}"
                )
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"  ! session {s.id} failed: {exc}"))

        self.stdout.write(self.style.SUCCESS(
            f"Done. Sessions processed: {len(total)} · "
            f"counts auto-approved: {approved_total} · variance records created: {variances_total}"
        ))
