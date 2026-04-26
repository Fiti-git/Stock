import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getOutlets } from "../api/outlets";

const OutletContext = createContext(null);

/**
 * Outlet selection state, shared across the whole app.
 *
 * Two responsibilities live here:
 *   1. Which outlet is currently "selected" (admins can switch; non-admins
 *      are pinned to their own outlet).
 *   2. The list of all outlets the current user can pick from. Loading
 *      this lives here (not in TopBar) so multiple consumers — TopBar,
 *      sidebar OutletSwitcher, ad-hoc selectors — share one fetch.
 *
 * `selectedOutlet` shape: { id, name } | null.
 * `outlets` is the full list (only populated for admins; empty otherwise).
 */
export function OutletProvider({ children }) {
  const { user } = useAuth();
  const [selectedOutlet, setSelectedOutletState] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(false);

  // Initialise selected outlet from user / localStorage. Admins can roam;
  // non-admins lock to their assigned outlet.
  useEffect(() => {
    if (!user) {
      setSelectedOutletState(null);
      return;
    }
    if (user.role === "admin" || user.role === "super_admin") {
      const saved = localStorage.getItem("admin_selected_outlet");
      if (saved) {
        try {
          setSelectedOutletState(JSON.parse(saved));
          return;
        } catch { /* fall through */ }
      }
      setSelectedOutletState(null);
    } else {
      setSelectedOutletState(
        user.outlet_id
          ? { id: user.outlet_id, name: user.outlet_name || "" }
          : null
      );
    }
  }, [user]);

  // Fetch the outlet list once per admin login. Non-admins don't need it
  // (their selection is pinned and the dropdown is hidden).
  useEffect(() => {
    if (!user) {
      setOutlets([]);
      return;
    }
    if (user.role !== "admin" && user.role !== "super_admin") {
      setOutlets([]);
      return;
    }
    setLoading(true);
    getOutlets()
      .then(({ data }) => {
        setOutlets(data || []);
        // If nothing selected yet, default to the first outlet so the
        // outlet-aware pages aren't blocked waiting for a manual pick.
        setSelectedOutletState((cur) => {
          if (cur) return cur;
          if ((data || []).length === 0) return null;
          const first = data[0];
          const next = { id: first.id, name: first.outlet_name };
          try { localStorage.setItem("admin_selected_outlet", JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      })
      .catch(() => setOutlets([]))
      .finally(() => setLoading(false));
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSelectedOutlet = useCallback((outlet) => {
    setSelectedOutletState(outlet);
    if (user?.role === "admin" || user?.role === "super_admin") {
      if (outlet) {
        try { localStorage.setItem("admin_selected_outlet", JSON.stringify(outlet)); } catch { /* ignore */ }
      } else {
        try { localStorage.removeItem("admin_selected_outlet"); } catch { /* ignore */ }
      }
    }
  }, [user?.role]);

  const canSwitchOutlet = user?.role === "admin" || user?.role === "super_admin";

  // The outlet id to pass to API calls (null = no override, backend uses user.outlet)
  const outletId = canSwitchOutlet ? selectedOutlet?.id ?? null : null;

  return (
    <OutletContext.Provider
      value={{
        selectedOutlet,
        setSelectedOutlet,
        outletId,
        outlets,
        outletsLoading: loading,
        canSwitchOutlet,
      }}
    >
      {children}
    </OutletContext.Provider>
  );
}

export const useOutlet = () => useContext(OutletContext);
