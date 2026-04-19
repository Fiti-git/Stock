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

/**
 * Single source of truth for routes. Consumed by Sidebar, Breadcrumbs, CommandPalette.
 * Hidden routes (no label / showInNav=false) are reachable but not listed in nav.
 *
 * Each route carries a `code` matching an entry in the backend permission
 * registry (apps/accounts/permission_registry.py). The Sidebar and route
 * guards use `code` — not `roles` — for access control. The `roles` field is
 * kept as a convenience for pages that still inspect `user.role` directly.
 */
export const routes = [
  // Daily work — always visible at the top
  { path: "/count",           code: "nav.count",            label: "Stock Count",       icon: QrCodeScannerIcon,    roles: ["store_user","staff","manager","admin","super_admin"], group: "Operations" },
  { path: "/upload",          code: "nav.upload",           label: "Upload XLS",        icon: UploadFileIcon,       roles: ["store_user","manager","admin","super_admin"],         group: "Operations" },
  { path: "/upload/history",  code: "nav.upload_history",   label: "Upload History",    icon: HistoryIcon,          roles: ["store_user","manager","admin","super_admin"],         group: "Operations" },

  // Dashboards — the "at a glance" views
  { path: "/admin/dashboard", code: "nav.admin_dashboard",  label: "Admin Dashboard",   icon: DashboardIcon,        roles: ["admin","super_admin"],            group: "Dashboards" },
  { path: "/dashboard",       code: "nav.manager_dashboard",label: "Dashboard",         icon: DashboardIcon,        roles: ["manager"],                         group: "Dashboards" },
  { path: "/overview",        code: "nav.overview",         label: "Outlets Overview",  icon: GridViewIcon,         roles: ["manager","admin","super_admin"],  group: "Dashboards" },

  // Review — things awaiting action
  { path: "/dashboard/pending",      code: "nav.pending",          label: "Pending Items",      icon: ChecklistIcon,          roles: ["manager","admin","super_admin"], group: "Review" },
  { path: "/admin/upload-approvals", code: "nav.upload_approvals", label: "Upload Approvals",   icon: AssignmentTurnedInIcon, roles: ["admin","super_admin"],            group: "Review" },
  { path: "/daily-counts",           code: "nav.daily_counts",     label: "Counted Stock Daily",icon: FactCheckIcon,          roles: ["manager","admin","super_admin"], group: "Review" },

  // Reports — historical analysis
  { path: "/shrinkage",                  code: "nav.shrinkage",            label: "Shrinkage",           icon: TrendingDownIcon, roles: ["manager","admin","super_admin"],  group: "Reports" },
  { path: "/items/history",              code: "nav.item_pos_history",     label: "POS History",         icon: QueryStatsIcon,   roles: ["manager","admin","super_admin"],  group: "Reports" },
  { path: "/admin/reports/daily-upload", code: "nav.daily_upload_report",  label: "Daily Upload Report", icon: AssessmentIcon,   roles: ["admin","super_admin"],             group: "Reports" },
  { path: "/admin/negative-pos",         code: "nav.negative_pos",         label: "Negative POS",        icon: ReportProblemIcon,roles: ["admin","super_admin"],             group: "Reports" },

  // Catalog — item management
  { path: "/catalog",              code: "nav.catalog",        label: "Product Catalog", icon: Inventory2Icon,    roles: ["manager","admin","super_admin"], group: "Catalog" },
  { path: "/product-master",       code: "nav.product_master", label: "Product Master",  icon: EditNoteIcon,      roles: ["manager","admin","super_admin"], group: "Catalog" },
  { path: "/admin/barcode-master", code: "nav.barcode_master", label: "Barcode Master",  icon: QrCodeScannerIcon, roles: ["manager","admin","super_admin"], group: "Catalog" },

  // Administration — setup / config
  { path: "/admin/outlets",               code: "nav.outlets",          label: "Outlets",          icon: StorefrontIcon,       roles: ["admin","super_admin"],                   group: "Administration" },
  { path: "/admin/users",                 code: "nav.users",            label: "Users",            icon: PeopleAltIcon,        roles: ["admin","super_admin"],                   group: "Administration" },
  { path: "/admin/license-configuration", code: "nav.license",          label: "License",          icon: WorkspacePremiumIcon, roles: ["admin","super_admin","ServiceProvider"], group: "Administration" },
  { path: "/super-admin/user-permissions",code: "nav.user_permissions", label: "User Permissions", icon: AdminPanelSettingsIcon,roles: ["super_admin"],                          group: "Administration" },

  // Audit & Security — trails, devices, cleanup
  { path: "/admin/audit-log",       code: "nav.audit_log",       label: "Audit Log",      icon: ListAltIcon,          roles: ["admin","super_admin"], group: "Audit & Security" },
  { path: "/admin/mobile-devices",  code: "nav.mobile_devices",  label: "Mobile Devices", icon: PhoneAndroidIcon,     roles: ["admin","super_admin"], group: "Audit & Security" },
  { path: "/admin/login-events",    code: "nav.login_events",    label: "Login Events",   icon: SecurityIcon,         roles: ["admin","super_admin"], group: "Audit & Security" },
  { path: "/admin/orphan-cleanup",  code: "nav.orphan_cleanup",  label: "Orphan Cleanup", icon: CleaningServicesIcon, roles: ["admin","super_admin"], group: "Audit & Security" },

  // System — infra ops
  { path: "/db-management",   code: "nav.db_management",    label: "DB Management",     icon: StorageIcon, roles: ["store_user","staff","manager","admin","super_admin"], group: "System" },

  // Hidden routes (not in nav) — no permission gate required, they inherit
  // from their parent page. Sidebar ignores these.
  { path: "/items/:id",       label: "Item Detail",       roles: ["store_user","staff","manager","admin","super_admin"], showInNav: false },
  { path: "/admin/products/:itemId/history", label: "Product History", roles: ["manager","admin","super_admin"], showInNav: false },
  { path: "/login",           label: "Login",             roles: ["public"], showInNav: false },
  { path: "/license-setup-required", label: "License Setup Required", roles: ["public"], showInNav: false },
];

/**
 * Return visible nav items for the given set of effective permission codes.
 * A route is shown when its `code` is in the user's permission set.
 */
export function routesForPermissions(permissions) {
  const set = permissions instanceof Set ? permissions : new Set(permissions || []);
  return routes.filter(
    (r) => r.showInNav !== false && r.code && set.has(r.code)
  );
}

export function findRoute(pathname) {
  return routes.find((r) => {
    if (r.path === pathname) return true;
    // simple :param match
    if (r.path.includes(":")) {
      const pattern = new RegExp("^" + r.path.replace(/:[^/]+/g, "[^/]+") + "$");
      return pattern.test(pathname);
    }
    return false;
  });
}

export const GROUP_ORDER = [
  "Operations",
  "Dashboards",
  "Review",
  "Reports",
  "Catalog",
  "Administration",
  "Audit & Security",
  "System",
];

// Groups in this set start expanded; others start collapsed. User's toggle
// state is persisted per-group in localStorage and overrides these defaults.
export const DEFAULT_EXPANDED_GROUPS = new Set([
  "Operations",
  "Dashboards",
  "Review",
  "Catalog",
]);
