"""Provider-agnostic payment gateway adapters.

The factory `get_adapter(gateway_config)` returns a `BaseGatewayAdapter`
subclass instance bound to that config. For Phase 4 only the MOCK adapter
is fully implemented — real-provider classes raise NotImplementedError until
the merchant onboarding work in a later phase.
"""
from .base import BaseGatewayAdapter
from .mock import MockGatewayAdapter, get_adapter

__all__ = ["BaseGatewayAdapter", "MockGatewayAdapter", "get_adapter"]
