import DashboardIcon from "@mui/icons-material/Dashboard";
import GridViewIcon from "@mui/icons-material/GridView";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import HistoryIcon from "@mui/icons-material/History";
import StorefrontIcon from "@mui/icons-material/Storefront";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import EditNoteIcon from "@mui/icons-material/EditNote";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import ChecklistIcon from "@mui/icons-material/Checklist";
import ListAltIcon from "@mui/icons-material/ListAlt";
import StorageIcon from "@mui/icons-material/Storage";
import AssessmentIcon from "@mui/icons-material/Assessment";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import SecurityIcon from "@mui/icons-material/Security";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CategoryIcon from "@mui/icons-material/Category";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";

/**
 * Single source of truth for routes. Consumed by Sidebar, Breadcrumbs, CommandPalette.
 * Hidden routes (no label / showInNav=false) are reachable but not listed in nav.
 *
 * Upload entry points were consolidated: the /transactions hub is the only
 * entry point now. Per-pipeline upload pages stay reachable by URL (they're
 * what the hub navigates to) but don't appear in the sidebar. Per-pipeline
 * history pages were killed — /uploaded-sheets?pipeline=<key> is the single
 * cross-pipeline browser.
 *
 * Each route carries:
 *   - `code`   — matches a backend permission code; gates access.
 *   - `group`  — top-level sidebar bucket.
 *   - `system` — "stock" | "both". Mirrors the backend registry tag.
 *   - `roles`  — convenience field for a few legacy pages that still inspect
 *                `user.role` directly.
 */
