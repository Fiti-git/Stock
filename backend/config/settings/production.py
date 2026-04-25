"""
Production settings. Activated via DJANGO_SETTINGS_MODULE=config.settings.production.

Only deployment-specific overrides live here — everything else is inherited
from base.py. Local/dev settings stay in local.py.
"""
from .base import *  # noqa: F401,F403
from decouple import Csv, config

# ------------------------
# CORE
# ------------------------
DEBUG = False

SECRET_KEY = config("SECRET_KEY")

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="",
    cast=Csv(),
)

# ------------------------
# DATABASE
# ------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("POSTGRES_DB"),
        "USER": config("POSTGRES_USER"),
        "PASSWORD": config("POSTGRES_PASSWORD"),
        "HOST": config("POSTGRES_HOST", default="db"),
        "PORT": config("POSTGRES_PORT", default="5432"),
        "CONN_MAX_AGE": config("DB_CONN_MAX_AGE", default=600, cast=int),
        "CONN_HEALTH_CHECKS": True,
    }
}

# ------------------------
# CACHE (LocMem is fine for a single-process gunicorn group; switch to Redis when needed)
# ------------------------
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "stock-default",
        "TIMEOUT": 300,
    }
}

# ------------------------
# CORS / CSRF
# ------------------------
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

# ------------------------
# SECURITY (terminate TLS at nginx, forward proto header)
# ------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = config("SESSION_COOKIE_SECURE", default=True, cast=bool)
CSRF_COOKIE_SECURE = config("CSRF_COOKIE_SECURE", default=True, cast=bool)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# ------------------------
# LOGGING (stdout for docker)
# ------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "{asctime} {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.db.backends": {"level": "WARNING", "handlers": ["console"], "propagate": False},
        "django.request": {"level": "WARNING", "handlers": ["console"], "propagate": False},
    },
}
