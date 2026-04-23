"""Customer credit ledger helper — mirrors items/inventory.apply_movement."""
from decimal import Decimal
from django.db import transaction
from django.db.models import F

from .models import Customer, CustomerCreditTxn


@transaction.atomic
def apply_credit(*, customer, amount, kind, user=None, ref_type="", ref_id="", note=""):
    """
    Atomically adjust a customer's credit balance. `amount` is signed:
    +ve for top-ups/refunds, -ve for redeems.
    """
    locked = Customer.objects.select_for_update().get(pk=customer.pk)
    new_balance = (locked.credit_balance or Decimal("0")) + Decimal(amount)
    if new_balance < Decimal("0") and kind == CustomerCreditTxn.Kind.REDEEM:
        raise ValueError(f"Customer credit balance insufficient (have {locked.credit_balance}, need {-amount}).")
    Customer.objects.filter(pk=customer.pk).update(
        credit_balance=F("credit_balance") + Decimal(amount),
    )
    return CustomerCreditTxn.objects.create(
        customer=locked, amount=Decimal(amount), kind=kind,
        balance_after=new_balance,
        ref_type=ref_type, ref_id=str(ref_id or ""),
        note=note,
        created_by=user if (user and user.is_authenticated) else None,
    )
