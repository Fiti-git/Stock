"""
Make the Celery app available as `config.celery_app` so workers can
auto-discover tasks. Imported here so that `manage.py runserver` and the
worker share the same Celery instance.

This import is wrapped in try/except: if celery is not installed (legacy
deployments before requirements.txt is updated), Django still boots
normally without background tasks.
"""
try:
    from .celery import app as celery_app  # noqa: F401
    __all__ = ("celery_app",)
except Exception:  # pragma: no cover
    pass
