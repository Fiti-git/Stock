import logging
import threading
import time

from django.apps import apps

logger = logging.getLogger(__name__)

_heartbeat_thread = None


def _heartbeat_loop():
    while True:
        try:
            from apps.licensing.models import LicenseConfiguration
            from apps.licensing.client import heartbeat

            config = LicenseConfiguration.objects.first()
            if config:
                success = heartbeat(config)
                logger.info(f'License heartbeat: {"ok" if success else "failed"}')
        except Exception as e:
            logger.warning(f'Heartbeat error: {e}')

        time.sleep(3600)  # every 60 minutes


def start_heartbeat():
    global _heartbeat_thread
    if _heartbeat_thread and _heartbeat_thread.is_alive():
        return

    _heartbeat_thread = threading.Thread(target=_heartbeat_loop, daemon=True, name='license-heartbeat')
    _heartbeat_thread.start()
    logger.info('License heartbeat thread started.')
