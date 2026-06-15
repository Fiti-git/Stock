import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { ThemeModeProvider } from "./theme/ThemeModeContext";
import { NotificationProvider } from "./providers/NotificationProvider";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OutletProvider } from "./contexts/OutletContext";
import { SystemProvider } from "./contexts/SystemContext";
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
const CountReviewPage = lazy(() => import("./pages/manager/CountReviewPage"));
const CountSessionsPage = lazy(() => import("./pages/manager/CountSessionsPage"));
const CountSessionDetailPage = lazy(() => import("./pages/manager/CountSessionDetailPage"));
const CounterPerformancePage = lazy(() => import("./pages/manager/CounterPerformancePage"));
const SheetDetailPage = lazy(() => import("./pages/manager/SheetDetailPage"));
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
const OfficeUploadPage = lazy(() => import("./pages/transactions/OfficeUploadPage"));
const VerificationUploadPage = lazy(() => import("./pages/transactions/VerificationUploadPage"));
const GrnUploadPage = lazy(() => import("./pages/transactions/GrnUploadPage"));
const RtsUploadPage = lazy(() => import("./pages/transactions/RtsUploadPage"));
const SalesUploadPage = lazy(() => import("./pages/transactions/SalesUploadPage"));
const SalesReturnsUploadPage = lazy(() => import("./pages/transactions/SalesReturnsUploadPage"));
const TransactionsHubPage = lazy(() => import("./pages/transactions/TransactionsHubPage"));
const SuppliersPage = lazy(() => import("./pages/admin/SuppliersPage"));
const CategoriesPage = lazy(() => import("./pages/admin/CategoriesPage"));
const MasterProductsPage = lazy(() => import("./pages/admin/MasterProductsPage"));
const MasterMappingPage = lazy(() => import("./pages/admin/MasterMappingPage"));
const DemandDashboardPage = lazy(() => import("./pages/admin/DemandDashboardPage"));
const PurchasePlansPage = lazy(() => import("./pages/admin/PurchasePlansPage"));
const PurchasePlanDetailPage = lazy(() => import("./pages/admin/PurchasePlanDetailPage"));
const StockAgePage = lazy(() => import("./pages/admin/StockAgePage"));
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
  return <Navigate to="/select-app" replace />;
}

