"""
Central registry of permission codes and per-role defaults.

A permission code is a stable string like "nav.users" or "items.delete".
The Super Admin can override any user's effective permissions by setting
`User.permissions_override` to an explicit list of codes; when it is None
the user inherits the role defaults below.

Two kinds of codes are tracked:
  - "nav.*"    — controls visibility of a sidebar item and access to the
                 corresponding page route.
  - other      — action-level toggles (e.g. "users.manage") enforced at
                 specific API endpoints and UI buttons.
"""

# (code, label, category) tuples. Category groups codes in the admin UI.
PERMISSIONS = [
    # --- Navigation (sidebar + page access) ---
    ("nav.count",                 "Stock Count",             "Navigation · Operations"),
    ("nav.upload",                "Upload XLS",              "Navigation · Operations"),
    ("nav.upload_history",        "Upload History",          "Navigation · Operations"),

    ("nav.admin_dashboard",       "Admin Dashboard",         "Navigation · Dashboards"),
    ("nav.manager_dashboard",     "Manager Dashboard",       "Navigation · Dashboards"),
    ("nav.overview",              "Outlets Overview",        "Navigation · Dashboards"),

    ("nav.pending",               "Pending Items",           "Navigation · Review"),
    ("nav.upload_approvals",      "Upload Approvals",        "Navigation · Review"),
    ("nav.daily_counts",          "Counted Stock Daily",     "Navigation · Review"),

    ("nav.shrinkage",             "Shrinkage",               "Navigation · Reports"),
    ("nav.item_pos_history",      "POS History",             "Navigation · Reports"),
    ("nav.daily_upload_report",   "Daily Upload Report",     "Navigation · Reports"),
    ("nav.negative_pos",          "Negative POS",            "Navigation · Reports"),

    ("nav.catalog",               "Product Catalog",         "Navigation · Catalog"),
    ("nav.product_master",        "Product Master",          "Navigation · Catalog"),
    ("nav.barcode_master",        "Barcode Master",          "Navigation · Catalog"),
    ("nav.master_products",       "Master Products (Org)",   "Navigation · Organization"),
    ("nav.master_mapping",        "Master Mapping",          "Navigation · Organization"),
    ("nav.demand_dashboard",      "Demand Dashboard",        "Navigation · Organization"),
    ("nav.purchase_plans",        "Purchase Plans",          "Navigation · Organization"),
    ("nav.stock_age",             "Stock Age",               "Navigation · Organization"),

    ("nav.outlets",               "Outlets",                 "Navigation · Administration"),
    ("nav.users",                 "Users",                   "Navigation · Administration"),
    ("nav.license",               "License",                 "Navigation · Administration"),
    ("nav.user_permissions",      "User Permissions",        "Navigation · Administration"),
    ("nav.operations_hub",        "Outlet Operations Hub",    "Navigation · Operations"),
    ("nav.operations_today",      "Operations — Today",       "Navigation · Operations"),
    ("nav.report_daily_sales",    "Report — Daily Sales",     "Navigation · Operations"),
    ("nav.report_item_rankings",  "Report — Top / Dead Stock","Navigation · Operations"),
    ("nav.report_wastage",        "Report — Wastage Summary", "Navigation · Operations"),
    ("nav.anomalies",             "Anomaly Dashboard",         "Navigation · Operations"),
    ("nav.suppliers",             "Suppliers",                 "Navigation · Administration"),
    ("nav.supplier_scorecard",    "Supplier Scorecard",        "Navigation · Operations"),
    ("nav.categories",            "Categories",                "Navigation · Catalog"),

    ("nav.audit_log",             "Audit Log",               "Navigation · Audit & Security"),
    ("nav.mobile_devices",        "Mobile Devices",          "Navigation · Audit & Security"),
    ("nav.login_events",          "Login Events",            "Navigation · Audit & Security"),
    ("nav.orphan_cleanup",        "Orphan Cleanup",          "Navigation · Audit & Security"),

    ("nav.db_management",         "DB Management",           "Navigation · System"),

    # --- Transaction uploads (per-report-type nav) ---
    ("nav.transactions_hub",      "Transactions Hub",        "Navigation · Transactions"),
    ("nav.damage_upload",         "Damage — Upload",         "Navigation · Transactions"),
    ("nav.damage_history",        "Damage — History",        "Navigation · Transactions"),
    ("nav.office_upload",         "Office Use — Upload",     "Navigation · Transactions"),
    ("nav.office_history",        "Office Use — History",    "Navigation · Transactions"),
    ("nav.verification_upload",   "Verification — Upload",   "Navigation · Transactions"),
    ("nav.verification_history",  "Verification — History",  "Navigation · Transactions"),
    ("nav.grn_upload",            "GRN — Upload",            "Navigation · Transactions"),
    ("nav.grn_history",           "GRN — History",           "Navigation · Transactions"),
    ("nav.rts_upload",            "Return to Supply — Upload",  "Navigation · Transactions"),
    ("nav.rts_history",           "Return to Supply — History", "Navigation · Transactions"),
    ("nav.sales_upload",          "Sales — Upload",           "Navigation · Transactions"),
    ("nav.sales_history",         "Sales — History",          "Navigation · Transactions"),
    ("nav.sales_returns_upload",  "Sales Returns — Upload",   "Navigation · Transactions"),
    ("nav.sales_returns_history", "Sales Returns — History",  "Navigation · Transactions"),

    # --- Actions ---
    ("users.manage",              "Create / edit / delete users",  "Actions · Users"),
    ("users.permissions",         "Manage per-user permissions",   "Actions · Users"),
    ("items.bulk_upload",         "Bulk-upload items (XLS/CSV)",   "Actions · Items"),
    ("items.delete",              "Delete items",                  "Actions · Items"),
    ("counts.approve",            "Approve stock counts",          "Actions · Counts"),
    ("outlets.manage",            "Create / edit outlets",         "Actions · Outlets"),
    ("damage.approve",            "Approve damage uploads",        "Actions · Transactions"),
    ("damage.delete_batch",       "Delete damage upload batch",    "Actions · Transactions"),
    ("office.approve",            "Approve office uploads",        "Actions · Transactions"),
    ("office.delete_batch",       "Delete office upload batch",    "Actions · Transactions"),
    ("verification.approve",      "Approve verification uploads",  "Actions · Transactions"),
    ("verification.delete_batch", "Delete verification batch",     "Actions · Transactions"),
    ("grn.approve",               "Approve GRN uploads",           "Actions · Transactions"),
    ("grn.delete_batch",          "Delete GRN batch",              "Actions · Transactions"),
    ("rts.approve",               "Approve return-to-supply uploads",  "Actions · Transactions"),
    ("rts.delete_batch",          "Delete return-to-supply batch",     "Actions · Transactions"),
    ("sales.approve",             "Approve sales uploads",             "Actions · Transactions"),
    ("sales.delete_batch",        "Delete sales batch",                "Actions · Transactions"),
    ("sales_returns.approve",     "Approve sales-returns uploads",     "Actions · Transactions"),
    ("sales_returns.delete_batch","Delete sales-returns batch",        "Actions · Transactions"),
    ("suppliers.manage",          "Create / edit / delete suppliers",  "Actions · Suppliers"),
    ("categories.manage",         "Create / edit / delete categories", "Actions · Items"),
]

