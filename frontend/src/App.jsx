import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { ThemeModeProvider } from "./theme/ThemeModeContext";
import { NotificationProvider } from "./providers/NotificationProvider";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OutletProvider } from "./contexts/OutletContext";
import { LicenseProvider } from "./contexts/LicenseContext";
import LoginPage from "./pages/auth/LoginPage";
import UploadPage from "./pages/store-user/UploadPage";
import HistoryPage from "./pages/store-user/HistoryPage";
import StockCountPage from "./pages/store-user/StockCountPage";
import ItemDetailPage from "./pages/store-user/ItemDetailPage";
import DashboardPage from "./pages/manager/DashboardPage";
import PendingItemsPage from "./pages/manager/PendingItemsPage";
import ShrinkagePage from "./pages/manager/ShrinkagePage";
import CatalogPage from "./pages/manager/CatalogPage";
import ItemPosHistoryPage from "./pages/manager/ItemPosHistoryPage";
import UploadApprovalsPage from "./pages/admin/UploadApprovalsPage";
import OutletsPage from "./pages/admin/OutletsPage";
import UsersPage from "./pages/admin/UsersPage";
import OutletsOverviewPage from "./pages/admin/OutletsOverviewPage";
import AuditLogPage from "./pages/admin/AuditLogPage";
import NegativePosReportPage from "./pages/admin/NegativePosReportPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import ProductMasterPage from "./pages/manager/ProductMasterPage";
import CountedStockDailyPage from "./pages/manager/CountedStockDailyPage";
import BarcodeMasterPage from "./pages/admin/BarcodeMasterPage";
import ProductHistoryPage from "./pages/admin/ProductHistoryPage";
import DailyUploadReportPage from "./pages/admin/DailyUploadReportPage";
import MobileDevicesPage from "./pages/admin/MobileDevicesPage";
import LoginEventsPage from "./pages/admin/LoginEventsPage";
import OrphanCleanupPage from "./pages/admin/OrphanCleanupPage";
import UserPermissionsPage from "./pages/super-admin/UserPermissionsPage";
import DamageUploadPage from "./pages/transactions/DamageUploadPage";
import DamageHistoryPage from "./pages/transactions/DamageHistoryPage";
import OfficeUploadPage from "./pages/transactions/OfficeUploadPage";
import OfficeHistoryPage from "./pages/transactions/OfficeHistoryPage";
import VerificationUploadPage from "./pages/transactions/VerificationUploadPage";
import VerificationHistoryPage from "./pages/transactions/VerificationHistoryPage";
import GrnUploadPage from "./pages/transactions/GrnUploadPage";
import GrnHistoryPage from "./pages/transactions/GrnHistoryPage";
import RtsUploadPage from "./pages/transactions/RtsUploadPage";
import RtsHistoryPage from "./pages/transactions/RtsHistoryPage";
import SalesUploadPage from "./pages/transactions/SalesUploadPage";
import SalesHistoryPage from "./pages/transactions/SalesHistoryPage";
import SalesReturnsUploadPage from "./pages/transactions/SalesReturnsUploadPage";
import SalesReturnsHistoryPage from "./pages/transactions/SalesReturnsHistoryPage";
import TransactionsHubPage from "./pages/transactions/TransactionsHubPage";
import OperationsTodayPage from "./pages/operations/OperationsTodayPage";
import DailySalesReportPage from "./pages/operations/DailySalesReportPage";
import ItemRankingsReportPage from "./pages/operations/ItemRankingsReportPage";
import WastageReportPage from "./pages/operations/WastageReportPage";
import AnomalyDashboardPage from "./pages/operations/AnomalyDashboardPage";
import OperationsHubPage from "./pages/operations/OperationsHubPage";
import SupplierScorecardPage from "./pages/operations/SupplierScorecardPage";
import SuppliersPage from "./pages/admin/SuppliersPage";
import CategoriesPage from "./pages/admin/CategoriesPage";

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
  if (user.role === "ServiceProvider") return <Navigate to="/admin/license-configuration" replace />;
  if (user.role === "super_admin") return <Navigate to="/admin/dashboard" replace />;
  if (user.role === "store_user" || user.role === "staff") return <Navigate to="/count" replace />;
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
