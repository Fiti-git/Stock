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
 * IA is flattened to FOUR top-level groups — every route belongs to one of:
 *   Home       — role-based landing page
 *   Operate    — daily work: count, upload, pending reviews, transactions hub
 *   Analyze    — dashboards, reports, operations hub
 *   Configure  — master data, users, permissions, audit, system
 *
 * Each route carries a `code` matching an entry in the backend permission
 * registry. Sidebar + route guards use `code` — not `roles` — for access
 * control. The `roles` field is kept as a convenience for a few pages that
 * still inspect `user.role` directly.
 */
export const routes = [
  // ------------------------- OPERATE -------------------------
  { path: "/count",                     code: "nav.count",                label: "Stock Count",        icon: QrCodeScannerIcon,      roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate" },
  { path: "/upload",                    code: "nav.upload",               label: "Upload XLS",         icon: UploadFileIcon,         roles: ["store_user","manager","admin","super_admin"],         group: "Operate" },
  { path: "/upload/history",            code: "nav.upload_history",       label: "Upload History",     icon: HistoryIcon,            roles: ["store_user","manager","admin","super_admin"],         group: "Operate" },
  { path: "/transactions",              code: "nav.transactions_hub",     label: "Transactions",       icon: ReceiptLongIcon,        roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate" },
  { path: "/dashboard/pending",         code: "nav.pending",              label: "Pending Items",      icon: ChecklistIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate" },
  { path: "/admin/upload-approvals",    code: "nav.upload_approvals",     label: "Upload Approvals",   icon: AssignmentTurnedInIcon, roles: ["admin","super_admin"],                                 group: "Operate" },
  { path: "/daily-counts",              code: "nav.daily_counts",         label: "Counted Stock Daily",icon: FactCheckIcon,          roles: ["manager","admin","super_admin"],                       group: "Operate" },

  // ------------------------- ANALYZE -------------------------
  { path: "/admin/dashboard",           code: "nav.admin_dashboard",      label: "Admin Dashboard",    icon: DashboardIcon,          roles: ["admin","super_admin"],                        group: "Analyze" },
  { path: "/dashboard",                 code: "nav.manager_dashboard",    label: "Dashboard",          icon: DashboardIcon,          roles: ["manager"],                                     group: "Analyze" },
  { path: "/overview",                  code: "nav.overview",             label: "Outlets Overview",   icon: GridViewIcon,           roles: ["manager","admin","super_admin"],              group: "Analyze" },
  { path: "/operations",                code: "nav.operations_hub",       label: "Outlet Operations",  icon: StoreIcon,              roles: ["super_admin"],                                group: "Analyze" },
  { path: "/shrinkage",                 code: "nav.shrinkage",            label: "Shrinkage",          icon: TrendingDownIcon,       roles: ["manager","admin","super_admin"],              group: "Analyze" },
  { path: "/items/history",             code: "nav.item_pos_history",     label: "POS History",        icon: QueryStatsIcon,         roles: ["manager","admin","super_admin"],              group: "Analyze" },
  { path: "/admin/reports/daily-upload",code: "nav.daily_upload_report",  label: "Daily Upload Report",icon: AssessmentIcon,         roles: ["admin","super_admin"],                        group: "Analyze" },
  { path: "/admin/negative-pos",        code: "nav.negative_pos",         label: "Negative POS",       icon: ReportProblemIcon,      roles: ["admin","super_admin"],                        group: "Analyze" },
  { path: "/catalog",                   code: "nav.catalog",              label: "Product Catalog",    icon: Inventory2Icon,         roles: ["manager","admin","super_admin"],              group: "Analyze" },

  // Operations hub child reports — reachable by URL, hidden from sidebar (nested under /operations).
  { path: "/operations/today",                 code: "nav.operations_today",     label: "Operations — Today",   icon: DashboardCustomizeIcon, roles: ["super_admin"], group: "Analyze", showInNav: false },
  { path: "/operations/reports/daily-sales",   code: "nav.report_daily_sales",   label: "Daily Sales",           icon: PointOfSaleIcon,        roles: ["super_admin"], group: "Analyze", showInNav: false },
  { path: "/operations/reports/item-rankings", code: "nav.report_item_rankings", label: "Top / Dead Stock",      icon: LeaderboardIcon,        roles: ["super_admin"], group: "Analyze", showInNav: false },
  { path: "/operations/reports/wastage",       code: "nav.report_wastage",       label: "Wastage Summary",       icon: DeleteSweepIcon,        roles: ["super_admin"], group: "Analyze", showInNav: false },
  { path: "/operations/anomalies",             code: "nav.anomalies",            label: "Anomaly Dashboard",     icon: WarningAmberIcon,       roles: ["super_admin"], group: "Analyze", showInNav: false },
  { path: "/operations/supplier-scorecard",    code: "nav.supplier_scorecard",   label: "Supplier Scorecard",    icon: LocalShippingIcon,      roles: ["super_admin"], group: "Analyze", showInNav: false },

  // Transactions hub child routes — reachable by URL, hidden from sidebar.
  { path: "/transactions/damage/upload",         code: "nav.damage_upload",         label: "Damage — Upload",           icon: BrokenImageIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/damage/history",        code: "nav.damage_history",        label: "Damage — History",          icon: BrokenImageIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/office/upload",         code: "nav.office_upload",         label: "Office Use — Upload",       icon: AssignmentIcon,        roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/office/history",        code: "nav.office_history",        label: "Office Use — History",      icon: AssignmentIcon,        roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/verification/upload",   code: "nav.verification_upload",   label: "Verification — Upload",     icon: FactCheckOutlinedIcon, roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/verification/history",  code: "nav.verification_history",  label: "Verification — History",    icon: FactCheckOutlinedIcon, roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/grn/upload",             code: "nav.grn_upload",            label: "GRN — Upload",              icon: MoveToInboxIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/grn/history",            code: "nav.grn_history",           label: "GRN — History",             icon: MoveToInboxIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/rts/upload",             code: "nav.rts_upload",            label: "Return to Supply — Upload", icon: KeyboardReturnIcon,    roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/rts/history",            code: "nav.rts_history",           label: "Return to Supply — History",icon: KeyboardReturnIcon,    roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/sales/upload",           code: "nav.sales_upload",          label: "Sales — Upload",            icon: PointOfSaleIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/sales/history",          code: "nav.sales_history",         label: "Sales — History",           icon: PointOfSaleIcon,       roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/sales_returns/upload",   code: "nav.sales_returns_upload",  label: "Sales Returns — Upload",    icon: AssignmentReturnIcon,  roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },
  { path: "/transactions/sales_returns/history",  code: "nav.sales_returns_history", label: "Sales Returns — History",   icon: AssignmentReturnIcon,  roles: ["store_user","staff","manager","admin","super_admin"], group: "Operate", showInNav: false },

  // ------------------------- ORGANIZE -------------------------
  { path: "/admin/master-products",       code: "nav.master_products",  label: "Master Products",  icon: Inventory2Icon,       roles: ["manager","admin","super_admin"],         group: "Organize" },
  { path: "/admin/master-mapping",        code: "nav.master_mapping",   label: "Master Mapping",   icon: EditNoteIcon,         roles: ["admin","super_admin"],                    group: "Organize" },
  { path: "/admin/demand",                code: "nav.demand_dashboard", label: "Demand Dashboard", icon: QueryStatsIcon,       roles: ["manager","admin","super_admin"],         group: "Organize" },
  { path: "/admin/purchase-plans",        code: "nav.purchase_plans",   label: "Purchase Plans",   icon: AssignmentIcon,       roles: ["admin","super_admin"],                    group: "Organize" },
  { path: "/admin/stock-age",             code: "nav.stock_age",        label: "Stock Age",        icon: HourglassEmptyIcon,   roles: ["manager","admin","super_admin"],         group: "Organize" },

  // ------------------------- CONFIGURE -------------------------
  { path: "/product-master",              code: "nav.product_master",   label: "Product Master",   icon: EditNoteIcon,         roles: ["manager","admin","super_admin"],         group: "Configure" },
  { path: "/admin/barcode-master",        code: "nav.barcode_master",   label: "Barcode Master",   icon: QrCodeScannerIcon,    roles: ["manager","admin","super_admin"],         group: "Configure" },
  { path: "/admin/categories",            code: "nav.categories",       label: "Categories",       icon: CategoryIcon,         roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/admin/suppliers",             code: "nav.suppliers",        label: "Suppliers",        icon: LocalShippingIcon,    roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/admin/outlets",               code: "nav.outlets",          label: "Outlets",          icon: StorefrontIcon,       roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/admin/users",                 code: "nav.users",            label: "Users",            icon: PeopleAltIcon,        roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/super-admin/user-permissions",code: "nav.user_permissions", label: "User Permissions", icon: AdminPanelSettingsIcon,roles: ["super_admin"],                           group: "Configure" },
  { path: "/admin/license-configuration", code: "nav.license",          label: "License",          icon: WorkspacePremiumIcon, roles: ["admin","super_admin","ServiceProvider"], group: "Configure" },
  { path: "/admin/audit-log",             code: "nav.audit_log",        label: "Audit Log",        icon: ListAltIcon,          roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/admin/mobile-devices",        code: "nav.mobile_devices",   label: "Mobile Devices",   icon: PhoneAndroidIcon,     roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/admin/login-events",          code: "nav.login_events",     label: "Login Events",     icon: SecurityIcon,         roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/admin/orphan-cleanup",        code: "nav.orphan_cleanup",   label: "Orphan Cleanup",   icon: CleaningServicesIcon, roles: ["admin","super_admin"],                    group: "Configure" },
  { path: "/db-management",               code: "nav.db_management",    label: "DB Management",    icon: StorageIcon,          roles: ["store_user","staff","manager","admin","super_admin"], group: "Configure" },

  // Hidden routes (no permission gate — inherit from parent page).
  { path: "/items/:id",                       label: "Item Detail",              roles: ["store_user","staff","manager","admin","super_admin"], showInNav: false },
  { path: "/admin/products/:itemId/history",  label: "Product History",          roles: ["manager","admin","super_admin"],                      showInNav: false },
  { path: "/login",                           label: "Login",                    roles: ["public"],                                              showInNav: false },
  { path: "/license-setup-required",          label: "License Setup Required",   roles: ["public"],                                              showInNav: false },
];

/**
 * Return visible nav items for the given set of effective permission codes.
 */
export function routesForPermissions(permissions) {
  const set = permissions instanceof Set ? permissions : new Set(permissions || []);
  return routes.filter((r) => r.showInNav !== false && r.code && set.has(r.code));
}

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

export const GROUP_ORDER = ["Operate", "Analyze", "Organize", "Configure"];

// Groups that start expanded. All four are open on first visit — the user's
// per-group collapse state is persisted in localStorage on subsequent loads.
export const DEFAULT_EXPANDED_GROUPS = new Set(GROUP_ORDER);
