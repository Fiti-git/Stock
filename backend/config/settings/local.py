from .base import *
from decouple import config

# ------------------------
# BASIC SETTINGS
# ------------------------
DEBUG = config("DEBUG", default=True, cast=bool)

# Allow all hosts (for development/testing purposes)
ALLOWED_HOSTS = ["*"]

# ------------------------
# DATABASE (DOCKER)
# ------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("POSTGRES_DB"),
        "USER": config("POSTGRES_USER"),
        "PASSWORD": config("POSTGRES_PASSWORD"),
        "HOST": config("POSTGRES_HOST", default="db"),
        "PORT": config("POSTGRES_PORT", default="5432"),
    }
}

# ------------------------
# CORS SETTINGS (FRONTEND ACCESS)
# ------------------------
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://123.231.60.24:3001",
    "http://123.231.60.24:1609",
]

CORS_ALLOW_CREDENTIALS = True

# ------------------------
# CSRF SETTINGS (IMPORTANT)
# ------------------------
CSRF_TRUSTED_ORIGINS = [
    "http://123.231.60.24:3001",
    "http://123.231.60.24:1609",
]

# ------------------------
# OPTIONAL (GOOD PRACTICE)
# ------------------------
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Dev bypass: skip license middleware locally
MIDDLEWARE = [m for m in MIDDLEWARE if "LicenseMiddleware" not in m]