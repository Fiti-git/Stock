from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q

from apps.uploads.models import UploadedSheet


class Command(BaseCommand):
    help = "Clear the legacy `rows` JSON blob from UploadedSheet records to reclaim DB space."

    def add_arguments(self, parser):
        parser.add_argument(
            "--older-than-days",
            type=int,
            default=90,
            help="Only purge rows from sheets uploaded more than N days ago (default: 90).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview how many records would be affected without making changes.",
        )

    def handle(self, *args, **options):
        days = options["older_than_days"]
        dry_run = options["dry_run"]

        cutoff = timezone.now() - timedelta(days=days)

        qs = UploadedSheet.objects.filter(
            uploaded_at__lt=cutoff,
        ).exclude(
            Q(rows__isnull=True) | Q(rows=[])
        )

        count = qs.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No records to purge."))
            return

        # Estimate size: sample up to 100 records
        sample = list(qs.values_list("rows", flat=True)[:100])
        import json
        total_sample_bytes = sum(len(json.dumps(r)) for r in sample if r)
        avg_bytes = total_sample_bytes / len(sample) if sample else 0
        estimated_mb = (avg_bytes * count) / (1024 * 1024)

        self.stdout.write(
            f"{'[DRY RUN] ' if dry_run else ''}"
            f"Found {count} record(s) older than {days} day(s) with non-empty rows.\n"
            f"Estimated space to reclaim: ~{estimated_mb:.1f} MB"
        )

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run — no changes made."))
            return

        updated = qs.update(rows=[])
        self.stdout.write(
            self.style.SUCCESS(f"Cleared rows on {updated} record(s). Estimated ~{estimated_mb:.1f} MB freed.")
        )
        self.stdout.write("Run VACUUM ANALYZE on your DB to reclaim the physical space.")
