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
const UploadedSheetsPage = lazy(() => import("./pages/manager/UploadedSheetsPage"));
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
const CountSessionsPage = lazy(() => import("./pages/manager/CountSessionsPage"));
const CountSessionDetailPage = lazy(() => import("./pages/manager/CountSessionDetailPage"));
const CounterPerformancePage = lazy(() => import("./pages/manager/CounterPerformancePage"));
const MobileUsagePage = lazy(() => import("./pages/manager/MobileUsagePage"));
const SheetDetailPage = lazy(() => import("./pages/manager/SheetDetailPage"));
const UploadHubPage = lazy(() => import("./pages/manager/UploadHubPage"));
const VarianceReconciliationPage = lazy(() => import("./pages/manager/VarianceReconciliationPage"));
const BarcodeMasterPage = lazy(() => import("./pages/admin/BarcodeMasterPage"));
const ProductHistoryPage = lazy(() => import("./pages/admin/ProductHistoryPage"));
const DailyUploadReportPage = lazy(() => import("./pages/admin/DailyUploadReportPage"));
const StockVarianceReportPage = lazy(() => import("./pages/admin/StockVarianceReportPage"));
const CountCoverageReportPage = lazy(() => import("./pages/admin/CountCoverageReportPage"));
const EcomOrdersPage = lazy(() => import("./pages/admin/ecom/OrdersPage"));
const EcomProductEnrichmentPage = lazy(() => import("./pages/admin/ecom/ProductEnrichmentPage"));
const EcomPriceListsPage = lazy(() => import("./pages/admin/ecom/PriceListsPage"));
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
const PosHardwareSettingsPage = lazy(() => import("./pages/pos/PosHardwareSettingsPage"));
const PosGrnEntryPage = lazy(() => import("./pages/pos/PosGrnEntryPage"));
const PosPurchaseOrdersPage = lazy(() => import("./pages/pos/PosPurchaseOrdersPage"));
const PosBulkPricePage = lazy(() => import("./pages/pos/PosBulkPricePage"));
const PosPriceHistoryPage = lazy(() => import("./pages/pos/PosPriceHistoryPage"));
const PosPromotionsPage = lazy(() => import("./pages/pos/PosPromotionsPage"));
const PosCouponsPage = lazy(() => import("./pages/pos/PosCouponsPage"));
const PosGiftCardsPage = lazy(() => import("./pages/pos/PosGiftCardsPage"));
const PosTaxComponentsPage = lazy(() => import("./pages/pos/PosTaxComponentsPage"));
const PosCommissionRulesPage = lazy(() => import("./pages/pos/PosCommissionRulesPage"));
const PosCommissionReportPage = lazy(() => import("./pages/pos/PosCommissionReportPage"));
const PosProductsPage = lazy(() => import("./pages/pos/PosProductsPage"));
const PosLowStockPage = lazy(() => import("./pages/pos/PosLowStockPage"));
const PosNearExpiryPage = lazy(() => import("./pages/pos/PosNearExpiryPage"));
const PosReportsPage = lazy(() => import("./pages/pos/PosReportsPage"));
const PosExpensesPage = lazy(() => import("./pages/pos/PosExpensesPage"));
const PosPurchaseReturnsPage = lazy(() => import("./pages/pos/PosPurchaseReturnsPage"));
const PosPayablesPage = lazy(() => import("./pages/pos/PosPayablesPage"));
const PosZReportPage = lazy(() => import("./pages/pos/PosZReportPage"));
const PosGLAccountsPage = lazy(() => import("./pages/pos/PosGLAccountsPage"));
const PosGLExportPage = lazy(() => import("./pages/pos/PosGLExportPage"));
const PosCashHandoversPage = lazy(() => import("./pages/pos/PosCashHandoversPage"));
const PosPaymentGatewaysPage = lazy(() => import("./pages/pos/PosPaymentGatewaysPage"));
const PosSmsConfigPage = lazy(() => import("./pages/pos/PosSmsConfigPage"));
const TransferRequestPage = lazy(() => import("./pages/transfers/TransferRequestPage"));
const TransferDispatchPage = lazy(() => import("./pages/transfers/TransferDispatchPage"));
const TransferReceivePage = lazy(() => import("./pages/transfers/TransferReceivePage"));
const TransferDetailPage = lazy(() => import("./pages/transfers/TransferDetailPage"));
const TerminalPage = lazy(() => import("./pages/terminal/TerminalPage"));
const LicenseSetupRequired = lazy(() => import("./pages/LicenseSetupRequired"));
const LicenseConfiguration = lazy(() => import("./pages/admin/LicenseConfiguration"));
const DbManagement = lazy(() => import("./pages/DbManagement"));
const SelectAppPage = lazy(() => import("./pages/SelectAppPage"));

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
  // Pos.* subdomain hardware (e.g. pos.merchant.com) is dedicated terminal
  // hardware — bypass the launcher and go straight to the till.
  const isPosHost = typeof window !== "undefined" && /^pos[\.-]/i.test(window.location.hostname);
  if (isPosHost) return <Navigate to="/terminal" replace />;
  // Every other authenticated user lands on the launcher.
  return <Navigate to="/select-app" replace />;
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
                    <Route path="/select-app" element={<SelectAppPage />} />
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
                    <Route path="/admin/reports/count-coverage" element={<PermissionRoute code="nav.count_coverage"><CountCoverageReportPage /></PermissionRoute>} />
                    <Route path="/admin/ecom/orders" element={<PermissionRoute code="nav.ecom_orders"><EcomOrdersPage /></PermissionRoute>} />
                    <Route path="/admin/ecom/products" element={<PermissionRoute code="nav.ecom_products"><EcomProductEnrichmentPage /></PermissionRoute>} />
                    <Route path="/admin/ecom/price-lists" element={<PermissionRoute code="nav.ecom_price_lists"><EcomPriceListsPage /></PermissionRoute>} />
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
                    <Route path="/uploaded-sheets" element={<PermissionRoute code="nav.uploaded_sheets"><UploadedSheetsPage /></PermissionRoute>} />
                    <Route path="/uploaded-sheets/:id" element={<PermissionRoute code="nav.uploaded_sheets"><SheetDetailPage /></PermissionRoute>} />
                    <Route path="/upload/hub" element={<PermissionRoute code="nav.upload"><UploadHubPage /></PermissionRoute>} />
                    <Route path="/shrinkage" element={<PermissionRoute code="nav.shrinkage"><ShrinkagePage /></PermissionRoute>} />
                    <Route path="/catalog" element={<PermissionRoute code="nav.catalog"><CatalogPage /></PermissionRoute>} />
                    <Route path="/items/history" element={<PermissionRoute code="nav.item_pos_history"><ItemPosHistoryPage /></PermissionRoute>} />
                    <Route path="/product-master" element={<PermissionRoute code="nav.product_master"><ProductMasterPage /></PermissionRoute>} />
                    <Route path="/count-sessions" element={<PermissionRoute code="nav.count_sessions"><CountSessionsPage /></PermissionRoute>} />
                    <Route path="/count-sessions/:id" element={<PermissionRoute code="nav.count_sessions"><CountSessionDetailPage /></PermissionRoute>} />
                    <Route path="/daily-counts" element={<Navigate to="/count-sessions" replace />} />
                    <Route path="/count-review" element={<PermissionRoute code="nav.count_review"><CountReviewPage /></PermissionRoute>} />
                    <Route path="/reports/counter-performance" element={<PermissionRoute code="nav.counter_performance"><CounterPerformancePage /></PermissionRoute>} />
                    <Route path="/reports/mobile-usage" element={<PermissionRoute code="nav.mobile_usage"><MobileUsagePage /></PermissionRoute>} />
                    <Route path="/variance-reconciliation" element={<PermissionRoute code="nav.variance_reconciliation"><VarianceReconciliationPage /></PermissionRoute>} />
                    <Route path="/pos" element={<PermissionRoute code="nav.pos_terminal"><PosTerminalPage /></PermissionRoute>} />
                    <Route path="/pos/shifts" element={<PermissionRoute code="nav.pos_shifts"><PosShiftsPage /></PermissionRoute>} />
                    <Route path="/pos/bills" element={<PermissionRoute code="nav.pos_bills"><PosBillsPage /></PermissionRoute>} />
                    <Route path="/pos/daily-sales" element={<PermissionRoute code="nav.pos_daily_sales"><PosDailySalesPage /></PermissionRoute>} />
                    <Route path="/pos/customers" element={<PermissionRoute code="nav.pos_customers"><PosCustomersPage /></PermissionRoute>} />
                    <Route path="/pos/stock" element={<PermissionRoute code="nav.pos_stock"><PosStockMovementsPage /></PermissionRoute>} />
                    <Route path="/pos/outlet-settings" element={<PermissionRoute code="nav.pos_outlet_settings"><PosOutletSettingsPage /></PermissionRoute>} />
                    <Route path="/pos/hardware" element={<PermissionRoute code="nav.pos_terminal"><PosHardwareSettingsPage /></PermissionRoute>} />
                    <Route path="/pos/grn" element={<PermissionRoute code="nav.pos_grn_entry"><PosGrnEntryPage /></PermissionRoute>} />
                    <Route path="/pos/purchase-orders" element={<PermissionRoute code="nav.pos_grn_entry"><PosPurchaseOrdersPage /></PermissionRoute>} />
                    <Route path="/pos/prices/bulk" element={<PermissionRoute code="nav.pos_bulk_price"><PosBulkPricePage /></PermissionRoute>} />
                    <Route path="/pos/prices/history" element={<PermissionRoute code="nav.pos_price_history"><PosPriceHistoryPage /></PermissionRoute>} />
                    <Route path="/pos/promotions" element={<PermissionRoute code="nav.pos_promotions"><PosPromotionsPage /></PermissionRoute>} />
                    <Route path="/pos/coupons" element={<PermissionRoute code="nav.pos_promotions"><PosCouponsPage /></PermissionRoute>} />
                    <Route path="/pos/gift-cards" element={<PermissionRoute code="nav.pos_promotions"><PosGiftCardsPage /></PermissionRoute>} />
                    <Route path="/pos/tax-components" element={<PermissionRoute code="nav.pos_outlet_settings"><PosTaxComponentsPage /></PermissionRoute>} />
                    <Route path="/pos/products" element={<PermissionRoute code="nav.pos_products"><PosProductsPage /></PermissionRoute>} />
                    <Route path="/pos/low-stock" element={<PermissionRoute code="nav.pos_low_stock"><PosLowStockPage /></PermissionRoute>} />
                    <Route path="/pos/near-expiry" element={<PermissionRoute code="nav.pos_near_expiry"><PosNearExpiryPage /></PermissionRoute>} />
                    <Route path="/pos/reports" element={<PermissionRoute code="nav.pos_reports"><PosReportsPage /></PermissionRoute>} />
                    <Route path="/pos/expenses" element={<PermissionRoute code="nav.pos_expenses"><PosExpensesPage /></PermissionRoute>} />
                    <Route path="/pos/purchase-returns" element={<PermissionRoute code="nav.pos_rts"><PosPurchaseReturnsPage /></PermissionRoute>} />
                    <Route path="/pos/payables" element={<PermissionRoute code="nav.pos_payables"><PosPayablesPage /></PermissionRoute>} />
                    <Route path="/pos/z-report" element={<PermissionRoute code="nav.pos_shifts"><PosZReportPage /></PermissionRoute>} />
                    <Route path="/pos/gl-accounts" element={<PermissionRoute code="nav.pos_outlet_settings"><PosGLAccountsPage /></PermissionRoute>} />
                    <Route path="/pos/gl-export" element={<PermissionRoute code="nav.pos_reports"><PosGLExportPage /></PermissionRoute>} />
                    <Route path="/pos/cash-handovers" element={<PermissionRoute code="nav.pos_reports"><PosCashHandoversPage /></PermissionRoute>} />
                    <Route path="/pos/commission-rules" element={<PermissionRoute code="nav.pos_outlet_settings"><PosCommissionRulesPage /></PermissionRoute>} />
                    <Route path="/pos/commission-report" element={<PermissionRoute code="nav.pos_reports"><PosCommissionReportPage /></PermissionRoute>} />
                    <Route path="/pos/payment-gateways" element={<PermissionRoute code="nav.pos_outlet_settings"><PosPaymentGatewaysPage /></PermissionRoute>} />
                    <Route path="/pos/sms-config" element={<PermissionRoute code="nav.pos_outlet_settings"><PosSmsConfigPage /></PermissionRoute>} />
                    <Route path="/transfers/request" element={<PermissionRoute code="nav.transfers_request"><TransferRequestPage /></PermissionRoute>} />
                    <Route path="/transfers/dispatch" element={<PermissionRoute code="nav.transfers_dispatch"><TransferDispatchPage /></PermissionRoute>} />
                    <Route path="/transfers/receive" element={<PermissionRoute code="nav.transfers_receive"><TransferReceivePage /></PermissionRoute>} />
                    <Route path="/transfers/:id" element={<PermissionRoute code="nav.transfers"><TransferDetailPage /></PermissionRoute>} />
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
