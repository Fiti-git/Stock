"""
Background tasks for the uploads app.
"""
import logging

from celery import shared_task

from .rollups import rebuild_recent

logger = logging.getLogger(__name__)


@shared_task(name="apps.uploads.tasks.rebuild_monthly_rollups")
def rebuild_monthly_rollups(months_back: int = 2):
    """
    Rebuild pos_snapshots_monthly for the last `months_back` months
    (default: current + previous). Idempotent — safe to run any number
    of times.

    Fires nightly via Celery Beat; also fires opportunistically after
    every POS upload (see uploads.views.confirm_upload) so aggregates
    stay fresh for the day rather than lagging by 24h.
    """
    results = rebuild_recent(months_back=months_back)
    summary = {
        str(r.year_month): {"rows": r.upserted_rows, "ms": r.elapsed_ms}
        for r in results
    }
    logger.info("rebuild_monthly_rollups: %s", summary)
    return summary
