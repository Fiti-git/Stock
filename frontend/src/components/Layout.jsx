import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOutlet } from "../contexts/OutletContext";
import { getOutlets } from "../api/outlets";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { selectedOutlet, setSelectedOutlet } = useOutlet();
  const location = useLocation();
  const [outlets, setOutlets] = useState([]);

  useEffect(() => {
    if (user?.role === "admin") {
      getOutlets()
        .then(({ data }) => {
          setOutlets(data);
          // Auto-select first outlet if none saved
          if (!selectedOutlet && data.length > 0) {
            setSelectedOutlet({ id: data[0].id, name: data[0].outlet_name });
          }
        })
        .catch(() => {});
    }
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const navLinks =
    user?.role === "store_user"
      ? [
          { to: "/count", label: "Stock Count" },
          { to: "/upload", label: "Upload XLS" },
          { to: "/upload/history", label: "History" },
        ]
      : user?.role === "staff"
      ? [{ to: "/count", label: "Stock Count" }]
      : user?.role === "admin"
      ? [
          { to: "/dashboard", label: "Dashboard" },
          { to: "/dashboard/pending", label: "Pending Items" },
          { to: "/shrinkage", label: "Shrinkage" },
          { to: "/count", label: "Stock Count" },
          { to: "/upload", label: "Upload XLS" },
          { to: "/upload/history", label: "History" },
          { to: "/admin/upload-approvals", label: "Approvals" },
          { to: "/admin/outlets", label: "Outlets" },
          { to: "/admin/users", label: "Users" },
        ]
      : [
          // manager
          { to: "/dashboard", label: "Dashboard" },
          { to: "/dashboard/pending", label: "Pending Items" },
          { to: "/shrinkage", label: "Shrinkage" },
          { to: "/count", label: "Stock Count" },
          { to: "/upload", label: "Upload XLS" },
          { to: "/upload/history", label: "History" },
        ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <nav className="bg-brand-700 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-lg tracking-tight">
              Arunalu Stock Count
            </span>
            <div className="hidden sm:flex gap-4 text-sm">
              {navLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`px-2 py-1 rounded hover:bg-brand-600 transition-colors ${
                    location.pathname === l.to ? "bg-brand-600 font-medium" : ""
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {/* Outlet selector — admin only */}
            {user?.role === "admin" && outlets.length > 0 && (
              <select
                value={selectedOutlet?.id ?? ""}
                onChange={(e) => {
                  const found = outlets.find((o) => o.id === Number(e.target.value));
                  if (found) setSelectedOutlet({ id: found.id, name: found.outlet_name });
                }}
                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/50 cursor-pointer"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id} className="text-gray-900">
                    {o.outlet_name}
                  </option>
                ))}
              </select>
            )}
            <span className="opacity-80">{user?.username}</span>
            <button
              onClick={logout}
              className="px-3 py-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
