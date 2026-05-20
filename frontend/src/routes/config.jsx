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
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import AssessmentIcon from "@mui/icons-material/Assessment";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import SecurityIcon from "@mui/icons-material/Security";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import AssignmentIcon from "@mui/icons-material/Assignment";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import StoreIcon from "@mui/icons-material/Store";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CategoryIcon from "@mui/icons-material/Category";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";

/**
 * Single source of truth for routes. Consumed by Sidebar, Breadcrumbs, CommandPalette.
 * Hidden routes (no label / showInNav=false) are reachable but not listed in nav.
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
  // Stock Count is mobile-only — the route stays reachable for testing but
  // is hidden from the web sidebar. Same for the three POS-snapshot routes:
  // they're surfaced as cards inside the /transactions hub instead.
  { path: "/count",                     code: "nav.count",                label: "Stock Count",        icon: QrCodeScannerIcon,      roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/upload",                    code: "nav.upload",               label: "Upload XLS",         icon: UploadFileIcon,         roles: ["store_user","manager","admin","super_admin"],         group: "Operate", system: "stock", showInNav: false },
  { path: "/upload/history",            code: "nav.upload_history",       label: "Upload History",     icon: HistoryIcon,            roles: ["store_user","manager","admin","super_admin"],         group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions",              code: "nav.transactions_hub",     label: "Transactions",       icon: ReceiptLongIcon,        roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock" },
  { path: "/upload/hub",                code: "nav.upload",               label: "Upload XLS",         icon: UploadFileIcon,         roles: ["store_user","manager","admin","super_admin"],         group: "Operate", system: "stock" },
  { path: "/dashboard/pending",         code: "nav.pending",              label: "Pending Items",      icon: ChecklistIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate", system: "stock" },
  { path: "/uploaded-sheets",           code: "nav.uploaded_sheets",      label: "Uploaded XLS Sheets",icon: HistoryIcon,            roles: ["manager","admin","super_admin"],                       group: "Operate", system: "stock" },
  { path: "/admin/upload-approvals",    code: "nav.upload_approvals",     label: "Upload Approvals",   icon: AssignmentTurnedInIcon, roles: ["admin","super_admin"],                                 group: "Operate", system: "stock", showInNav: false },
  { path: "/count-sessions",            code: "nav.count_sessions",       label: "Count Sessions",     icon: FactCheckIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate", system: "stock" },
  { path: "/daily-counts",              code: "nav.daily_counts",         label: "Counted Stock Daily",icon: FactCheckIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate", system: "stock", showInNav: false },
  { path: "/count-review",              code: "nav.count_review",         label: "Count Review",       icon: FactCheckIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate", system: "stock", showInNav: false },
  { path: "/variance-reconciliation",   code: "nav.variance_reconciliation", label: "Variance Reconciliation", icon: ChecklistIcon,    roles: ["manager","admin","super_admin"],                       group: "Operate", system: "stock", showInNav: false },

  // ------------------------- TRANSFERS -------------------------
  { path: "/transfers/request",  code: "nav.transfers_request",  label: "Request Transfer",  icon: MoveToInboxIcon,    roles: ["store_user","staff","manager","admin","super_admin"], group: "Transfers", system: "stock" },
  { path: "/transfers/dispatch", code: "nav.transfers_dispatch", label: "Dispatch Outgoing", icon: LocalShippingIcon,  roles: ["manager","admin","super_admin"],                       group: "Transfers", system: "stock" },
  { path: "/transfers/receive",  code: "nav.transfers_receive",  label: "Receive Incoming",  icon: AssignmentTurnedInIcon, roles: ["manager","admin","super_admin"],                  group: "Transfers", system: "stock" },
  { path: "/transfers/:id",      code: "nav.transfers",          label: "Transfer Detail",   icon: ReceiptLongIcon,    roles: ["store_user","staff","manager","admin","super_admin"], group: "Transfers", system: "stock", showInNav: false },

  // ------------------------- ANALYZE -------------------------
  { path: "/admin/dashboard",           code: "nav.admin_dashboard",      label: "Admin Dashboard",    icon: DashboardIcon,          roles: ["admin","super_admin"],                        group: "Analyze", system: "stock" },
  { path: "/dashboard",                 code: "nav.manager_dashboard",    label: "Dashboard",          icon: DashboardIcon,          roles: ["manager"],                                     group: "Analyze", system: "stock" },
  { path: "/overview",                  code: "nav.overview",             label: "Outlets Overview",   icon: GridViewIcon,           roles: ["manager","admin","super_admin"],              group: "Analyze", system: "stock" },
  { path: "/operations",                code: "nav.operations_hub",       label: "Outlet Operations",  icon: StoreIcon,              roles: ["super_admin"],                                group: "Analyze", system: "stock" },
  { path: "/shrinkage",                 code: "nav.shrinkage",            label: "Shrinkage",          icon: TrendingDownIcon,       roles: ["manager","admin","super_admin"],              group: "Analyze", system: "stock" },
  { path: "/items/history",             code: "nav.item_pos_history",     label: "POS History",        icon: QueryStatsIcon,         roles: ["manager","admin","super_admin"],              group: "Analyze", system: "stock" },
  { path: "/admin/reports/daily-upload",code: "nav.daily_upload_report",  label: "Daily Upload Report",icon: AssessmentIcon,         roles: ["admin","super_admin"],                        group: "Analyze", system: "stock" },
  { path: "/admin/negative-pos",        code: "nav.negative_pos",         label: "Negative POS",       icon: ReportProblemIcon,      roles: ["admin","super_admin"],                        group: "Analyze", system: "stock" },
  { path: "/admin/reports/stock-variance", code: "nav.stock_variance",    label: "Stock Variance",     icon: FactCheckIcon,          roles: ["admin","super_admin"],                        group: "Analyze", system: "stock" },
  { path: "/admin/reports/count-coverage", code: "nav.count_coverage",    label: "Count Coverage",     icon: AssignmentTurnedInIcon, roles: ["admin","super_admin","manager"],              group: "Analyze", system: "stock" },
  { path: "/admin/reports/counted-items",  code: "nav.counted_items_report", label: "Counted vs Uncounted", icon: ChecklistIcon,      roles: ["admin","super_admin"],                        group: "Analyze", system: "stock" },
  { path: "/reports/counter-performance",  code: "nav.counter_performance",  label: "Counter Performance",  icon: LeaderboardIcon,    roles: ["manager","admin","super_admin"],              group: "Analyze", system: "stock" },
  { path: "/reports/mobile-usage",         code: "nav.mobile_usage",          label: "Mobile Usage",          icon: PhoneAndroidIcon,   roles: ["manager","admin","super_admin"],              group: "Analyze", system: "stock" },
  { path: "/catalog",                   code: "nav.catalog",              label: "Product Catalog",    icon: Inventory2Icon,         roles: ["manager","admin","super_admin"],              group: "Analyze", system: "stock" },

  // Operations hub child reports — reachable by URL, hidden from sidebar (nested under /operations).
  { path: "/operations/today",                 code: "nav.operations_today",     label: "Operations — Today",   icon: DashboardCustomizeIcon, roles: ["super_admin"], group: "Analyze", system: "stock", showInNav: false },
  { path: "/operations/reports/daily-sales",   code: "nav.report_daily_sales",   label: "Daily Sales",           icon: PointOfSaleIcon,        roles: ["super_admin"], group: "Analyze", system: "stock", showInNav: false },
  { path: "/operations/reports/item-rankings", code: "nav.report_item_rankings", label: "Top / Dead Stock",      icon: LeaderboardIcon,        roles: ["super_admin"], group: "Analyze", system: "stock", showInNav: false },
  { path: "/operations/reports/wastage",       code: "nav.report_wastage",       label: "Wastage Summary",       icon: DeleteSweepIcon,        roles: ["super_admin"], group: "Analyze", system: "stock", showInNav: false },
  { path: "/operations/anomalies",             code: "nav.anomalies",            label: "Anomaly Dashboard",     icon: WarningAmberIcon,       roles: ["super_admin"], group: "Analyze", system: "stock", showInNav: false },
  { path: "/operations/supplier-scorecard",    code: "nav.supplier_scorecard",   label: "Supplier Scorecard",    icon: LocalShippingIcon,      roles: ["super_admin"], group: "Analyze", system: "stock", showInNav: false },

  // Transactions hub child routes — reachable by URL, hidden from sidebar.
  { path: "/transactions/damage/upload",         code: "nav.damage_upload",         label: "Damage — Upload",           icon: BrokenImageIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/damage/history",        code: "nav.damage_history",        label: "Damage — History",          icon: BrokenImageIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/office/upload",         code: "nav.office_upload",         label: "Office Use — Upload",       icon: AssignmentIcon,        roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/office/history",        code: "nav.office_history",        label: "Office Use — History",      icon: AssignmentIcon,        roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/verification/upload",   code: "nav.verification_upload",   label: "Verification — Upload",     icon: FactCheckOutlinedIcon, roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/verification/history",  code: "nav.verification_history",  label: "Verification — History",    icon: FactCheckOutlinedIcon, roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/grn/upload",             code: "nav.grn_upload",            label: "GRN — Upload",              icon: MoveToInboxIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/grn/history",            code: "nav.grn_history",           label: "GRN — History",             icon: MoveToInboxIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/rts/upload",             code: "nav.rts_upload",            label: "Return to Supply — Upload", icon: KeyboardReturnIcon,    roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/rts/history",            code: "nav.rts_history",           label: "Return to Supply — History",icon: KeyboardReturnIcon,    roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/sales/upload",           code: "nav.sales_upload",          label: "Sales — Upload",            icon: PointOfSaleIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/sales/history",          code: "nav.sales_history",         label: "Sales — History",           icon: PointOfSaleIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/sales_returns/upload",   code: "nav.sales_returns_upload",  label: "Sales Returns — Upload",    icon: AssignmentReturnIcon,  roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },
  { path: "/transactions/sales_returns/history",  code: "nav.sales_returns_history", label: "Sales Returns — History",   icon: AssignmentReturnIcon,  roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", system: "stock", showInNav: false },

  // ------------------------- ORGANIZE -------------------------
  { path: "/admin/master-products",       code: "nav.master_products",  label: "Master Products",  icon: Inventory2Icon,       roles: ["manager","admin","super_admin"],         group: "Organize", system: "stock" },
  { path: "/admin/master-mapping",        code: "nav.master_mapping",   label: "Master Mapping",   icon: EditNoteIcon,         roles: ["admin","super_admin"],                    group: "Organize", system: "stock" },
  { path: "/admin/demand",                code: "nav.demand_dashboard", label: "Demand Dashboard", icon: QueryStatsIcon,       roles: ["manager","admin","super_admin"],         group: "Organize", system: "stock" },
  { path: "/admin/purchase-plans",        code: "nav.purchase_plans",   label: "Purchase Plans",   icon: AssignmentIcon,       roles: ["admin","super_admin"],                    group: "Organize", system: "stock" },
  { path: "/admin/stock-age",             code: "nav.stock_age",        label: "Stock Age",        icon: HourglassEmptyIcon,   roles: ["manager","admin","super_admin"],         group: "Organize", system: "stock" },

  // ------------------------- CONFIGURE -------------------------
  { path: "/product-master",              code: "nav.product_master",   label: "Product Master",   icon: EditNoteIcon,         roles: ["manager","admin","super_admin"],         group: "Configure", system: "stock" },
  { path: "/admin/barcode-master",        code: "nav.barcode_master",   label: "Barcode Master",   icon: QrCodeScannerIcon,    roles: ["manager","admin","super_admin"],         group: "Configure", system: "stock" },
  { path: "/admin/categories",            code: "nav.categories",       label: "Categories",       icon: CategoryIcon,         roles: ["admin","super_admin"],                    group: "Configure", system: "stock" },
  { path: "/admin/suppliers",             code: "nav.suppliers",        label: "Suppliers",        icon: LocalShippingIcon,    roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/outlets",               code: "nav.outlets",          label: "Outlets",          icon: StorefrontIcon,       roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/users",                 code: "nav.users",            label: "Users",            icon: PeopleAltIcon,        roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/super-admin/user-permissions",code: "nav.user_permissions", label: "User Permissions", icon: AdminPanelSettingsIcon,roles: ["super_admin"],                           group: "Configure", system: "both" },
  { path: "/admin/license-configuration", code: "nav.license",          label: "License",          icon: WorkspacePremiumIcon, roles: ["admin","super_admin","ServiceProvider"], group: "Configure", system: "both" },
  { path: "/admin/audit-log",             code: "nav.audit_log",        label: "Audit Log",        icon: ListAltIcon,          roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/mobile-devices",        code: "nav.mobile_devices",   label: "Mobile Devices",   icon: PhoneAndroidIcon,     roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/login-events",          code: "nav.login_events",     label: "Login Events",     icon: SecurityIcon,         roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/admin/orphan-cleanup",        code: "nav.orphan_cleanup",   label: "Orphan Cleanup",   icon: CleaningServicesIcon, roles: ["admin","super_admin"],                    group: "Configure", system: "both" },
  { path: "/db-management",               code: "nav.db_management",    label: "DB Management",    icon: StorageIcon,          roles: ["store_user","staff","manager","admin","super_admin"], group: "Configure", system: "both" },

  // Hidden routes (no permission gate — inherit from parent page).
  { path: "/uploaded-sheets/:id",             label: "Sheet Detail",             roles: ["manager","admin","super_admin"],                      showInNav: false },
  { path: "/items/:id",                       label: "Item Detail",              roles: ["store_user","staff","manager","admin","super_admin"], showInNav: false },
  { path: "/admin/products/:itemId/history",  label: "Product History",          roles: ["manager","admin","super_admin"],                      showInNav: false },
  { path: "/login",                           label: "Login",                    roles: ["public"],                                              showInNav: false },
  { path: "/license-setup-required",          label: "License Setup Required",   roles: ["public"],                                              showInNav: false },
];

/**
 * Return visible nav items for the given set of effective permission codes.
 *
 * `activeSystem` is "stock" | "admin" | null.
 *   - null    → no filter (legacy; only used before launcher selection lands)
 *   - "admin" → cross-product pages only (routes tagged `system: "both"`)
 *   - else    → only routes whose `system` matches exactly. Cross-product
 *               routes live in the Admin app now, not in every sidebar.
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
 * sidebar entry (Upload XLS, Upload Approvals, Stock Count, transaction
 * sub-pages, etc.). Skips parameterised routes (e.g. /items/:id) and
 * internal-only entries (login, license setup) that have no `code`.
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
 * Which "apps" (stock | admin) the user can launch.
 * Stock comes from the backend-provided `user.systems` array.
 * "admin" is reserved for admin/super_admin/ServiceProvider — the
 * cross-product app houses Users, Outlets, Audit Log, License, etc.
 * and is not intended for managers or store users.
 */
export function availableSystems(user) {
  if (!user) return [];
  const systems = Array.isArray(user.systems) ? [...user.systems] : [];
  const role = user.role;
  const isAdmin = role === "admin" || role === "super_admin" || role === "ServiceProvider";
  if (isAdmin) {
    const perms = user.permissions instanceof Set
      ? user.permissions
      : new Set(user.permissions || []);
    const hasAdminPerm = routes.some((r) => r.system === "both" && r.code && perms.has(r.code));
    if (hasAdminPerm) systems.push("admin");
  }
  return systems;
}

// Default landing page per system. Stock varies by role; admin is fixed.
export function defaultPathForSystem(system, user) {
  if (system === "admin") return "/admin/users";
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

export const GROUP_ORDER = ["Operate", "Transfers", "Analyze", "Organize", "Configure"];

// Groups that start expanded.
export const DEFAULT_EXPANDED_GROUPS = new Set(["Operate", "Transfers", "Analyze", "Organize", "Configure"]);
