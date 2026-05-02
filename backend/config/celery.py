"""
Celery app glue. Phase 0: workers exist but only handle inventory backfills
and reservation expiry. Adding Celery does NOT change any synchronous
request handling — if the worker or Redis is down, the web tier keeps
serving as before.
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

app = Celery("stock")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print(f"Request: {self.request!r}")
