import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { ThemeModeProvider } from "./theme/ThemeModeContext";
import { NotificationProvider } from "./providers/NotificationProvider";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OutletProvider } from "./contexts/OutletContext";
import { LicenseProvider } from "./contexts/LicenseContext";
import LoginPage from "./pages/auth/LoginPage";

// Everything below is route-split: keep the initial bundle small, ship JS
// only for the page the user actually navigates to. The MUI DataGrid, recharts
// and xlsx dependencies are heavy and confined to a handful of these pages.
const UploadPage = lazy(() => import("./pages/store-user/UploadPage"));
const HistoryPage = lazy(() => import("./pages/store-user/HistoryPage"));
const StockCountPage = lazy(() => import("./pages/store-user/StockCountPage"));
const ItemDetailPage = lazy(() => import("./pages/store-user/ItemDetailPage"));
const DashboardPage = lazy(() => import("./pages/manager/DashboardPage"));
const PendingItemsPage = lazy(() => import("./pages/manager/PendingItemsPage"));
const ShrinkagePage = lazy(() => import("./pages/manager/ShrinkagePage"));
const CatalogPage = lazy(() => import("./pages/manager/CatalogPage"));
const ItemPosHistoryPage = lazy(() => import("./pages/manager/ItemPosHistoryPage"));
const UploadApprovalsPage = lazy(() => import("./pages/admin/UploadApprovalsPage"));
const OutletsPage = lazy(() => import("./pages/admin/OutletsPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const OutletsOverviewPage = lazy(() => import("./pages/admin/OutletsOverviewPage"));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage"));
const NegativePosReportPage = lazy(() => import("./pages/admin/NegativePosReportPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const ProductMasterPage = lazy(() => import("./pages/manager/ProductMasterPage"));
const CountedStockDailyPage = lazy(() => import("./pages/manager/CountedStockDailyPage"));
const CountReviewPage = lazy(() => import("./pages/manager/CountReviewPage"));
const VarianceReconciliationPage = lazy(() => import("./pages/manager/VarianceReconciliationPage"));
const BarcodeMasterPage = lazy(() => import("./pages/admin/BarcodeMasterPage"));
const ProductHistoryPage = lazy(() => import("./pages/admin/ProductHistoryPage"));
const DailyUploadReportPage = lazy(() => import("./pages/admin/DailyUploadReportPage"));
const StockVarianceReportPage = lazy(() => import("./pages/admin/StockVarianceReportPage"));
const CountedItemsReportPage = lazy(() => import("./pages/admin/CountedItemsReportPage"));
const MobileDevicesPage = lazy(() => import("./pages/admin/MobileDevicesPage"));
const LoginEventsPage = lazy(() => import("./pages/admin/LoginEventsPage"));
const OrphanCleanupPage = lazy(() => import("./pages/admin/OrphanCleanupPage"));
const UserPermissionsPage = lazy(() => import("./pages/super-admin/UserPermissionsPage"));
const DamageUploadPage = lazy(() => import("./pages/transactions/DamageUploadPage"));
const DamageHistoryPage = lazy(() => import("./pages/transactions/DamageHistoryPage"));
const OfficeUploadPage = lazy(() => import("./pages/transactions/OfficeUploadPage"));
const OfficeHistoryPage = lazy(() => import("./pages/transactions/OfficeHistoryPage"));
const VerificationUploadPage = lazy(() => import("./pages/transactions/VerificationUploadPage"));
const VerificationHistoryPage = lazy(() => import("./pages/transactions/VerificationHistoryPage"));
const GrnUploadPage = lazy(() => import("./pages/transactions/GrnUploadPage"));
const GrnHistoryPage = lazy(() => import("./pages/transactions/GrnHistoryPage"));
const RtsUploadPage = lazy(() => import("./pages/transactions/RtsUploadPage"));
const RtsHistoryPage = lazy(() => import("./pages/transactions/RtsHistoryPage"));
const SalesUploadPage = lazy(() => import("./pages/transactions/SalesUploadPage"));
const SalesHistoryPage = lazy(() => import("./pages/transactions/SalesHistoryPage"));
const SalesReturnsUploadPage = lazy(() => import("./pages/transactions/SalesReturnsUploadPage"));
const SalesReturnsHistoryPage = lazy(() => import("./pages/transactions/SalesReturnsHistoryPage"));
const TransactionsHubPage = lazy(() => import("./pages/transactions/TransactionsHubPage"));
const OperationsTodayPage = lazy(() => import("./pages/operations/OperationsTodayPage"));
const DailySalesReportPage = lazy(() => import("./pages/operations/DailySalesReportPage"));
const ItemRankingsReportPage = lazy(() => import("./pages/operations/ItemRankingsReportPage"));
const WastageReportPage = lazy(() => import("./pages/operations/WastageReportPage"));
const AnomalyDashboardPage = lazy(() => import("./pages/operations/AnomalyDashboardPage"));
const OperationsHubPage = lazy(() => import("./pages/operations/OperationsHubPage"));
const SupplierScorecardPage = lazy(() => import("./pages/operations/SupplierScorecardPage"));
const SuppliersPage = lazy(() => import("./pages/admin/SuppliersPage"));
const CategoriesPage = lazy(() => import("./pages/admin/CategoriesPage"));
const MasterProductsPage = lazy(() => import("./pages/admin/MasterProductsPage"));
const MasterMappingPage = lazy(() => import("./pages/admin/MasterMappingPage"));
const DemandDashboardPage = lazy(() => import("./pages/admin/DemandDashboardPage"));
const PurchasePlansPage = lazy(() => import("./pages/admin/PurchasePlansPage"));
const PurchasePlanDetailPage = lazy(() => import("./pages/admin/PurchasePlanDetailPage"));
const StockAgePage = lazy(() => import("./pages/admin/StockAgePage"));

const PosTerminalPage = lazy(() => import("./pages/pos/PosTerminalPage"));
const PosShiftsPage = lazy(() => import("./pages/pos/PosShiftsPage"));
const PosBillsPage = lazy(() => import("./pages/pos/PosBillsPage"));
const PosDailySalesPage = lazy(() => import("./pages/pos/PosDailySalesPage"));
const PosCustomersPage = lazy(() => import("./pages/pos/PosCustomersPage"));
const PosStockMovementsPage = lazy(() => import("./pages/pos/PosStockMovementsPage"));
const PosOutletSettingsPage = lazy(() => import("./pages/pos/PosOutletSettingsPage"));
const PosGrnEntryPage = lazy(() => import("./pages/pos/PosGrnEntryPage"));
const PosBulkPricePage = lazy(() => import("./pages/pos/PosBulkPricePage"));
const PosPriceHistoryPage = lazy(() => import("./pages/pos/PosPriceHistoryPage"));
const PosPromotionsPage = lazy(() => import("./pages/pos/PosPromotionsPage"));
const PosProductsPage = lazy(() => import("./pages/pos/PosProductsPage"));
const PosLowStockPage = lazy(() => import("./pages/pos/PosLowStockPage"));
const PosReportsPage = lazy(() => import("./pages/pos/PosReportsPage"));
const PosExpensesPage = lazy(() => import("./pages/pos/PosExpensesPage"));
const PosPurchaseReturnsPage = lazy(() => import("./pages/pos/PosPurchaseReturnsPage"));
const PosPayablesPage = lazy(() => import("./pages/pos/PosPayablesPage"));
const PosZReportPage = lazy(() => import("./pages/pos/PosZReportPage"));
const TerminalPage = lazy(() => import("./pages/terminal/TerminalPage"));
const LicenseSetupRequired = lazy(() => import("./pages/LicenseSetupRequired"));
const LicenseConfiguration = lazy(() => import("./pages/admin/LicenseConfiguration"));
const DbManagement = lazy(() => import("./pages/DbManagement"));

const FullScreenLoader = () => (
  <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
    <CircularProgress size={28} />
  </Box>
);

/**
 * Gate a route by a permission code from the backend registry. Unlike the
 * old role-based guard, this respects per-user overrides set by the Super
 * Admin, so revoking `nav.users` also blocks a user from visiting /admin/users
 * directly via URL — not just hiding the sidebar entry.
 */
function PermissionRoute({ children, code }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  const perms = user.permissions || [];
  if (!perms.includes(code)) return <Navigate to="/" replace />;
  return children;
}

/**
 * Legacy role guard retained for hidden routes that don't have a dedicated
 * permission code (e.g. detail pages nested under a listed parent).
 */
function RoleRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // If hosted on a pos.* subdomain (e.g. pos.merchant.com), always land on terminal
  const isPosHost = typeof window !== "undefined" && /^pos[\.-]/i.test(window.location.hostname);
  if (isPosHost) return <Navigate to="/terminal" replace />;
  if (user.role === "ServiceProvider") return <Navigate to="/admin/license-configuration" replace />;
  if (user.role === "super_admin") return <Navigate to="/admin/dashboard" replace />;
  if (user.role === "store_user" || user.role === "staff") return <Navigate to="/terminal" replace />;
  if (user.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <ThemeModeProvider>
      <NotificationProvider>
        <AuthProvider>
          <OutletProvider>
            <LicenseProvider>
              <BrowserRouter>
                <Suspense fallback={<FullScreenLoader />}>
                  <Routes>
                    <Route path="/" element={<HomeRedirect />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/license-setup-required" element={<LicenseSetupRequired />} />
                    <Route path="/admin/license-configuration" element={<PermissionRoute code="nav.license"><LicenseConfiguration /></PermissionRoute>} />

                    <Route path="/db-management" element={<PermissionRoute code="nav.db_management"><DbManagement /></PermissionRoute>} />
                    <Route path="/items/:id" element={<RoleRoute allowedRoles={["store_user","staff","manager","admin","super_admin"]}><ItemDetailPage /></RoleRoute>} />
                    <Route path="/count" element={<PermissionRoute code="nav.count"><StockCountPage /></PermissionRoute>} />

                    <Route path="/upload" element={<PermissionRoute code="nav.upload"><UploadPage /></PermissionRoute>} />
                    <Route path="/upload/history" element={<PermissionRoute code="nav.upload_history"><HistoryPage /></PermissionRoute>} />

                    <Route path="/overview" element={<PermissionRoute code="nav.overview"><OutletsOverviewPage /></PermissionRoute>} />

                    <Route path="/admin/upload-approvals" element={<PermissionRoute code="nav.upload_approvals"><UploadApprovalsPage /></PermissionRoute>} />
                    <Route path="/admin/outlets" element={<PermissionRoute code="nav.outlets"><OutletsPage /></PermissionRoute>} />
                    <Route path="/admin/users" element={<PermissionRoute code="nav.users"><UsersPage /></PermissionRoute>} />
                    <Route path="/admin/dashboard" element={<PermissionRoute code="nav.admin_dashboard"><AdminDashboardPage /></PermissionRoute>} />
                    <Route path="/admin/audit-log" element={<PermissionRoute code="nav.audit_log"><AuditLogPage /></PermissionRoute>} />
                    <Route path="/admin/negative-pos" element={<PermissionRoute code="nav.negative_pos"><NegativePosReportPage /></PermissionRoute>} />
                    <Route path="/admin/barcode-master" element={<PermissionRoute code="nav.barcode_master"><BarcodeMasterPage /></PermissionRoute>} />
                    <Route path="/admin/products/:itemId/history" element={<RoleRoute allowedRoles={["manager","admin","super_admin"]}><ProductHistoryPage /></RoleRoute>} />
                    <Route path="/admin/reports/daily-upload" element={<PermissionRoute code="nav.daily_upload_report"><DailyUploadReportPage /></PermissionRoute>} />
                    <Route path="/admin/reports/stock-variance" element={<PermissionRoute code="nav.stock_variance"><StockVarianceReportPage /></PermissionRoute>} />
                    <Route path="/admin/reports/counted-items" element={<PermissionRoute code="nav.counted_items_report"><CountedItemsReportPage /></PermissionRoute>} />
                    <Route path="/admin/mobile-devices" element={<PermissionRoute code="nav.mobile_devices"><MobileDevicesPage /></PermissionRoute>} />
                    <Route path="/admin/login-events" element={<PermissionRoute code="nav.login_events"><LoginEventsPage /></PermissionRoute>} />
                    <Route path="/admin/orphan-cleanup" element={<PermissionRoute code="nav.orphan_cleanup"><OrphanCleanupPage /></PermissionRoute>} />

                    <Route path="/super-admin/user-permissions" element={<PermissionRoute code="nav.user_permissions"><UserPermissionsPage /></PermissionRoute>} />

                    <Route path="/operations" element={<PermissionRoute code="nav.operations_hub"><OperationsHubPage /></PermissionRoute>} />
                    <Route path="/operations/today" element={<PermissionRoute code="nav.operations_today"><OperationsTodayPage /></PermissionRoute>} />
                    <Route path="/operations/reports/daily-sales" element={<PermissionRoute code="nav.report_daily_sales"><DailySalesReportPage /></PermissionRoute>} />
                    <Route path="/operations/reports/item-rankings" element={<PermissionRoute code="nav.report_item_rankings"><ItemRankingsReportPage /></PermissionRoute>} />
                    <Route path="/operations/reports/wastage" element={<PermissionRoute code="nav.report_wastage"><WastageReportPage /></PermissionRoute>} />
                    <Route path="/operations/anomalies" element={<PermissionRoute code="nav.anomalies"><AnomalyDashboardPage /></PermissionRoute>} />
                    <Route path="/operations/supplier-scorecard" element={<PermissionRoute code="nav.supplier_scorecard"><SupplierScorecardPage /></PermissionRoute>} />
                    <Route path="/admin/suppliers" element={<PermissionRoute code="nav.suppliers"><SuppliersPage /></PermissionRoute>} />
                    <Route path="/admin/categories" element={<PermissionRoute code="nav.categories"><CategoriesPage /></PermissionRoute>} />
                    <Route path="/admin/master-products" element={<PermissionRoute code="nav.master_products"><MasterProductsPage /></PermissionRoute>} />
                    <Route path="/admin/master-mapping" element={<PermissionRoute code="nav.master_mapping"><MasterMappingPage /></PermissionRoute>} />
                    <Route path="/admin/demand" element={<PermissionRoute code="nav.demand_dashboard"><DemandDashboardPage /></PermissionRoute>} />
                    <Route path="/admin/purchase-plans" element={<PermissionRoute code="nav.purchase_plans"><PurchasePlansPage /></PermissionRoute>} />
                    <Route path="/admin/purchase-plans/:id" element={<PermissionRoute code="nav.purchase_plans"><PurchasePlanDetailPage /></PermissionRoute>} />
                    <Route path="/admin/stock-age" element={<PermissionRoute code="nav.stock_age"><StockAgePage /></PermissionRoute>} />
                    <Route path="/transactions" element={<PermissionRoute code="nav.transactions_hub"><TransactionsHubPage /></PermissionRoute>} />
                    <Route path="/transactions/damage/upload" element={<PermissionRoute code="nav.damage_upload"><DamageUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/damage/history" element={<PermissionRoute code="nav.damage_history"><DamageHistoryPage /></PermissionRoute>} />
                    <Route path="/transactions/office/upload" element={<PermissionRoute code="nav.office_upload"><OfficeUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/office/history" element={<PermissionRoute code="nav.office_history"><OfficeHistoryPage /></PermissionRoute>} />
                    <Route path="/transactions/verification/upload" element={<PermissionRoute code="nav.verification_upload"><VerificationUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/verification/history" element={<PermissionRoute code="nav.verification_history"><VerificationHistoryPage /></PermissionRoute>} />
                    <Route path="/transactions/grn/upload" element={<PermissionRoute code="nav.grn_upload"><GrnUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/grn/history" element={<PermissionRoute code="nav.grn_history"><GrnHistoryPage /></PermissionRoute>} />
                    <Route path="/transactions/rts/upload" element={<PermissionRoute code="nav.rts_upload"><RtsUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/rts/history" element={<PermissionRoute code="nav.rts_history"><RtsHistoryPage /></PermissionRoute>} />
                    <Route path="/transactions/sales/upload" element={<PermissionRoute code="nav.sales_upload"><SalesUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/sales/history" element={<PermissionRoute code="nav.sales_history"><SalesHistoryPage /></PermissionRoute>} />
                    <Route path="/transactions/sales_returns/upload" element={<PermissionRoute code="nav.sales_returns_upload"><SalesReturnsUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/sales_returns/history" element={<PermissionRoute code="nav.sales_returns_history"><SalesReturnsHistoryPage /></PermissionRoute>} />

                    <Route path="/dashboard" element={<PermissionRoute code="nav.manager_dashboard"><DashboardPage /></PermissionRoute>} />
                    <Route path="/dashboard/pending" element={<PermissionRoute code="nav.pending"><PendingItemsPage /></PermissionRoute>} />
                    <Route path="/shrinkage" element={<PermissionRoute code="nav.shrinkage"><ShrinkagePage /></PermissionRoute>} />
                    <Route path="/catalog" element={<PermissionRoute code="nav.catalog"><CatalogPage /></PermissionRoute>} />
                    <Route path="/items/history" element={<PermissionRoute code="nav.item_pos_history"><ItemPosHistoryPage /></PermissionRoute>} />
                    <Route path="/product-master" element={<PermissionRoute code="nav.product_master"><ProductMasterPage /></PermissionRoute>} />
                    <Route path="/daily-counts" element={<PermissionRoute code="nav.daily_counts"><CountedStockDailyPage /></PermissionRoute>} />
                    <Route path="/count-review" element={<PermissionRoute code="nav.count_review"><CountReviewPage /></PermissionRoute>} />
                    <Route path="/variance-reconciliation" element={<PermissionRoute code="nav.variance_reconciliation"><VarianceReconciliationPage /></PermissionRoute>} />
                    <Route path="/pos" element={<PermissionRoute code="nav.pos_terminal"><PosTerminalPage /></PermissionRoute>} />
                    <Route path="/pos/shifts" element={<PermissionRoute code="nav.pos_shifts"><PosShiftsPage /></PermissionRoute>} />
                    <Route path="/pos/bills" element={<PermissionRoute code="nav.pos_bills"><PosBillsPage /></PermissionRoute>} />
                    <Route path="/pos/daily-sales" element={<PermissionRoute code="nav.pos_daily_sales"><PosDailySalesPage /></PermissionRoute>} />
                    <Route path="/pos/customers" element={<PermissionRoute code="nav.pos_customers"><PosCustomersPage /></PermissionRoute>} />
                    <Route path="/pos/stock" element={<PermissionRoute code="nav.pos_stock"><PosStockMovementsPage /></PermissionRoute>} />
                    <Route path="/pos/outlet-settings" element={<PermissionRoute code="nav.pos_outlet_settings"><PosOutletSettingsPage /></PermissionRoute>} />
                    <Route path="/pos/grn" element={<PermissionRoute code="nav.pos_grn_entry"><PosGrnEntryPage /></PermissionRoute>} />
                    <Route path="/pos/prices/bulk" element={<PermissionRoute code="nav.pos_bulk_price"><PosBulkPricePage /></PermissionRoute>} />
                    <Route path="/pos/prices/history" element={<PermissionRoute code="nav.pos_price_history"><PosPriceHistoryPage /></PermissionRoute>} />
                    <Route path="/pos/promotions" element={<PermissionRoute code="nav.pos_promotions"><PosPromotionsPage /></PermissionRoute>} />
                    <Route path="/pos/products" element={<PermissionRoute code="nav.pos_products"><PosProductsPage /></PermissionRoute>} />
                    <Route path="/pos/low-stock" element={<PermissionRoute code="nav.pos_low_stock"><PosLowStockPage /></PermissionRoute>} />
                    <Route path="/pos/reports" element={<PermissionRoute code="nav.pos_reports"><PosReportsPage /></PermissionRoute>} />
                    <Route path="/pos/expenses" element={<PermissionRoute code="nav.pos_expenses"><PosExpensesPage /></PermissionRoute>} />
                    <Route path="/pos/purchase-returns" element={<PermissionRoute code="nav.pos_rts"><PosPurchaseReturnsPage /></PermissionRoute>} />
                    <Route path="/pos/payables" element={<PermissionRoute code="nav.pos_payables"><PosPayablesPage /></PermissionRoute>} />
                    <Route path="/pos/z-report" element={<PermissionRoute code="nav.pos_shifts"><PosZReportPage /></PermissionRoute>} />
                    <Route path="/terminal" element={<PermissionRoute code="nav.pos_terminal"><TerminalPage /></PermissionRoute>} />
                    <Route path="/terminal/bills" element={<PermissionRoute code="nav.pos_terminal"><TerminalPage /></PermissionRoute>} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </LicenseProvider>
          </OutletProvider>
        </AuthProvider>
      </NotificationProvider>
    </ThemeModeProvider>
  );
}
