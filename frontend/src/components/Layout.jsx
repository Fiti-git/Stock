import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOutlet } from "../contexts/OutletContext";
import { getOutlets } from "../api/outlets";

// ── SVG icons ──────────────────────────────────────────────────────────────
const Icon = {
  count: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  upload: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  ),
  history: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  overview: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  dashboard: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  pending: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  shrinkage: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  ),
  catalog: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  productMaster: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  posHistory: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  approvals: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  outlets: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  auditlog: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  negativePos: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 12H4" />
    </svg>
  ),
  chevronLeft: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  logout: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { selectedOutlet, setSelectedOutlet } = useOutlet();
  const location = useLocation();
  const [outlets, setOutlets] = useState([]);
  // Desktop: open by default; mobile: closed by default
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640);
  // Desktop-only collapsed (icon-only) mode
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") {
      getOutlets()
        .then(({ data }) => {
          setOutlets(data);
          if (!selectedOutlet && data.length > 0) {
            setSelectedOutlet({ id: data[0].id, name: data[0].outlet_name });
          }
        })
        .catch(() => {});
    }
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (window.innerWidth < 640) setSidebarOpen(false);
  }, [location.pathname]);

  const navLinks =
    user?.role === "store_user"
      ? [
          { to: "/count", label: "Stock Count", icon: Icon.count },
          { to: "/upload", label: "Upload XLS", icon: Icon.upload },
          { to: "/upload/history", label: "History", icon: Icon.history },
        ]
      : user?.role === "staff"
      ? [{ to: "/count", label: "Stock Count", icon: Icon.count }]
      : user?.role === "admin"
      ? [
          { to: "/admin/dashboard", label: "Dashboard", icon: Icon.dashboard },
          { to: "/overview", label: "Overview", icon: Icon.overview },
          { to: "/dashboard/pending", label: "Pending Items", icon: Icon.pending },
          { to: "/shrinkage", label: "Shrinkage", icon: Icon.shrinkage },
          { to: "/catalog", label: "Product Catalog", icon: Icon.catalog },
          { to: "/product-master", label: "Product Master", icon: Icon.productMaster },
          { to: "/items/history", label: "POS History", icon: Icon.posHistory },
          { to: "/daily-counts", label: "Counted Stock Daily", icon: Icon.count },
          { to: "/upload", label: "Upload XLS", icon: Icon.upload },
          { to: "/upload/history", label: "History", icon: Icon.history },
          { to: "/admin/upload-approvals", label: "Approvals", icon: Icon.approvals },
          { to: "/admin/outlets", label: "Outlets", icon: Icon.outlets },
          { to: "/admin/users", label: "Users", icon: Icon.users },
          { to: "/admin/audit-log", label: "Audit Log", icon: Icon.auditlog },
          { to: "/admin/negative-pos", label: "Negative POS", icon: Icon.negativePos },
        ]
      : [
          // manager
          { to: "/overview", label: "Overview", icon: Icon.overview },
          { to: "/dashboard", label: "Dashboard", icon: Icon.dashboard },
          { to: "/dashboard/pending", label: "Pending Items", icon: Icon.pending },
          { to: "/shrinkage", label: "Shrinkage", icon: Icon.shrinkage },
          { to: "/catalog", label: "Product Catalog", icon: Icon.catalog },
          { to: "/product-master", label: "Product Master", icon: Icon.productMaster },
          { to: "/items/history", label: "POS History", icon: Icon.posHistory },
          { to: "/daily-counts", label: "Counted Stock Daily", icon: Icon.count },
          { to: "/upload", label: "Upload XLS", icon: Icon.upload },
          { to: "/upload/history", label: "History", icon: Icon.history },
        ];

  // On desktop, toggle icon-only collapse; on mobile, open/close drawer
  const handleToggle = () => {
    if (window.innerWidth >= 640) {
      setSidebarCollapsed((c) => !c);
    } else {
      setSidebarOpen((o) => !o);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          bg-brand-700 text-white flex flex-col z-40 transition-all duration-200
          fixed inset-y-0 left-0 sm:static sm:flex
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}
          ${sidebarCollapsed ? "sm:w-14" : "w-56"}
        `}
      >
        {/* Sidebar header */}
        <div className={`flex items-center border-b border-brand-600 h-14 shrink-0 ${sidebarCollapsed ? "justify-center px-0" : "justify-between px-4"}`}>
          {!sidebarCollapsed && (
            <span className="font-bold text-sm tracking-tight truncate">Arunalu Stock</span>
          )}
          <button
            onClick={() => {
              if (window.innerWidth >= 640) {
                setSidebarCollapsed((c) => !c);
              } else {
                setSidebarOpen(false);
              }
            }}
            className="p-1.5 rounded hover:bg-brand-600 transition-colors shrink-0"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? Icon.chevronRight : Icon.chevronLeft}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {navLinks.map((l) => {
            const active = location.pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                title={l.label}
                className={`flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? "bg-brand-600 font-medium" : "hover:bg-brand-600/70"
                } ${sidebarCollapsed ? "justify-center" : ""}`}
              >
                {l.icon}
                {!sidebarCollapsed && <span className="truncate">{l.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer — username + logout */}
        <div className={`border-t border-brand-600 p-3 shrink-0 ${sidebarCollapsed ? "flex justify-center" : ""}`}>
          {sidebarCollapsed ? (
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded hover:bg-brand-600 transition-colors"
            >
              {Icon.logout}
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-white/70 truncate">{user?.username}</span>
              <button
                onClick={logout}
                className="flex items-center gap-1 px-2 py-1.5 bg-white/10 rounded hover:bg-white/20 transition-colors text-xs shrink-0"
              >
                {Icon.logout}
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0">
          {/* Hamburger — shows on mobile; on desktop toggles collapse */}
          <button
            onClick={handleToggle}
            className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Toggle sidebar"
          >
            {Icon.menu}
          </button>

          <span className="font-semibold text-gray-800 text-sm hidden sm:block">Arunalu Stock Count</span>

          <div className="flex-1" />

          {/* Outlet selector — admin only */}
          {user?.role === "admin" && outlets.length > 0 && (
            <select
              value={selectedOutlet?.id ?? ""}
              onChange={(e) => {
                const found = outlets.find((o) => o.id === Number(e.target.value));
                if (found) setSelectedOutlet({ id: found.id, name: found.outlet_name });
              }}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white max-w-40 truncate"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.outlet_name}</option>
              ))}
            </select>
          )}

          <span className="text-sm text-gray-500 hidden sm:inline">{user?.username}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
