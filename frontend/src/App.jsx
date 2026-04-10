import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OutletProvider } from "./contexts/OutletContext";
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
import ProductMasterPage from "./pages/manager/ProductMasterPage";

function RoleRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "store_user" || user.role === "staff") return <Navigate to="/count" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <OutletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Item detail route */}
          <Route
            path="/items/:id"
            element={
              <RoleRoute allowedRoles={["store_user", "staff", "manager", "admin"]}>
                <ItemDetailPage />
              </RoleRoute>
            }
          />

          {/* Count entry route */}
          <Route
            path="/count"
            element={
              <RoleRoute allowedRoles={["store_user", "staff", "manager", "admin"]}>
                <StockCountPage />
              </RoleRoute>
            }
          />

          {/* Store user routes */}
          <Route
            path="/upload"
            element={
              <RoleRoute allowedRoles={["store_user", "manager", "admin"]}>
                <UploadPage />
              </RoleRoute>
            }
          />
          <Route
            path="/upload/history"
            element={
              <RoleRoute allowedRoles={["store_user", "manager", "admin"]}>
                <HistoryPage />
              </RoleRoute>
            }
          />

          {/* Overview — manager + admin */}
          <Route
            path="/overview"
            element={
              <RoleRoute allowedRoles={["manager", "admin"]}>
                <OutletsOverviewPage />
              </RoleRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin/upload-approvals"
            element={
              <RoleRoute allowedRoles={["admin"]}>
                <UploadApprovalsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/outlets"
            element={
              <RoleRoute allowedRoles={["admin"]}>
                <OutletsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RoleRoute allowedRoles={["admin"]}>
                <UsersPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/audit-log"
            element={
              <RoleRoute allowedRoles={["admin"]}>
                <AuditLogPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/negative-pos"
            element={
              <RoleRoute allowedRoles={["admin"]}>
                <NegativePosReportPage />
              </RoleRoute>
            }
          />

          {/* Manager routes */}
          <Route
            path="/dashboard"
            element={
              <RoleRoute allowedRoles={["manager", "admin"]}>
                <DashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/dashboard/pending"
            element={
              <RoleRoute allowedRoles={["manager", "admin"]}>
                <PendingItemsPage />
              </RoleRoute>
            }
          />
          {/* Shrinkage analytics */}
          <Route
            path="/shrinkage"
            element={
              <RoleRoute allowedRoles={["manager", "admin"]}>
                <ShrinkagePage />
              </RoleRoute>
            }
          />
          {/* Product catalog */}
          <Route
            path="/catalog"
            element={
              <RoleRoute allowedRoles={["manager", "admin"]}>
                <CatalogPage />
              </RoleRoute>
            }
          />
          {/* Product POS history */}
          <Route
            path="/items/history"
            element={
              <RoleRoute allowedRoles={["manager", "admin"]}>
                <ItemPosHistoryPage />
              </RoleRoute>
            }
          />
          {/* Product Master CRUD */}
          <Route
            path="/product-master"
            element={
              <RoleRoute allowedRoles={["manager", "admin"]}>
                <ProductMasterPage />
              </RoleRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      </OutletProvider>
    </AuthProvider>
  );
}
