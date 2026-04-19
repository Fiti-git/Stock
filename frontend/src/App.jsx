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
