import hashlib
import hmac
import time
import logging

import jwt
import requests
from datetime import datetime, timedelta, timezone

from apps.licensing.models import LicenseConfiguration, CachedLicense

logger = logging.getLogger(__name__)


def _build_signature(instance_id: str, timestamp: int, secret: str) -> str:
    message = f'{instance_id}|{timestamp}'
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def verify_license(config: LicenseConfiguration) -> dict:
    """Call License Server /api/license/verify and return decoded JWT payload."""
    secret = config.get_secret()
    timestamp = int(time.time())
    signature = _build_signature(str(config.instance_id), timestamp, secret)

    url = f'{config.license_server_url.rstrip("/")}/api/license/verify'
    response = requests.post(url, json={
        'instance_id': str(config.instance_id),
        'timestamp': timestamp,
        'signature': signature,
    }, timeout=15)

    if response.status_code != 200:
        raise RuntimeError(f'License verification failed: {response.status_code} {response.text}')

    data = response.json()
    token = data['token']

    payload = jwt.decode(
        token,
        config.license_public_key_pem,
        algorithms=['RS256'],
        options={'verify_exp': True},
    )

    CachedLicense.objects.all().delete()
    CachedLicense.objects.create(
        jwt_token=token,
        decoded_payload=payload,
        expires_at=datetime.fromtimestamp(payload['exp'], tz=timezone.utc),
    )

    return payload


def heartbeat(config: LicenseConfiguration) -> bool:
    """Ping License Server /api/license/heartbeat."""
    url = f'{config.license_server_url.rstrip("/")}/api/license/heartbeat'
    try:
        response = requests.post(url, json={
            'instance_id': str(config.instance_id),
        }, timeout=10)
        return response.status_code == 200
    except Exception as e:
        logger.warning(f'Heartbeat failed: {e}')
        return False


def test_connection(instance_id: str, instance_secret: str, server_url: str, public_key_pem: str) -> dict:
    """Test connection to License Server without saving anything."""
    timestamp = int(time.time())
    signature = _build_signature(instance_id, timestamp, instance_secret)

    url = f'{server_url.rstrip("/")}/api/license/verify'
    response = requests.post(url, json={
        'instance_id': instance_id,
        'timestamp': timestamp,
        'signature': signature,
    }, timeout=15)

    if response.status_code != 200:
        return {'success': False, 'error': f'{response.status_code}: {response.text}'}

    data = response.json()
    token = data['token']

    payload = jwt.decode(
        token,
        public_key_pem,
        algorithms=['RS256'],
        options={'verify_exp': True},
    )

    return {
        'success': True,
        'client_name': payload.get('client_name'),
        'features': payload.get('features', []),
        'state': payload.get('state'),
        'subscription_status': payload.get('subscription_status'),
        'ends_at': payload.get('ends_at'),
    }


def get_cached_or_refresh() -> dict | None:
    """Return cached license payload, refreshing if expired or stale."""
    cached = CachedLicense.objects.first()

    if cached and cached.expires_at > datetime.now(timezone.utc):
        stale_threshold = datetime.now(timezone.utc) - timedelta(hours=24)
        if cached.fetched_at.replace(tzinfo=timezone.utc) > stale_threshold:
            return cached.decoded_payload

    config = LicenseConfiguration.objects.first()
    if not config:
        return None

    try:
        return verify_license(config)
    except Exception as e:
        logger.error(f'License refresh failed: {e}')
        if cached and cached.expires_at > datetime.now(timezone.utc):
            return cached.decoded_payload
        return None
