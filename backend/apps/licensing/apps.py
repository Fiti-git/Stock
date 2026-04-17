import os

from django.apps import AppConfig


class LicensingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.licensing'
    label = 'licensing'

    def ready(self):
        if os.environ.get('RUN_MAIN') == 'true':
            from apps.licensing.tasks import start_heartbeat
            start_heartbeat()
