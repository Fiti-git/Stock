from django.urls import path
from .views import (
    my_open_shift, open_shift, close_shift, list_shifts,
    product_search, product_by_barcode, quick_products,
    create_bill, void_bill, bill_detail, list_bills, daily_sales,
    customer_search, customers, customer_detail,
    stock_movements, stock_adjust,
    outlet_settings,
    grn_entry, bulk_price_update, price_history,
    customer_credit_adjust, customer_credit_history,
    supplier_search, promotions, promotion_detail, active_promotions,
    park_bill, parked_bills, discard_parked_bill,
    shift_x_report, discount_policies, discount_policy_detail,
    verify_manager_pin, effective_discount_policy,
    item_batches, near_expiry_report,
    coupons, coupon_detail, coupon_redeem_check,
    gift_cards, gift_card_detail, gift_card_adjust, gift_card_void,
    tax_components, tax_component_detail,
    gl_accounts, gl_account_detail,
    gl_export_generate, gl_export_list, gl_export_detail, gl_export_download,
    cash_handover_create, cash_handover_list,
    sales_reps, commission_rules, commission_rule_detail, commission_report,
)
from .views_po import (
    purchase_orders, purchase_order_detail,
    purchase_order_submit, purchase_order_cancel, purchase_order_close,
    purchase_order_lines,
)
from .views_payments import (
    payment_gateways, payment_gateway_detail,
    initiate_payment, payment_intent_detail, payment_webhook,
    sms_configs, sms_config_detail,
)
from .views_sme import (
    product_list_create, product_detail, product_csv_import,
    low_stock_report, top_selling_report, profit_report, tax_summary_report,
    shift_z_report, expenses,
    purchase_return_create, purchase_return_list,
    supplier_payables_report, supplier_payment_create, supplier_ledger,
    units_list,
)

