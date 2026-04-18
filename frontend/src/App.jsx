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

const LicenseSetupRequired = lazy(() => import("./pages/LicenseSetupRequired"));
const LicenseConfiguration = lazy(() => import("./pages/admin/LicenseConfiguration"));
const DbManagement = lazy(() => import("./pages/DbManagement"));

const FullScreenLoader = () => (
  <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
    <CircularProgress size={28} />
  </Box>
);

function RoleRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "ServiceProvider" && allowedRoles?.includes("admin")) return children;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "ServiceProvider") return <Navigate to="/admin/license-configuration" replace />;
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
                    <Route path="/admin/license-configuration" element={<RoleRoute allowedRoles={["admin"]}><LicenseConfiguration /></RoleRoute>} />

                    <Route path="/db-management" element={<RoleRoute allowedRoles={["store_user","staff","manager","admin"]}><DbManagement /></RoleRoute>} />
                    <Route path="/items/:id" element={<RoleRoute allowedRoles={["store_user","staff","manager","admin"]}><ItemDetailPage /></RoleRoute>} />
                    <Route path="/count" element={<RoleRoute allowedRoles={["store_user","staff","manager","admin"]}><StockCountPage /></RoleRoute>} />

                    <Route path="/upload" element={<RoleRoute allowedRoles={["store_user","manager","admin"]}><UploadPage /></RoleRoute>} />
                    <Route path="/upload/history" element={<RoleRoute allowedRoles={["store_user","manager","admin"]}><HistoryPage /></RoleRoute>} />

                    <Route path="/overview" element={<RoleRoute allowedRoles={["manager","admin"]}><OutletsOverviewPage /></RoleRoute>} />

                    <Route path="/admin/upload-approvals" element={<RoleRoute allowedRoles={["admin"]}><UploadApprovalsPage /></RoleRoute>} />
                    <Route path="/admin/outlets" element={<RoleRoute allowedRoles={["admin"]}><OutletsPage /></RoleRoute>} />
                    <Route path="/admin/users" element={<RoleRoute allowedRoles={["admin"]}><UsersPage /></RoleRoute>} />
                    <Route path="/admin/dashboard" element={<RoleRoute allowedRoles={["admin"]}><AdminDashboardPage /></RoleRoute>} />
                    <Route path="/admin/audit-log" element={<RoleRoute allowedRoles={["admin"]}><AuditLogPage /></RoleRoute>} />
                    <Route path="/admin/negative-pos" element={<RoleRoute allowedRoles={["admin"]}><NegativePosReportPage /></RoleRoute>} />
                    <Route path="/admin/barcode-master" element={<RoleRoute allowedRoles={["admin"]}><BarcodeMasterPage /></RoleRoute>} />
                    <Route path="/admin/products/:itemId/history" element={<RoleRoute allowedRoles={["manager","admin"]}><ProductHistoryPage /></RoleRoute>} />
                    <Route path="/admin/reports/daily-upload" element={<RoleRoute allowedRoles={["admin"]}><DailyUploadReportPage /></RoleRoute>} />
                    <Route path="/admin/mobile-devices" element={<RoleRoute allowedRoles={["admin"]}><MobileDevicesPage /></RoleRoute>} />
                    <Route path="/admin/login-events" element={<RoleRoute allowedRoles={["admin"]}><LoginEventsPage /></RoleRoute>} />
                    <Route path="/admin/orphan-cleanup" element={<RoleRoute allowedRoles={["admin"]}><OrphanCleanupPage /></RoleRoute>} />

                    <Route path="/dashboard" element={<RoleRoute allowedRoles={["manager","admin"]}><DashboardPage /></RoleRoute>} />
                    <Route path="/dashboard/pending" element={<RoleRoute allowedRoles={["manager","admin"]}><PendingItemsPage /></RoleRoute>} />
                    <Route path="/shrinkage" element={<RoleRoute allowedRoles={["manager","admin"]}><ShrinkagePage /></RoleRoute>} />
                    <Route path="/catalog" element={<RoleRoute allowedRoles={["manager","admin"]}><CatalogPage /></RoleRoute>} />
                    <Route path="/items/history" element={<RoleRoute allowedRoles={["manager","admin"]}><ItemPosHistoryPage /></RoleRoute>} />
                    <Route path="/product-master" element={<RoleRoute allowedRoles={["manager","admin"]}><ProductMasterPage /></RoleRoute>} />
                    <Route path="/daily-counts" element={<RoleRoute allowedRoles={["manager","admin"]}><CountedStockDailyPage /></RoleRoute>} />
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