ALL_CODES = [code for code, _, _ in PERMISSIONS]
ALL_CODES_SET = set(ALL_CODES)


def registry_as_dicts():
    """Return the registry as a list of dicts — used by the frontend."""
    return [{"code": c, "label": l, "category": cat} for c, l, cat in PERMISSIONS]


# Role defaults. "*" means "all permissions" (Super Admin).
ROLE_DEFAULTS = {
    "super_admin": "*",

    "admin": [
        # Sidebar — everything except the super-admin-only page
        "nav.count", "nav.upload", "nav.upload_history",
        "nav.admin_dashboard", "nav.overview",
        "nav.pending", "nav.upload_approvals", "nav.daily_counts",
        "nav.shrinkage", "nav.item_pos_history",
        "nav.daily_upload_report", "nav.negative_pos",
        "nav.catalog", "nav.product_master", "nav.barcode_master",
        "nav.outlets", "nav.users", "nav.license",
        "nav.audit_log", "nav.mobile_devices", "nav.login_events",
        "nav.orphan_cleanup", "nav.db_management",
        "nav.transactions_hub",
        "nav.damage_upload", "nav.damage_history",
        "nav.office_upload", "nav.office_history",
        "nav.verification_upload", "nav.verification_history",
        "nav.grn_upload", "nav.grn_history",
        "nav.rts_upload", "nav.rts_history",
        "nav.sales_upload", "nav.sales_history",
        "nav.sales_returns_upload", "nav.sales_returns_history",
        # Actions
        "users.manage",
        "items.bulk_upload", "items.delete",
        "counts.approve", "outlets.manage",
        "damage.approve", "damage.delete_batch",
        "office.approve", "office.delete_batch",
        "verification.approve", "verification.delete_batch",
        "grn.approve", "grn.delete_batch",
        "rts.approve", "rts.delete_batch",
        "sales.approve", "sales.delete_batch",
        "sales_returns.approve", "sales_returns.delete_batch",
        "nav.suppliers", "suppliers.manage",
        "nav.categories", "categories.manage",
        "nav.master_products", "nav.master_mapping",
        "nav.demand_dashboard", "nav.purchase_plans",
        "nav.stock_age",
    ],

    "manager": [
        "nav.count", "nav.upload", "nav.upload_history",
        "nav.manager_dashboard", "nav.overview",
        "nav.pending", "nav.daily_counts",
        "nav.shrinkage", "nav.item_pos_history",
        "nav.catalog", "nav.product_master", "nav.barcode_master",
        "nav.categories",
        "nav.master_products", "nav.master_mapping",
        "nav.demand_dashboard", "nav.purchase_plans",
        "nav.stock_age",
        "nav.db_management",
        "nav.transactions_hub",
        "nav.damage_upload", "nav.damage_history",
        "nav.office_upload", "nav.office_history",
        "nav.verification_upload", "nav.verification_history",
        "nav.grn_upload", "nav.grn_history",
        "nav.rts_upload", "nav.rts_history",
        "nav.sales_upload", "nav.sales_history",
        "nav.sales_returns_upload", "nav.sales_returns_history",
        "items.bulk_upload", "counts.approve",
        "damage.delete_batch", "office.delete_batch", "verification.delete_batch",
        "grn.delete_batch", "rts.delete_batch",
        "sales.delete_batch", "sales_returns.delete_batch",
    ],

    "store_user": [
        "nav.count", "nav.upload", "nav.upload_history",
        "nav.db_management",
        "nav.transactions_hub",
        "nav.damage_upload", "nav.damage_history",
        "nav.office_upload", "nav.office_history",
        "nav.verification_upload", "nav.verification_history",
        "nav.grn_upload", "nav.grn_history",
        "nav.rts_upload", "nav.rts_history",
        "nav.sales_upload", "nav.sales_history",
        "nav.sales_returns_upload", "nav.sales_returns_history",
        "items.bulk_upload",
    ],

    "staff": [
        "nav.count",
        "nav.db_management",
    ],

    "ServiceProvider": [
        "nav.license",
    ],
}


def effective_permissions_for(user) -> list[str]:
    """
    Compute the current effective permission codes for a user.
      - Super Admins always receive every code (cannot be locked out).
      - If the user has an explicit permissions_override list, use it.
      - Otherwise fall back to the role defaults.
    Unknown codes in an override are silently dropped so removing an entry
    from the registry can't grant a ghost permission.
    """
    if user.role == "super_admin":
        return list(ALL_CODES)

    override = getattr(user, "permissions_override", None)
    if override is not None:
        return [c for c in override if c in ALL_CODES_SET]

    default = ROLE_DEFAULTS.get(user.role, [])
    if default == "*":
        return list(ALL_CODES)
    return list(default)


def user_has_permission(user, code: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    return code in effective_permissions_for(user)
