"""Base adapter contract for payment gateways."""


class BaseGatewayAdapter:
    """All concrete adapters must subclass this and implement both methods."""

    def __init__(self, config):
        self.config = config  # PaymentGatewayConfig instance

    def initiate(self, *, amount, reference, customer_phone="", extra=None):
        """Initiate a payment with the upstream provider.

        Returns a dict with keys:
          - provider_ref: provider's transaction id (str)
          - payment_url:  url for hosted-page flows ("" if N/A)
          - qr_data:      raw QR payload for QR flows ("" if N/A)
          - raw:          dict, untouched provider response (for audit)
        """
        raise NotImplementedError

    def verify_webhook(self, headers, body):
        """Validate the webhook signature/secret and parse the payload.

        Returns: {provider_ref, status, raw}.
        Raises ValueError if the signature is missing/invalid.
        """
        raise NotImplementedError
