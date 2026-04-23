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
)
from .views_sme import (
    product_list_create, product_detail, product_csv_import,
    low_stock_report, top_selling_report, profit_report, tax_summary_report,
    shift_z_report, expenses,
    purchase_return_create, purchase_return_list,
    supplier_payables_report, supplier_payment_create, supplier_ledger,
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

    # Expenses
    path("expenses/", expenses, name="pos-expenses"),

    # Purchase Return (RTS)
    path("purchase-returns/", purchase_return_list, name="pos-rts-list"),
    path("purchase-returns/create/", purchase_return_create, name="pos-rts-create"),

    # Supplier payables
    path("suppliers/payables/", supplier_payables_report, name="pos-supplier-payables"),
    path("suppliers/payments/", supplier_payment_create, name="pos-supplier-payment-create"),
    path("suppliers/<int:supplier_id>/ledger/", supplier_ledger, name="pos-supplier-ledger"),
]
