"""
Drop the orphaned tables left behind by the removed POS, ecom, and catalog_ext
(storefront) apps.

Why this lives in `uploads`: those apps were deleted along with their migration
trees, so we hang the cleanup off a surviving app. `uploads` already runs late
in dependency order on every deploy and is touched on every Stock migrate.

Safe to run more than once — DROP TABLE uses IF EXISTS, and the
django_migrations purge is an unconditional DELETE that becomes a no-op once
the rows are gone.

The Stock domain table `pos_snapshots` (owned by apps.uploads.PosSnapshot) is
deliberately NOT in this list — it holds 900k+ rows of daily inventory data.
"""

from django.db import migrations


# Every table created by apps.pos, apps.ecom, and apps.catalog_ext.
# Listed explicitly (rather than pattern-matched) so the migration is auditable
# and so we don't accidentally take out e.g. apps.uploads.pos_snapshots.
TABLES_TO_DROP = [
    # apps.ecom
    "ecom_order_lines",
    "ecom_orders",
    "ecom_cart_items",
    "ecom_carts",
    "ecom_addresses",
    "ecom_payhere_payments",
    # apps.catalog_ext (storefront)
    "catalog_price_list_items",
    "catalog_price_lists",
    "catalog_product_descriptions",
    "catalog_product_images",
    # apps.pos
    "pos_bill_lines",
    "pos_bills",
    "pos_bill_sequences",
    "pos_idempotency_keys",
    "pos_shifts",
    "pos_customers",
    "pos_customer_credit_txns",
    "pos_payments",
    "pos_payment_intents",
    "pos_payment_gateways",
    "pos_sms_configs",
    "pos_sms_logs",
    "pos_promotions",
    "pos_promotions_combo_items",
    "pos_coupons",
    "pos_coupon_redemptions",
    "pos_gift_cards",
    "pos_gift_card_txns",
    "pos_tax_components",
    "pos_discount_policies",
    "pos_gl_accounts",
    "pos_gl_entries",
    "pos_gl_exports",
    "pos_cash_handovers",
    "pos_commission_rules",
    "pos_goods_receipt_lines",
    "pos_goods_receipts",
    "pos_purchase_order_lines",
    "pos_purchase_orders",
    "pos_purchase_return_lines",
    "pos_purchase_returns",
    "pos_expenses",
    "pos_supplier_payment_txns",
]


def _drop_sql():
    # Single DO block so PG drops every table atomically. CASCADE handles any
    # leftover FKs from non-listed objects. Tables that don't exist (e.g. on
    # fresh dev installs that never had POS/ecom) are silently skipped.
    inner = "\n        ".join(
        f"EXECUTE 'DROP TABLE IF EXISTS public.{t} CASCADE';"
        for t in TABLES_TO_DROP
    )
    return f"""
    DO $$
    BEGIN
        {inner}
    END$$;

    DELETE FROM django_migrations WHERE app IN ('pos', 'ecom', 'catalog_ext');
    """


class Migration(migrations.Migration):
    dependencies = [
        ("uploads", "0013_uploaded_sheet"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_drop_sql(),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
