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

/**
 * Single source of truth for routes. Consumed by Sidebar, Breadcrumbs, CommandPalette.
 * Hidden routes (no label / showInNav=false) are reachable but not listed in nav.
 */
export const routes = [
  // Store / Staff
  { path: "/count",           label: "Stock Count",       icon: QrCodeScannerIcon,    roles: ["store_user","staff","manager","admin"], group: "Operations" },

  // Uploads
  { path: "/upload",          label: "Upload XLS",        icon: UploadFileIcon,       roles: ["store_user","manager","admin"],         group: "Operations" },
  { path: "/upload/history",  label: "Upload History",    icon: HistoryIcon,          roles: ["store_user","manager","admin"],         group: "Operations" },

  // Overview / Dashboards
  { path: "/admin/dashboard", label: "Admin Dashboard",   icon: DashboardIcon,        roles: ["admin"],            group: "Insights" },
  { path: "/dashboard",       label: "Dashboard",         icon: DashboardIcon,        roles: ["manager","admin"],  group: "Insights" },
  { path: "/overview",        label: "Outlets Overview",  icon: GridViewIcon,         roles: ["manager","admin"],  group: "Insights" },
  { path: "/dashboard/pending", label: "Pending Items",   icon: ChecklistIcon,        roles: ["manager","admin"],  group: "Insights" },
  { path: "/shrinkage",       label: "Shrinkage",         icon: TrendingDownIcon,     roles: ["manager","admin"],  group: "Insights" },
  { path: "/daily-counts",    label: "Counted Stock Daily",icon: ChecklistIcon,       roles: ["manager","admin"],  group: "Insights" },
  { path: "/items/history",   label: "POS History",       icon: QueryStatsIcon,       roles: ["manager","admin"],  group: "Insights" },
  { path: "/admin/reports/daily-upload", label: "Daily Upload Report", icon: AssessmentIcon, roles: ["admin"],      group: "Insights" },

  // Catalog
  { path: "/catalog",         label: "Product Catalog",   icon: Inventory2Icon,       roles: ["manager","admin"],  group: "Catalog" },
  { path: "/product-master",  label: "Product Master",    icon: EditNoteIcon,         roles: ["manager","admin"],  group: "Catalog" },
  { path: "/admin/barcode-master", label: "Barcode Master", icon: QrCodeScannerIcon,  roles: ["admin"],            group: "Catalog" },

  // Admin
  { path: "/admin/upload-approvals", label: "Upload Approvals", icon: AssignmentTurnedInIcon, roles: ["admin"],   group: "Admin" },
  { path: "/admin/outlets",   label: "Outlets",           icon: StorefrontIcon,       roles: ["admin"],            group: "Admin" },
  { path: "/admin/users",     label: "Users",             icon: PeopleAltIcon,        roles: ["admin"],            group: "Admin" },
  { path: "/admin/audit-log", label: "Audit Log",         icon: ListAltIcon,          roles: ["admin"],            group: "Admin" },
  { path: "/admin/negative-pos", label: "Negative POS",   icon: ReportProblemIcon,    roles: ["admin"],            group: "Admin" },
  { path: "/admin/license-configuration", label: "License", icon: WorkspacePremiumIcon, roles: ["admin","ServiceProvider"], group: "Admin" },

  // System (all roles)
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

export const GROUP_ORDER = ["Operations", "Insights", "Catalog", "Admin", "System"];
