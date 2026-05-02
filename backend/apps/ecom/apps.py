from django.apps import AppConfig


class EcomConfig(AppConfig):
    """
    Phase 2 — ecommerce domain.

    Carts, addresses, orders, order lines. Reuses:
      - pos.Customer for buyer identity
      - pos.Payment / pos.PaymentIntent for payment processing
      - items.Item for catalog
      - items.StockMovement (via items.inventory.apply_movement) as the
        authoritative ledger committed at payment time
      - inventory.StockReservation for soft-holds during checkout

    Every endpoint is gated by settings.ECOM_API_ENABLED (default False)
    so this app can ship dormant in prod.
    """
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ecom"
    label = "ecom"
