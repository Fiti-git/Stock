"""
Central registry of permission codes and per-role defaults.

A permission code is a stable string like "nav.users" or "items.delete".
The Super Admin can override any user's effective permissions by setting
`User.permissions_override` to an explicit list of codes; when it is None
the user inherits the role defaults below.

Three kinds of codes are tracked:
  - "nav.*"    — controls visibility of a sidebar item and access to the
                 corresponding page route.
  - other      — action-level toggles (e.g. "users.manage") enforced at
                 specific API endpoints and UI buttons.

Each code also carries a *system* tag — one of:
  "stock"  → belongs to the Stock product
  "both"   → cross-product (login, audit, license, users, …)

The tag is purely informational — it does NOT gate access. A user's effective
permissions are still the only source of truth for what they can see/do.
"""

# (code, label, category, system) tuples. Category groups codes in the
# admin UI; system tags the product the code belongs to.
#
# Backwards-compat: 3-tuple rows (code, label, category) are still accepted
# by the loader below and default to system="both". Add the 4th element when
# editing a row so the system filter works correctly.
PERMISSIONS = [
    # --- Navigation (sidebar + page access) ---
    ("nav.count",                 "Stock Count",             "Navigation · Operations", "stock"),
    ("nav.upload",                "Upload XLS",              "Navigation · Operations", "stock"),
    ("nav.upload_history",        "Upload History",          "Navigation · Operations", "stock"),

    ("nav.admin_dashboard",       "Admin Dashboard",         "Navigation · Dashboards", "stock"),
    ("nav.manager_dashboard",     "Manager Dashboard",       "Navigation · Dashboards", "stock"),
    ("nav.overview",              "Outlets Overview",        "Navigation · Dashboards", "stock"),

    ("nav.pending",               "Pending Items",           "Navigation · Review", "stock"),
    ("nav.uploaded_sheets",       "Uploaded XLS Sheets",     "Navigation · Review", "stock"),
    ("nav.upload_approvals",      "Upload Approvals",        "Navigation · Review", "stock"),
    ("nav.count_sessions",        "Count Sessions",          "Navigation · Review", "stock"),
    ("nav.daily_counts",          "Counted Stock Daily",     "Navigation · Review", "stock"),
    ("nav.count_review",          "Count Review",            "Navigation · Review", "stock"),
    ("nav.variance_reconciliation", "Variance Reconciliation", "Navigation · Review", "stock"),

    ("nav.shrinkage",             "Shrinkage",               "Navigation · Reports", "stock"),
    ("nav.item_pos_history",      "POS History",             "Navigation · Reports", "stock"),
    ("nav.daily_upload_report",   "Daily Upload Report",     "Navigation · Reports", "stock"),
    ("nav.negative_pos",          "Negative POS",            "Navigation · Reports", "stock"),
    ("nav.stock_variance",        "Stock Variance Report",   "Navigation · Reports", "stock"),
    ("nav.counted_items_report",  "Counted vs Uncounted",    "Navigation · Reports", "stock"),
    ("nav.count_coverage",        "Count Coverage Report",   "Navigation · Reports", "stock"),
    ("nav.counter_performance",   "Counter Performance",     "Navigation · Reports", "stock"),
    ("nav.mobile_usage",          "Mobile Usage Report",     "Navigation · Reports", "stock"),

    ("nav.catalog",               "Product Catalog",         "Navigation · Catalog", "stock"),
    ("nav.product_master",        "Product Master",          "Navigation · Catalog", "stock"),
    ("nav.barcode_master",        "Barcode Master",          "Navigation · Catalog", "stock"),
    ("nav.master_products",       "Master Products (Org)",   "Navigation · Organization", "stock"),
    ("nav.master_mapping",        "Master Mapping",          "Navigation · Organization", "stock"),
    ("nav.demand_dashboard",      "Demand Dashboard",        "Navigation · Organization", "stock"),
    ("nav.purchase_plans",        "Purchase Plans",          "Navigation · Organization", "stock"),
    ("nav.stock_age",             "Stock Age",               "Navigation · Organization", "stock"),

    # Cross-product admin pages — visible regardless of which system the user has.
    ("nav.outlets",               "Outlets",                 "Navigation · Administration", "both"),
    ("nav.users",                 "Users",                   "Navigation · Administration", "both"),
    ("nav.license",               "License",                 "Navigation · Administration", "both"),
    ("nav.user_permissions",      "User Permissions",        "Navigation · Administration", "both"),
    ("nav.operations_hub",        "Outlet Operations Hub",    "Navigation · Operations", "stock"),
    ("nav.operations_today",      "Operations — Today",       "Navigation · Operations", "stock"),
    ("nav.report_daily_sales",    "Report — Daily Sales",     "Navigation · Operations", "stock"),
    ("nav.report_item_rankings",  "Report — Top / Dead Stock","Navigation · Operations", "stock"),
    ("nav.report_wastage",        "Report — Wastage Summary", "Navigation · Operations", "stock"),
    ("nav.anomalies",             "Anomaly Dashboard",         "Navigation · Operations", "stock"),
    ("nav.suppliers",             "Suppliers",                 "Navigation · Administration", "both"),
    ("nav.supplier_scorecard",    "Supplier Scorecard",        "Navigation · Operations", "stock"),
    ("nav.categories",            "Categories",                "Navigation · Catalog", "stock"),

    ("nav.audit_log",             "Audit Log",               "Navigation · Audit & Security", "both"),
    ("nav.mobile_devices",        "Mobile Devices",          "Navigation · Audit & Security", "both"),
    ("nav.login_events",          "Login Events",            "Navigation · Audit & Security", "both"),
    ("nav.orphan_cleanup",        "Orphan Cleanup",          "Navigation · Audit & Security", "both"),

    ("nav.db_management",         "DB Management",           "Navigation · System", "both"),

    # --- Transaction uploads (per-report-type nav) ---
    ("nav.transactions_hub",      "Transactions Hub",        "Navigation · Transactions", "stock"),
    ("nav.damage_upload",         "Damage — Upload",         "Navigation · Transactions", "stock"),
    ("nav.damage_history",        "Damage — History",        "Navigation · Transactions", "stock"),
    ("nav.office_upload",         "Office Use — Upload",     "Navigation · Transactions", "stock"),
    ("nav.office_history",        "Office Use — History",    "Navigation · Transactions", "stock"),
    ("nav.verification_upload",   "Verification — Upload",   "Navigation · Transactions", "stock"),
    ("nav.verification_history",  "Verification — History",  "Navigation · Transactions", "stock"),
    ("nav.grn_upload",            "GRN — Upload",            "Navigation · Transactions", "stock"),
    ("nav.grn_history",           "GRN — History",           "Navigation · Transactions", "stock"),
    ("nav.rts_upload",            "Return to Supply — Upload",  "Navigation · Transactions", "stock"),
    ("nav.rts_history",           "Return to Supply — History", "Navigation · Transactions", "stock"),
    ("nav.sales_upload",          "Sales — Upload",           "Navigation · Transactions", "stock"),
    ("nav.sales_history",         "Sales — History",          "Navigation · Transactions", "stock"),
    ("nav.sales_returns_upload",  "Sales Returns — Upload",   "Navigation · Transactions", "stock"),
    ("nav.sales_returns_history", "Sales Returns — History",  "Navigation · Transactions", "stock"),

    # --- Actions ---
    ("users.manage",              "Create / edit / delete users",  "Actions · Users", "both"),
    ("users.permissions",         "Manage per-user permissions",   "Actions · Users", "both"),
    ("items.bulk_upload",         "Bulk-upload items (XLS/CSV)",   "Actions · Items", "stock"),
    ("items.delete",              "Delete items",                  "Actions · Items", "stock"),
    ("counts.approve",            "Approve stock counts",          "Actions · Counts", "stock"),
    ("outlets.manage",            "Create / edit outlets",         "Actions · Outlets", "both"),
    ("damage.approve",            "Approve damage uploads",        "Actions · Transactions", "stock"),
    ("damage.delete_batch",       "Delete damage upload batch",    "Actions · Transactions", "stock"),
    ("office.approve",            "Approve office uploads",        "Actions · Transactions", "stock"),
    ("office.delete_batch",       "Delete office upload batch",    "Actions · Transactions", "stock"),
    ("verification.approve",      "Approve verification uploads",  "Actions · Transactions", "stock"),
    ("verification.delete_batch", "Delete verification batch",     "Actions · Transactions", "stock"),
    ("grn.approve",               "Approve GRN uploads",           "Actions · Transactions", "stock"),
    ("grn.delete_batch",          "Delete GRN batch",              "Actions · Transactions", "stock"),
    ("rts.approve",               "Approve return-to-supply uploads",  "Actions · Transactions", "stock"),
    ("rts.delete_batch",          "Delete return-to-supply batch",     "Actions · Transactions", "stock"),
    ("sales.approve",             "Approve sales uploads",             "Actions · Transactions", "stock"),
    ("sales.delete_batch",        "Delete sales batch",                "Actions · Transactions", "stock"),
    ("sales_returns.approve",     "Approve sales-returns uploads",     "Actions · Transactions", "stock"),
    ("sales_returns.delete_batch","Delete sales-returns batch",        "Actions · Transactions", "stock"),
    ("suppliers.manage",          "Create / edit / delete suppliers",  "Actions · Suppliers", "both"),
    ("categories.manage",         "Create / edit / delete categories", "Actions · Items", "stock"),

    # --- Transfers (inter-outlet) ---
    ("nav.transfers",             "Transfers",                         "Navigation · Transfers", "stock"),
    ("nav.transfers_request",     "Transfers — Request",                "Navigation · Transfers", "stock"),
    ("nav.transfers_dispatch",    "Transfers — Dispatch",               "Navigation · Transfers", "stock"),
    ("nav.transfers_receive",     "Transfers — Receive",                "Navigation · Transfers", "stock"),
    ("transfers.request",         "Create / request transfer",          "Actions · Transfers", "stock"),
    ("transfers.dispatch",        "Dispatch transfer (source manager)", "Actions · Transfers", "stock"),
    ("transfers.receive",         "Receive transfer (dest manager)",    "Actions · Transfers", "stock"),
    ("transfers.close",           "Close / cancel transfer",            "Actions · Transfers", "stock"),
]


