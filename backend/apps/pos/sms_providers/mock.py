"""Mock SMS adapter — always succeeds, generates a fake provider_ref.

Real providers (Dialog, Mobitel, Hutch, TextIt) are stubbed in sibling
modules and raise NotImplementedError. Phase 4 ships only this adapter.
"""
import uuid


class MockSmsAdapter:
    def __init__(self, config):
        self.config = config

    def send(self, *, to_phone, body):
        provider_ref = f"SMS-{uuid.uuid4().hex[:10].upper()}"
        return {
            "provider_ref": provider_ref,
            "raw": {
                "to": to_phone,
                "body": body,
                "sender_id": getattr(self.config, "sender_id", "") if self.config else "",
            },
        }


def _stub_real(name):
    class _Stub:
        def __init__(self, config):
            self.config = config

        def send(self, *, to_phone, body):
            # TODO: implement real provider integration; for now, never
            # automatically called because get_sms_adapter routes everything
            # to MockSmsAdapter until real keys are wired.
            raise NotImplementedError(f"{name} SMS adapter not implemented yet")
    _Stub.__name__ = f"{name}SmsAdapter"
    return _Stub


DialogSmsAdapter = _stub_real("Dialog")
MobitelSmsAdapter = _stub_real("Mobitel")
HutchSmsAdapter = _stub_real("Hutch")
TextItSmsAdapter = _stub_real("TextIt")


def get_sms_adapter(config):
    """Factory: every provider currently returns MockSmsAdapter."""
    return MockSmsAdapter(config)
