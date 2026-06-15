"""
Background tasks for the dashboard app.

  - auto_close_stale_count_sessions: every 15 minutes, close any count
    session that has been OPEN for more than 72 hours since started_at.

    Sessions also auto-close synchronously on next-day POS upload (see
    apps.uploads.views.confirm). The 72h sweep is a safety net for cases
    where no follow-up upload arrives — e.g. outlet skips a day.

    Closing here calls services.finalize_count_session so submitted counts
    are auto-approved and variance records are generated — the same end
    state a manual close produces. Earlier versions of this task only
    flipped the status to CLOSED, leaving submitted counts in limbo.

    There's no manual "start session" anywhere; sessions open lazily on
    the first count via apps.dashboard.views._get_or_create_open_session.
    Manual "close" is still allowed as an admin override.
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import CountSession
from .services import finalize_count_session

logger = logging.getLogger(__name__)

STALE_HOURS = 72


@shared_task(name="apps.dashboard.tasks.auto_close_stale_count_sessions")
def auto_close_stale_count_sessions():
    cutoff = timezone.now() - timedelta(hours=STALE_HOURS)
    stale = list(
        CountSession.objects.filter(
            status=CountSession.Status.OPEN,
            started_at__lt=cutoff,
        ).select_related("outlet")
    )

    closed = 0
    approved_total = 0
    variances_total = 0
    for session in stale:
        try:
            result = finalize_count_session(session, closed_by=None)
            closed += 1
            approved_total += result["approved"]
            variances_total += result["variances_created"]
        except Exception:
            logger.exception("auto_close failed for session %s", session.id)

    return {
        "closed": closed,
        "approved": approved_total,
        "variances_created": variances_total,
    }
