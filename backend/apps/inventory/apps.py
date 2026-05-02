from django.apps import AppConfig


class InventoryConfig(AppConfig):
    """
    Stock-movement ledger app.

    Phase 0 of the unified-commerce migration: append-only event log of every
    physical inventory change. Signals into this ledger are GATED behind the
    setting INVENTORY_LEDGER_ENABLED (default False) so the live system is
    NEVER affected until the backfill has been verified and the flag is
    flipped on. The flag is read on every signal call — no restart needed.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.inventory"
    label = "inventory"

    def ready(self):
        # Importing signals registers them — but the handlers themselves
        # short-circuit when INVENTORY_LEDGER_ENABLED is False, so this
        # import is safe to keep on by default.
        from . import signals  # noqa: F401
