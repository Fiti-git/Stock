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

    ("nav.outlets",               "Outlets",                 "Navigation · Administration"),
    ("nav.users",                 "Users",                   "Navigation · Administration"),
    ("nav.license",               "License",                 "Navigation · Administration"),
    ("nav.user_permissions",      "User Permissions",        "Navigation · Administration"),

    ("nav.audit_log",             "Audit Log",               "Navigation · Audit & Security"),
    ("nav.mobile_devices",        "Mobile Devices",          "Navigation · Audit & Security"),
    ("nav.login_events",          "Login Events",            "Navigation · Audit & Security"),
    ("nav.orphan_cleanup",        "Orphan Cleanup",          "Navigation · Audit & Security"),

    ("nav.db_management",         "DB Management",           "Navigation · System"),

    # --- Actions ---
    ("users.manage",              "Create / edit / delete users",  "Actions · Users"),
    ("users.permissions",         "Manage per-user permissions",   "Actions · Users"),
    ("items.bulk_upload",         "Bulk-upload items (XLS/CSV)",   "Actions · Items"),
    ("items.delete",              "Delete items",                  "Actions · Items"),
    ("counts.approve",            "Approve stock counts",          "Actions · Counts"),
    ("outlets.manage",            "Create / edit outlets",         "Actions · Outlets"),
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
        # Actions
        "users.manage",
        "items.bulk_upload", "items.delete",
        "counts.approve", "outlets.manage",
    ],

    "manager": [
        "nav.count", "nav.upload", "nav.upload_history",
        "nav.manager_dashboard", "nav.overview",
        "nav.pending", "nav.daily_counts",
        "nav.shrinkage", "nav.item_pos_history",
        "nav.catalog", "nav.product_master", "nav.barcode_master",
        "nav.db_management",
        "items.bulk_upload", "counts.approve",
    ],

    "store_user": [
        "nav.count", "nav.upload", "nav.upload_history",
        "nav.db_management",
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
