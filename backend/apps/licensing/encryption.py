import os

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _get_fernet() -> Fernet:
    key = getattr(settings, 'LICENSE_ENCRYPTION_KEY', None)
    if not key:
        raise RuntimeError(
            'LICENSE_ENCRYPTION_KEY is not set. '
            'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> bytes:
    return _get_fernet().encrypt(plaintext.encode())


def decrypt_secret(ciphertext: bytes) -> str:
    try:
        return _get_fernet().decrypt(ciphertext).decode()
    except InvalidToken:
        raise RuntimeError(
            'Failed to decrypt instance_secret. '
            'LICENSE_ENCRYPTION_KEY may have changed or data is corrupted.'
        )