def _row(p):
    """Tolerant unpacker — supports legacy 3-tuples (default system='both')."""
    if len(p) == 4:
        return p
    code, label, category = p
    return (code, label, category, "both")


ALL_CODES = [_row(p)[0] for p in PERMISSIONS]
ALL_CODES_SET = set(ALL_CODES)
SYSTEM_BY_CODE = {_row(p)[0]: _row(p)[3] for p in PERMISSIONS}


def registry_as_dicts():
    """Return the registry as a list of dicts — used by the frontend."""
    out = []
    for p in PERMISSIONS:
        code, label, category, system = _row(p)
        out.append({
            "code": code,
            "label": label,
            "category": category,
            "system": system,
        })
    return out


def systems_for_codes(codes):
    """
    Derive the user's active product systems from a set of permission codes.
    Cross-product ('both') codes don't count toward 'has stock' on their own —
    a user with only Audit Log access shouldn't be told they have the Stock
    system. Returns a sorted list, possibly empty.
    """
    code_set = codes if isinstance(codes, set) else set(codes or [])
    systems = set()
    for c in code_set:
        s = SYSTEM_BY_CODE.get(c)
        if s == "stock":
            systems.add(s)
    return sorted(systems)


# Role defaults. "*" means "all permissions" (Super Admin).
ROLE_DEFAULTS = {
    "super_admin": "*",

    "admin": [
        # Sidebar — everything except the super-admin-only page
        "nav.count", "nav.upload", "nav.upload_history",
        "nav.admin_dashboard", "nav.overview",
        "nav.pending", "nav.uploaded_sheets", "nav.upload_approvals",
        "nav.count_sessions", "nav.daily_counts",
        "nav.count_review", "nav.variance_reconciliation",
        "nav.shrinkage", "nav.item_pos_history",
        "nav.daily_upload_report", "nav.negative_pos", "nav.stock_variance",
        "nav.counted_items_report", "nav.count_coverage", "nav.counter_performance",
        "nav.mobile_usage",
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
        # Transfers
        "nav.transfers", "nav.transfers_request", "nav.transfers_dispatch", "nav.transfers_receive",
        "transfers.request", "transfers.dispatch", "transfers.receive", "transfers.close",
    ],

    "manager": [
        "nav.count", "nav.upload", "nav.upload_history",
        "nav.manager_dashboard", "nav.overview",
        "nav.pending", "nav.uploaded_sheets",
        "nav.count_sessions", "nav.daily_counts",
        "nav.count_review", "nav.variance_reconciliation",
        "nav.shrinkage", "nav.item_pos_history", "nav.counter_performance",
        "nav.mobile_usage",
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
        # Transfers
        "nav.transfers", "nav.transfers_request", "nav.transfers_dispatch", "nav.transfers_receive",
        "transfers.request", "transfers.dispatch", "transfers.receive", "transfers.close",
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
        # Transfers — store users may submit requests for their outlet
        "nav.transfers", "nav.transfers_request",
        "transfers.request",
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


def systems_for_user(user) -> list[str]:
    """Active systems for a user, derived from effective permissions."""
    return systems_for_codes(effective_permissions_for(user))


def user_has_permission(user, code: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    return code in effective_permissions_for(user)
