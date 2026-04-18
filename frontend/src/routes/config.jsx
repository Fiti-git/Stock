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

/**
 * Single source of truth for routes. Consumed by Sidebar, Breadcrumbs, CommandPalette.
 * Hidden routes (no label / showInNav=false) are reachable but not listed in nav.
 */
export const routes = [
  // Daily work — always visible at the top
  { path: "/count",           label: "Stock Count",       icon: QrCodeScannerIcon,    roles: ["store_user","staff","manager","admin"], group: "Operations" },
  { path: "/upload",          label: "Upload XLS",        icon: UploadFileIcon,       roles: ["store_user","manager","admin"],         group: "Operations" },
  { path: "/upload/history",  label: "Upload History",    icon: HistoryIcon,          roles: ["store_user","manager","admin"],         group: "Operations" },

  // Dashboards — the "at a glance" views
  { path: "/admin/dashboard", label: "Admin Dashboard",   icon: DashboardIcon,        roles: ["admin"],            group: "Dashboards" },
  { path: "/dashboard",       label: "Dashboard",         icon: DashboardIcon,        roles: ["manager"],          group: "Dashboards" },
  { path: "/overview",        label: "Outlets Overview",  icon: GridViewIcon,         roles: ["manager","admin"],  group: "Dashboards" },

  // Review — things awaiting action
  { path: "/dashboard/pending", label: "Pending Items",      icon: ChecklistIcon,         roles: ["manager","admin"], group: "Review" },
  { path: "/admin/upload-approvals", label: "Upload Approvals", icon: AssignmentTurnedInIcon, roles: ["admin"],        group: "Review" },
  { path: "/daily-counts",      label: "Counted Stock Daily", icon: FactCheckIcon,         roles: ["manager","admin"], group: "Review" },

  // Reports — historical analysis
  { path: "/shrinkage",       label: "Shrinkage",         icon: TrendingDownIcon,     roles: ["manager","admin"],  group: "Reports" },
  { path: "/items/history",   label: "POS History",       icon: QueryStatsIcon,       roles: ["manager","admin"],  group: "Reports" },
  { path: "/admin/reports/daily-upload", label: "Daily Upload Report", icon: AssessmentIcon, roles: ["admin"],      group: "Reports" },
  { path: "/admin/negative-pos", label: "Negative POS",   icon: ReportProblemIcon,    roles: ["admin"],            group: "Reports" },

  // Catalog — item management
  { path: "/catalog",              label: "Product Catalog", icon: Inventory2Icon,    roles: ["manager","admin"],           group: "Catalog" },
  { path: "/product-master",       label: "Product Master",  icon: EditNoteIcon,      roles: ["manager","admin"],           group: "Catalog" },
  { path: "/admin/barcode-master", label: "Barcode Master",  icon: QrCodeScannerIcon, roles: ["manager","admin"],           group: "Catalog" },

  // Administration — setup / config
  { path: "/admin/outlets",     label: "Outlets", icon: StorefrontIcon,         roles: ["admin"],                   group: "Administration" },
  { path: "/admin/users",       label: "Users",   icon: PeopleAltIcon,          roles: ["admin"],                   group: "Administration" },
  { path: "/admin/license-configuration", label: "License", icon: WorkspacePremiumIcon, roles: ["admin","ServiceProvider"], group: "Administration" },

  // Audit & Security — trails, devices, cleanup
  { path: "/admin/audit-log",       label: "Audit Log",      icon: ListAltIcon,            roles: ["admin"], group: "Audit & Security" },
  { path: "/admin/mobile-devices",  label: "Mobile Devices", icon: PhoneAndroidIcon,       roles: ["admin"], group: "Audit & Security" },
  { path: "/admin/login-events",    label: "Login Events",   icon: SecurityIcon,           roles: ["admin"], group: "Audit & Security" },
  { path: "/admin/orphan-cleanup",  label: "Orphan Cleanup", icon: CleaningServicesIcon,   roles: ["admin"], group: "Audit & Security" },

  // System — infra ops
  { path: "/db-management",   label: "DB Management",     icon: StorageIcon,          roles: ["store_user","staff","manager","admin"], group: "System" },

  // Hidden routes (not in nav)
  { path: "/items/:id",       label: "Item Detail",       roles: ["store_user","staff","manager","admin"], showInNav: false },
  { path: "/admin/products/:itemId/history", label: "Product History", roles: ["manager","admin"], showInNav: false },
  { path: "/login",           label: "Login",             roles: ["public"], showInNav: false },
  { path: "/license-setup-required", label: "License Setup Required", roles: ["public"], showInNav: false },
];

export function routesForRole(role) {
  if (!role) return [];
  return routes.filter((r) => r.showInNav !== false && r.roles.includes(role));
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
