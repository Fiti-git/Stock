"""
Background tasks for the dashboard app.

  - auto_close_stale_count_sessions: every 15 minutes, close any count
    session that has been OPEN for more than 24 hours since started_at.

    Sessions also auto-close synchronously on next-day POS upload (see
    apps.uploads.views.confirm). The 24h sweep is a safety net for cases
    where no follow-up upload arrives — e.g. outlet skips a day.

    There's no manual "start session" anywhere; sessions open lazily on
    the first count via apps.dashboard.views._get_or_create_open_session.
    Manual "close" is still allowed as an admin override.
"""
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import CountSession


@shared_task(name="apps.dashboard.tasks.auto_close_stale_count_sessions")
def auto_close_stale_count_sessions():
    cutoff = timezone.now() - timedelta(hours=24)
    n = CountSession.objects.filter(
        status=CountSession.Status.OPEN,
        started_at__lt=cutoff,
    ).update(
        status=CountSession.Status.CLOSED,
        closed_at=timezone.now(),
    )
    return {"closed": n}