export const routes = [
  // ------------------------- OPERATE -------------------------
  { path: "/count",                     code: "nav.count",                label: "Stock Count",        icon: QrCodeScannerIcon,      roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/upload",                    code: "nav.upload",               label: "Upload XLS",         icon: UploadFileIcon,         roles: ["store_user","manager","admin","super_admin"],         group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions",              code: "nav.transactions_hub",     label: "Transactions",       icon: ReceiptLongIcon,        roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock" },
  { path: "/uploaded-sheets",           code: "nav.uploaded_sheets",      label: "Uploaded Sheets",    icon: HistoryIcon,            roles: ["store_user","manager","admin","super_admin"],         group: "Operate", system: "stock" },
  { path: "/admin/upload-approvals",    code: "nav.upload_approvals",     label: "Upload Approvals",   icon: AssignmentTurnedInIcon, roles: ["admin","super_admin"],                                 group: "Operate", system: "stock", showInNav: false },
  { path: "/dashboard/pending",         code: "nav.pending",              label: "Pending Items",      icon: ChecklistIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate", system: "stock" },
  { path: "/count-sessions",            code: "nav.count_sessions",       label: "Count Sessions",     icon: FactCheckIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate", system: "ops" },
  { path: "/count-review",              code: "nav.count_review",         label: "Count Review",       icon: FactCheckIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate", system: "ops", showInNav: false },
  { path: "/variance-reconciliation",   code: "nav.variance_reconciliation", label: "Variance Reconciliation", icon: ChecklistIcon,    roles: ["manager","admin","super_admin"],                       group: "Operate", system: "ops" },

  // Per-pipeline upload pages — reachable by URL from the /transactions hub, not listed in the sidebar.
  { path: "/transactions/damage/upload",         code: "nav.damage_upload",         label: "Damage — Upload",           icon: ReceiptLongIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/office/upload",         code: "nav.office_upload",         label: "Office Use — Upload",       icon: ReceiptLongIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/verification/upload",   code: "nav.verification_upload",   label: "Verification — Upload",     icon: ReceiptLongIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/grn/upload",            code: "nav.grn_upload",            label: "GRN — Upload",              icon: MoveToInboxIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/rts/upload",            code: "nav.rts_upload",            label: "Return to Supply — Upload", icon: ReceiptLongIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/sales/upload",          code: "nav.sales_upload",          label: "Sales — Upload",            icon: ReceiptLongIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/sales_returns/upload",  code: "nav.sales_returns_upload",  label: "Sales Returns — Upload",    icon: ReceiptLongIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },

  // ------------------------- ANALYZE -------------------------
  { path: "/admin/dashboard",           code: "nav.admin_dashboard",      label: "Admin Dashboard",    icon: DashboardIcon,          roles: ["admin","super_admin"],                        group: "Analyze", system: "stock" },
  { path: "/dashboard",                 code: "nav.manager_dashboard",    label: "Dashboard",          icon: DashboardIcon,          roles: ["manager"],                                     group: "Analyze", system: "stock" },
  { path: "/catalog",                   code: "nav.catalog",              label: "Product Catalog",    icon: Inventory2Icon,         roles: ["manager","admin","super_admin"],              group: "Analyze", system: "stock" },

  // POS-snapshot reports — grouped under "Snapshot Reports" so they don't scatter across Analyze.
  { path: "/admin/reports/daily-upload",code: "nav.daily_upload_report",  label: "Daily Upload",       icon: AssessmentIcon,         roles: ["admin","super_admin"],                        group: "Snapshot Reports", system: "stock" },
  { path: "/admin/negative-pos",        code: "nav.negative_pos",         label: "Negative POS",       icon: ReportProblemIcon,      roles: ["admin","super_admin"],                        group: "Snapshot Reports", system: "stock" },
  { path: "/admin/reports/stock-variance", code: "nav.stock_variance",    label: "Stock Variance",     icon: FactCheckIcon,          roles: ["admin","super_admin"],                        group: "Snapshot Reports", system: "stock" },
  { path: "/admin/reports/counted-items",  code: "nav.counted_items_report", label: "Counted vs Uncounted", icon: ChecklistIcon,      roles: ["admin","super_admin","manager"],              group: "Snapshot Reports", system: "stock" },
  { path: "/shrinkage",                 code: "nav.shrinkage",            label: "Shrinkage",          icon: TrendingDownIcon,       roles: ["manager","admin","super_admin"],              group: "Snapshot Reports", system: "stock" },
  { path: "/items/history",             code: "nav.item_pos_history",     label: "Item History",       icon: QueryStatsIcon,         roles: ["manager","admin","super_admin"],              group: "Snapshot Reports", system: "stock" },
  { path: "/reports/counter-performance",  code: "nav.counter_performance",  label: "Counter Performance",  icon: LeaderboardIcon,    roles: ["manager","admin","super_admin"],              group: "Snapshot Reports", system: "stock" },

  // ------------------------- ORGANIZATION (org app) -------------------------
  // Cross-outlet masters & planning. Shown only when the user picks the
  // Organization launcher tile.
  { path: "/admin/master-products",       code: "nav.master_products",  label: "Master Products",  icon: Inventory2Icon,       roles: ["manager","admin","super_admin"],         group: "Masters",  system: "org" },
  { path: "/admin/master-mapping",        code: "nav.master_mapping",   label: "Master Mapping",   icon: EditNoteIcon,         roles: ["admin","super_admin"],                    group: "Masters",  system: "org" },
  { path: "/admin/suppliers",             code: "nav.suppliers",        label: "Suppliers",        icon: LocalShippingIcon,    roles: ["admin","super_admin"],                    group: "Masters",  system: "org" },
  { path: "/admin/categories",            code: "nav.categories",       label: "Categories",       icon: CategoryIcon,         roles: ["admin","super_admin"],                    group: "Masters",  system: "org" },
  { path: "/admin/demand",                code: "nav.demand_dashboard", label: "Demand Dashboard", icon: QueryStatsIcon,       roles: ["manager","admin","super_admin"],         group: "Planning", system: "org" },
  { path: "/admin/purchase-plans",        code: "nav.purchase_plans",   label: "Purchase Plans",   icon: ListAltIcon,          roles: ["admin","super_admin"],                    group: "Planning", system: "org" },

  // Stock Age stays in the Stock app — it's an outlet-level analytical view, not a planning tool.
  { path: "/admin/stock-age",             code: "nav.stock_age",        label: "Stock Age",        icon: HourglassEmptyIcon,   roles: ["manager","admin","super_admin"],         group: "Snapshot Reports", system: "stock" },

  // ------------------------- CONFIGURE -------------------------
  { path: "/product-master",              code: "nav.product_master",   label: "Product Master",   icon: EditNoteIcon,         roles: ["manager","admin","super_admin"],         group: "Configure", system: "stock" },
  { path: "/admin/barcode-master",        code: "nav.barcode_master",   label: "Barcode Master",   icon: QrCodeScannerIcon,    roles: ["manager","admin","super_admin"],         group: "Configure", system: "stock" },
  { path: "/admin/outlets",               code: "nav.outlets",          label: "Outlets",          icon: StorefrontIcon,       roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/users",                 code: "nav.users",            label: "Users",            icon: PeopleAltIcon,        roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/super-admin/user-permissions",code: "nav.user_permissions", label: "User Permissions", icon: AdminPanelSettingsIcon,roles: ["super_admin"],                           group: "Configure", system: "both" },
  { path: "/admin/audit-log",             code: "nav.audit_log",        label: "Audit Log",        icon: ListAltIcon,          roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/mobile-devices",        code: "nav.mobile_devices",   label: "Mobile Devices",   icon: PhoneAndroidIcon,     roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/login-events",          code: "nav.login_events",     label: "Login Events",     icon: SecurityIcon,         roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/orphan-cleanup",        code: "nav.orphan_cleanup",   label: "Orphan Cleanup",   icon: CleaningServicesIcon, roles: ["admin","super_admin"],                    group: "Configure", system: "both", showInNav: false },
  { path: "/db-management",               code: "nav.db_management",    label: "DB Management",    icon: StorageIcon,          roles: ["admin","super_admin"],                    group: "Configure", system: "both" },

  // Hidden routes (no permission gate — inherit from parent page).
  { path: "/uploaded-sheets/:id",             label: "Sheet Detail",             roles: ["manager","admin","super_admin"],                      showInNav: false },
  { path: "/items/:id",                       label: "Item Detail",              roles: ["store_user","staff","manager","admin","super_admin"], showInNav: false },
  { path: "/admin/products/:itemId/history",  label: "Product History",          roles: ["manager","admin","super_admin"],                      showInNav: false },
  { path: "/login",                           label: "Login",                    roles: ["public"],                                              showInNav: false },
];

/**
 * Return visible nav items for the given set of effective permission codes.
 *
 * `activeSystem` is "stock" | "org" | "admin" | null.
 *   - null    → no filter (legacy; only used before launcher selection lands)
 *   - "admin" → cross-product pages only (routes tagged `system: "both"`)
 *   - else    → only routes whose `system` matches exactly. Org-wide masters
 *               live in the Organization app; cross-product admin pages live
 *               in the Admin app — neither pollute the Stock sidebar.
 */
export function routesForPermissions(permissions, activeSystem = null) {
  const set = permissions instanceof Set ? permissions : new Set(permissions || []);
  return routes.filter((r) => {
    if (r.showInNav === false) return false;
    if (!r.code || !set.has(r.code)) return false;
    if (!activeSystem) return true;
    if (activeSystem === "admin") return r.system === "both";
    return r.system === activeSystem;
  });
}

/**
 * Like routesForPermissions, but ALSO includes routes that are hidden from
 * the sidebar (showInNav: false) — used by the Cmd-K command palette so
 * users can jump straight to URL-reachable pages that no longer have a
 * sidebar entry. Skips parameterised routes (e.g. /items/:id) and
 * internal-only entries (login) that have no `code`.
 */
export function searchableRoutes(permissions, activeSystem = null) {
  const set = permissions instanceof Set ? permissions : new Set(permissions || []);
  return routes.filter((r) => {
    if (!r.code) return false;
    if (!r.label) return false;
    if (r.path.includes(":")) return false;
    if (!set.has(r.code)) return false;
    if (!activeSystem) return true;
    if (activeSystem === "admin") return r.system === "both";
    return r.system === activeSystem;
  });
}

/**
 * Which "apps" the user can launch.
 *   - "stock" and "org" come from the backend-provided `user.systems` array
 *     (derived from their effective permissions).
 *   - "admin" is appended client-side for admin/super_admin/ServiceProvider
 *     when they have at least one `system: "both"` perm — the Admin app
 *     houses cross-product pages (Users, Outlets, Audit Log, …).
 *
 * Returns systems in the preferred render order so the launcher tiles are
 * deterministic regardless of how the backend sorts them.
 */
const SYSTEM_RENDER_ORDER = ["stock", "ops", "org", "admin"];

export function availableSystems(user) {
  if (!user) return [];
  const set = new Set(Array.isArray(user.systems) ? user.systems : []);
  const role = user.role;
  const isAdmin = role === "admin" || role === "super_admin" || role === "ServiceProvider";
  if (isAdmin) {
    const perms = user.permissions instanceof Set
      ? user.permissions
      : new Set(user.permissions || []);
    const hasAdminPerm = routes.some((r) => r.system === "both" && r.code && perms.has(r.code));
    if (hasAdminPerm) set.add("admin");
  }
  return SYSTEM_RENDER_ORDER.filter((s) => set.has(s));
}

// Default landing page per system. Stock varies by role; org/admin are fixed.
export function defaultPathForSystem(system, user) {
  if (system === "admin") return "/admin/users";
  if (system === "org") return "/admin/master-products";
  if (system === "ops") return "/count-sessions";
  // stock
  const role = user?.role;
  if (role === "admin" || role === "super_admin") return "/admin/dashboard";
  return "/dashboard";
}

// Sidebar persists the active system (when the user has more than one) under this key.
export const ACTIVE_SYSTEM_STORAGE_KEY = "active_system_v1";

export function findRoute(pathname) {
  return routes.find((r) => {
    if (r.path === pathname) return true;
    if (r.path.includes(":")) {
      const pattern = new RegExp("^" + r.path.replace(/:[^/]+/g, "[^/]+") + "$");
      return pattern.test(pathname);
    }
    return false;
  });
}

export const GROUP_ORDER = ["Operate", "Analyze", "Snapshot Reports", "Masters", "Planning", "Configure"];

// Groups that start expanded.
export const DEFAULT_EXPANDED_GROUPS = new Set(["Operate", "Analyze", "Masters", "Planning", "Configure"]);