export default function App() {
  return (
    <ThemeModeProvider>
      <NotificationProvider>
        <AuthProvider>
          <OutletProvider>
            <SystemProvider>
              <BrowserRouter>
                <Suspense fallback={<FullScreenLoader />}>
                  <Routes>
                    <Route path="/" element={<HomeRedirect />} />
                    <Route path="/select-app" element={<SelectAppPage />} />
                    <Route path="/login" element={<LoginPage />} />

                    <Route path="/db-management" element={<PermissionRoute code="nav.db_management"><DbManagement /></PermissionRoute>} />
                    <Route path="/items/:id" element={<RoleRoute allowedRoles={["store_user","staff","manager","admin","super_admin"]}><ItemDetailPage /></RoleRoute>} />
                    <Route path="/count" element={<PermissionRoute code="nav.count"><StockCountPage /></PermissionRoute>} />

                    <Route path="/upload" element={<PermissionRoute code="nav.upload"><UploadPage /></PermissionRoute>} />
                    <Route path="/upload/history" element={<Navigate to="/uploaded-sheets?pipeline=pos" replace />} />

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
                    <Route path="/admin/reports/count-coverage" element={<Navigate to="/admin/reports/counted-items" replace />} />
                    <Route path="/admin/reports/counted-items" element={<PermissionRoute code="nav.counted_items_report"><CountedItemsReportPage /></PermissionRoute>} />
                    <Route path="/admin/mobile-devices" element={<PermissionRoute code="nav.mobile_devices"><MobileDevicesPage /></PermissionRoute>} />
                    <Route path="/admin/login-events" element={<PermissionRoute code="nav.login_events"><LoginEventsPage /></PermissionRoute>} />
                    <Route path="/admin/orphan-cleanup" element={<PermissionRoute code="nav.orphan_cleanup"><OrphanCleanupPage /></PermissionRoute>} />

                    <Route path="/super-admin/user-permissions" element={<PermissionRoute code="nav.user_permissions"><UserPermissionsPage /></PermissionRoute>} />

                    <Route path="/admin/suppliers" element={<PermissionRoute code="nav.suppliers"><SuppliersPage /></PermissionRoute>} />
                    <Route path="/admin/categories" element={<PermissionRoute code="nav.categories"><CategoriesPage /></PermissionRoute>} />
                    <Route path="/admin/master-products" element={<PermissionRoute code="nav.master_products"><MasterProductsPage /></PermissionRoute>} />
                    <Route path="/admin/master-mapping" element={<PermissionRoute code="nav.master_mapping"><MasterMappingPage /></PermissionRoute>} />
                    <Route path="/admin/demand" element={<PermissionRoute code="nav.demand_dashboard"><DemandDashboardPage /></PermissionRoute>} />
                    <Route path="/admin/purchase-plans" element={<PermissionRoute code="nav.purchase_plans"><PurchasePlansPage /></PermissionRoute>} />
                    <Route path="/admin/purchase-plans/:id" element={<PermissionRoute code="nav.purchase_plans"><PurchasePlanDetailPage /></PermissionRoute>} />
                    <Route path="/admin/stock-age" element={<PermissionRoute code="nav.stock_age"><StockAgePage /></PermissionRoute>} />

                    {/* Transactions hub + per-pipeline upload pages. Histories now live in /uploaded-sheets?pipeline=<x>. */}
                    <Route path="/transactions" element={<PermissionRoute code="nav.transactions_hub"><TransactionsHubPage /></PermissionRoute>} />
                    <Route path="/transactions/damage/upload" element={<PermissionRoute code="nav.damage_upload"><DamageUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/office/upload" element={<PermissionRoute code="nav.office_upload"><OfficeUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/verification/upload" element={<PermissionRoute code="nav.verification_upload"><VerificationUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/grn/upload" element={<PermissionRoute code="nav.grn_upload"><GrnUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/rts/upload" element={<PermissionRoute code="nav.rts_upload"><RtsUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/sales/upload" element={<PermissionRoute code="nav.sales_upload"><SalesUploadPage /></PermissionRoute>} />
                    <Route path="/transactions/sales_returns/upload" element={<PermissionRoute code="nav.sales_returns_upload"><SalesReturnsUploadPage /></PermissionRoute>} />

                    {/* Legacy per-pipeline history URLs → unified Uploaded Sheets browser. */}
                    <Route path="/transactions/damage/history"        element={<Navigate to="/uploaded-sheets?pipeline=damage" replace />} />
                    <Route path="/transactions/office/history"        element={<Navigate to="/uploaded-sheets?pipeline=office" replace />} />
                    <Route path="/transactions/verification/history"  element={<Navigate to="/uploaded-sheets?pipeline=verification" replace />} />
                    <Route path="/transactions/grn/history"           element={<Navigate to="/uploaded-sheets?pipeline=grn" replace />} />
                    <Route path="/transactions/rts/history"           element={<Navigate to="/uploaded-sheets?pipeline=rts" replace />} />
                    <Route path="/transactions/sales/history"         element={<Navigate to="/uploaded-sheets?pipeline=sales" replace />} />
                    <Route path="/transactions/sales_returns/history" element={<Navigate to="/uploaded-sheets?pipeline=sales_returns" replace />} />

                    <Route path="/dashboard" element={<PermissionRoute code="nav.manager_dashboard"><DashboardPage /></PermissionRoute>} />
                    <Route path="/dashboard/pending" element={<PermissionRoute code="nav.pending"><PendingItemsPage /></PermissionRoute>} />
                    <Route path="/uploaded-sheets" element={<PermissionRoute code="nav.uploaded_sheets"><UploadedSheetsPage /></PermissionRoute>} />
                    <Route path="/uploaded-sheets/:id" element={<PermissionRoute code="nav.uploaded_sheets"><SheetDetailPage /></PermissionRoute>} />
                    <Route path="/upload/hub" element={<Navigate to="/transactions" replace />} />
                    <Route path="/shrinkage" element={<PermissionRoute code="nav.shrinkage"><ShrinkagePage /></PermissionRoute>} />
                    <Route path="/catalog" element={<PermissionRoute code="nav.catalog"><CatalogPage /></PermissionRoute>} />
                    <Route path="/items/history" element={<PermissionRoute code="nav.item_pos_history"><ItemPosHistoryPage /></PermissionRoute>} />
                    <Route path="/product-master" element={<PermissionRoute code="nav.product_master"><ProductMasterPage /></PermissionRoute>} />
                    <Route path="/count-sessions" element={<PermissionRoute code="nav.count_sessions"><CountSessionsPage /></PermissionRoute>} />
                    <Route path="/count-sessions/:id" element={<PermissionRoute code="nav.count_sessions"><CountSessionDetailPage /></PermissionRoute>} />
                    <Route path="/daily-counts" element={<Navigate to="/count-sessions" replace />} />
                    <Route path="/count-review" element={<PermissionRoute code="nav.count_review"><CountReviewPage /></PermissionRoute>} />
                    <Route path="/reports/counter-performance" element={<PermissionRoute code="nav.counter_performance"><CounterPerformancePage /></PermissionRoute>} />
                    <Route path="/reports/mobile-usage" element={<Navigate to="/admin/mobile-devices" replace />} />
                    <Route path="/variance-reconciliation" element={<PermissionRoute code="nav.variance_reconciliation"><VarianceReconciliationPage /></PermissionRoute>} />

                    {/* Legacy super-admin operations routes — kept the sub-reports off. */}
                    <Route path="/operations/*" element={<Navigate to="/admin/dashboard" replace />} />
                    {/* Legacy transfer routes — Transfers app removed 2026-05-20. */}
                    <Route path="/transfers/*" element={<Navigate to="/admin/dashboard" replace />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </SystemProvider>
          </OutletProvider>
        </AuthProvider>
      </NotificationProvider>
    </ThemeModeProvider>
  );
}
