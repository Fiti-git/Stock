"""Mock gateway adapter — never calls a real network endpoint.

`initiate` returns a deterministic-ish provider_ref + a fake LankaQR-style
QR payload string + an in-app payment URL. `verify_webhook` accepts any body
that carries the configured webhook_secret in either an `X-Webhook-Secret`
header or a `secret` field on the JSON body.

Real provider adapters (Sampath / HNB / FriMi / Genie / HelaPay) will live as
sibling modules and override these methods. Until then the factory below maps
every provider to MockGatewayAdapter so dev and tests work without keys.
"""
import json
import secrets
import uuid


class MockGatewayAdapter:
    def __init__(self, config):
        self.config = config

    def initiate(self, *, amount, reference, customer_phone="", extra=None):
        provider_ref = f"MOCK-{uuid.uuid4().hex[:12].upper()}"
        # Fake LankaQR-ish payload — frontends can either render this as a QR
        # via a client-side encoder or just print it as text for dev.
        qr_data = (
            f"00020101021229530016LK.MOCK.GATEWAY01{provider_ref}"
            f"5204000053034145406{amount}5802LK6304ABCD"
        )
        callback = (self.config.callback_url or "").rstrip("/")
        payment_url = f"{callback}/mock-pay/{provider_ref}/" if callback else ""
        return {
            "provider_ref": provider_ref,
            "payment_url": payment_url,
            "qr_data": qr_data,
            "raw": {
                "provider": "mock",
                "amount": str(amount),
                "reference": reference,
                "customer_phone": customer_phone,
            },
        }

    def verify_webhook(self, headers, body):
        # Headers may be a plain dict or a Django HttpHeaders mapping.
        secret_header = (
            headers.get("X-Webhook-Secret")
            or headers.get("HTTP_X_WEBHOOK_SECRET")
            or ""
        )
        try:
            payload = body if isinstance(body, dict) else json.loads(body or "{}")
        except (TypeError, ValueError):
            payload = {}
        secret = secret_header or payload.get("secret") or ""
        expected = self.config.webhook_secret or ""
        if expected and not secrets.compare_digest(str(secret), str(expected)):
            raise ValueError("invalid webhook secret")
        provider_ref = (
            payload.get("provider_ref")
            or payload.get("reference")
            or payload.get("id")
            or ""
        )
        # Default to completed unless the payload says otherwise.
        status = (payload.get("status") or "completed").lower()
        return {"provider_ref": provider_ref, "status": status, "raw": payload}


def get_adapter(gateway_config):
    """Factory: pick adapter class by provider code.

    For Phase 4, every provider returns the MockGatewayAdapter — real merchant
    integrations are out of scope for this agent. When real adapters land they
    should be registered in this dispatch.
    """
    return MockGatewayAdapter(gateway_config)
