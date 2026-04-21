from django.urls import path

from .views import (
    master_product_list_create,
    master_product_detail,
    master_product_options,
)
from .views_mapping import (
    suggest_masters,
    unmapped_items,
    mapping_stats,
    item_links,
    item_links_bulk,
    item_link_detail,
)
from .views_demand import demand_list, demand_summary
from .views_purchasing import (
    plan_list_create, plan_detail, line_detail, plan_approve, plan_export_csv,
)
from .views_stock_age import (
    stock_age_list, stock_age_summary, stock_age_export, stock_age_recompute,
)

urlpatterns = [
    path("master-products/", master_product_list_create, name="master-product-list-create"),
    path("master-products/options/", master_product_options, name="master-product-options"),
    path("master-products/suggest/", suggest_masters, name="master-product-suggest"),
    path("master-products/<int:pk>/", master_product_detail, name="master-product-detail"),

    path("item-links/", item_links, name="item-links"),
    path("item-links/bulk/", item_links_bulk, name="item-links-bulk"),
    path("item-links/unmapped/", unmapped_items, name="item-links-unmapped"),
    path("item-links/stats/", mapping_stats, name="item-links-stats"),
    path("item-links/<int:pk>/", item_link_detail, name="item-link-detail"),

    path("demand/", demand_list, name="demand-list"),
    path("demand/summary/", demand_summary, name="demand-summary"),

    path("stock-age/", stock_age_list, name="stock-age-list"),
    path("stock-age/summary/", stock_age_summary, name="stock-age-summary"),
    path("stock-age/export/", stock_age_export, name="stock-age-export"),
    path("stock-age/recompute/", stock_age_recompute, name="stock-age-recompute"),

    path("purchase-plans/", plan_list_create, name="purchase-plan-list-create"),
    path("purchase-plans/<int:pk>/", plan_detail, name="purchase-plan-detail"),
    path("purchase-plans/<int:pk>/approve/", plan_approve, name="purchase-plan-approve"),
    path("purchase-plans/<int:pk>/export/", plan_export_csv, name="purchase-plan-export"),
    path("purchase-plans/<int:pk>/lines/<int:line_id>/", line_detail, name="purchase-plan-line-detail"),
]