urlpatterns = [
    # Shifts
    path("shifts/my-open/", my_open_shift, name="pos-my-open-shift"),
    path("shifts/open/", open_shift, name="pos-open-shift"),
    path("shifts/<int:shift_id>/close/", close_shift, name="pos-close-shift"),
    path("shifts/", list_shifts, name="pos-shifts"),

    # Products
    path("products/search/", product_search, name="pos-product-search"),
    path("products/by-barcode/", product_by_barcode, name="pos-product-by-barcode"),
    path("products/quick/", quick_products, name="pos-product-quick"),

    # Customers
    path("customers/search/", customer_search, name="pos-customer-search"),
    path("customers/", customers, name="pos-customers"),
    path("customers/<int:customer_id>/", customer_detail, name="pos-customer-detail"),

    # Bills
    path("bills/", list_bills, name="pos-bills"),
    path("bills/create/", create_bill, name="pos-bill-create"),
    path("bills/park/", park_bill, name="pos-bill-park"),
    path("bills/parked/", parked_bills, name="pos-bills-parked"),
    path("bills/<int:bill_id>/discard/", discard_parked_bill, name="pos-bill-discard"),
    path("bills/<int:bill_id>/", bill_detail, name="pos-bill-detail"),
    path("bills/<int:bill_id>/void/", void_bill, name="pos-bill-void"),

    # Inventory
    path("stock/movements/", stock_movements, name="pos-stock-movements"),
    path("stock/adjust/", stock_adjust, name="pos-stock-adjust"),

    # Reports
    path("reports/daily-sales/", daily_sales, name="pos-daily-sales"),
    path("reports/near-expiry/", near_expiry_report, name="pos-near-expiry"),

    # Batches
    path("items/<int:item_id>/batches/", item_batches, name="pos-item-batches"),

    # Outlet settings
    path("outlets/<int:outlet_id>/settings/", outlet_settings, name="pos-outlet-settings"),

    # GRN / pricing
    path("grn/", grn_entry, name="pos-grn-entry"),
    path("prices/bulk-update/", bulk_price_update, name="pos-bulk-price"),
    path("prices/history/", price_history, name="pos-price-history"),

    # Customer credit
    path("customers/<int:customer_id>/credit/", customer_credit_adjust, name="pos-customer-credit-adjust"),
    path("customers/<int:customer_id>/credit/history/", customer_credit_history, name="pos-customer-credit-history"),

    # Suppliers (autocomplete proxy to Supplier master)
    path("suppliers/search/", supplier_search, name="pos-supplier-search"),

    # Promotions
    path("promotions/", promotions, name="pos-promotions"),
    path("promotions/active/", active_promotions, name="pos-promotions-active"),
    path("promotions/<int:promotion_id>/", promotion_detail, name="pos-promotion-detail"),

    # Coupons
    path("coupons/", coupons, name="pos-coupons"),
    path("coupons/redeem/", coupon_redeem_check, name="pos-coupon-redeem"),
    path("coupons/<int:coupon_id>/", coupon_detail, name="pos-coupon-detail"),

    # Tax Components (Phase 3 Agent 8)
    path("tax-components/", tax_components, name="pos-tax-components"),
    path("tax-components/<int:comp_id>/", tax_component_detail, name="pos-tax-component-detail"),

    # Gift Cards
    path("gift-cards/", gift_cards, name="pos-gift-cards"),
    path("gift-cards/<str:serial>/", gift_card_detail, name="pos-gift-card-detail"),
    path("gift-cards/<str:serial>/adjust/", gift_card_adjust, name="pos-gift-card-adjust"),
    path("gift-cards/<str:serial>/void/", gift_card_void, name="pos-gift-card-void"),

    # Units of measure (multi-unit / weighed)
    path("units/", units_list, name="pos-units"),

    # SME-mode: products
    path("products/", product_list_create, name="pos-products"),
    path("products/import/", product_csv_import, name="pos-products-import"),
    path("products/<int:item_id>/", product_detail, name="pos-product-detail"),

    # SME reports
    path("reports/low-stock/", low_stock_report, name="pos-low-stock"),
    path("reports/top-selling/", top_selling_report, name="pos-top-selling"),
    path("reports/profit/", profit_report, name="pos-profit"),
    path("reports/tax-summary/", tax_summary_report, name="pos-tax-summary"),

    # Shift Z report
    path("shifts/<int:shift_id>/z-report/", shift_z_report, name="pos-z-report"),
    # Shift X report (read-only mid-shift summary)
    path("shifts/<int:shift_id>/x-report/", shift_x_report, name="pos-x-report"),

    # Discount policies (admin)
    path("discount-policies/", discount_policies, name="pos-discount-policies"),
    path("discount-policies/effective/", effective_discount_policy, name="pos-discount-policy-effective"),
    path("discount-policies/<int:policy_id>/", discount_policy_detail, name="pos-discount-policy-detail"),

    # Manager PIN override
    path("verify-manager-pin/", verify_manager_pin, name="pos-verify-manager-pin"),

    # Expenses
    path("expenses/", expenses, name="pos-expenses"),

    # Purchase Return (RTS)
    path("purchase-returns/", purchase_return_list, name="pos-rts-list"),
    path("purchase-returns/create/", purchase_return_create, name="pos-rts-create"),

    # GL Export + Cash Handover (Phase 3 Agent 9)
    path("gl-accounts/", gl_accounts, name="pos-gl-accounts"),
    path("gl-accounts/<int:account_id>/", gl_account_detail, name="pos-gl-account-detail"),
    path("gl-export/", gl_export_generate, name="pos-gl-export-generate"),
    path("gl-exports/", gl_export_list, name="pos-gl-exports"),
    path("gl-exports/<int:export_id>/", gl_export_detail, name="pos-gl-export-detail"),
    path("gl-exports/<int:export_id>/download/", gl_export_download, name="pos-gl-export-download"),
    path("cash-handover/", cash_handover_create, name="pos-cash-handover-create"),
    path("cash-handovers/", cash_handover_list, name="pos-cash-handovers"),

    # Phase 3 Agent 10 — Sales rep + commission
    path("sales-reps/", sales_reps, name="pos-sales-reps"),
    path("commission-rules/", commission_rules, name="pos-commission-rules"),
    path("commission-rules/<int:rule_id>/", commission_rule_detail, name="pos-commission-rule-detail"),
    path("commission-report/", commission_report, name="pos-commission-report"),

    # Phase 4 Agent 12 — Purchase Orders
    path("purchase-orders/", purchase_orders, name="pos-purchase-orders"),
    path("purchase-orders/<int:po_id>/", purchase_order_detail, name="pos-purchase-order-detail"),
    path("purchase-orders/<int:po_id>/submit/", purchase_order_submit, name="pos-purchase-order-submit"),
    path("purchase-orders/<int:po_id>/cancel/", purchase_order_cancel, name="pos-purchase-order-cancel"),
    path("purchase-orders/<int:po_id>/close/", purchase_order_close, name="pos-purchase-order-close"),
    path("purchase-orders/<int:po_id>/lines/", purchase_order_lines, name="pos-purchase-order-lines"),

    # Phase 4 Agent 13 — Payment gateways + SMS
    path("payment-gateways/", payment_gateways, name="pos-payment-gateways"),
    path("payment-gateways/<int:gateway_id>/", payment_gateway_detail, name="pos-payment-gateway-detail"),
    path("initiate-payment/", initiate_payment, name="pos-initiate-payment"),
    path("payment-intents/<int:intent_id>/", payment_intent_detail, name="pos-payment-intent-detail"),
    path("webhooks/payment/<str:provider>/", payment_webhook, name="pos-payment-webhook"),
    path("sms-configs/", sms_configs, name="pos-sms-configs"),
    path("sms-configs/<int:config_id>/", sms_config_detail, name="pos-sms-config-detail"),

    # Supplier payables
    path("suppliers/payables/", supplier_payables_report, name="pos-supplier-payables"),
    path("suppliers/payments/", supplier_payment_create, name="pos-supplier-payment-create"),
    path("suppliers/<int:supplier_id>/ledger/", supplier_ledger, name="pos-supplier-ledger"),
]
