"""State machine for StockTransfer.

Centralised guard. Every transition in views.py / inventory_ops.py funnels
through `assert_can(from_, to_)` so the allowed graph is testable in one
place and impossible to drift.
"""

from .models import StockTransfer

S = StockTransfer.Status

ALLOWED = {
    S.DRAFT: {S.REQUESTED, S.CANCELLED},
    S.REQUESTED: {S.DISPATCHED, S.CANCELLED},
    S.DISPATCHED: {S.RECEIVED, S.VARIANCE_REVIEW, S.CANCELLED},
    S.RECEIVED: {S.VARIANCE_REVIEW, S.CLOSED},
    S.VARIANCE_REVIEW: {S.CLOSED},
    S.CLOSED: set(),
    S.CANCELLED: set(),
}


def can_transition(from_, to_):
    return to_ in ALLOWED.get(from_, set())


def assert_can(from_, to_):
    if not can_transition(from_, to_):
        raise ValueError(f"Invalid transition: {from_} → {to_}")
