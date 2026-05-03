"""
Phase 5 - additive: fulfilment + payment selection on EcomOrder.

Four new columns on ecom_orders:
  fulfilment_method      delivery | pickup
  pickup_outlet_id       FK outlets (null for delivery orders)
  payment_method         payhere | store_cash | store_card
  payhere_payment_id     PayHere's id from the notify webhook

All have defaults so existing rows (the smoke-test orders from Phase 2)
remain valid; no data migration needed.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ecom", "0001_initial"),
        ("outlets", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="ecomorder",
            name="fulfilment_method",
            field=models.CharField(
                max_length=12, default="delivery",
                choices=[("delivery", "Home delivery"), ("pickup", "Store pickup")],
            ),
        ),
        migrations.AddField(
            model_name="ecomorder",
            name="pickup_outlet",
            field=models.ForeignKey(
                blank=True, null=True,
                help_text="Outlet the customer will collect from. Required when fulfilment_method=pickup.",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="ecom_pickup_orders",
                to="outlets.outlet",
            ),
        ),
        migrations.AddField(
            model_name="ecomorder",
            name="payment_method",
            field=models.CharField(
                max_length=12, default="payhere",
                choices=[
                    ("payhere", "PayHere (online)"),
                    ("store_cash", "Pay at store (cash)"),
                    ("store_card", "Pay at store (card)"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="ecomorder",
            name="payhere_payment_id",
            field=models.CharField(
                blank=True, default="", max_length=64,
                help_text="The id PayHere assigns to a successful charge (from the notify webhook).",
            ),
        ),
    ]
