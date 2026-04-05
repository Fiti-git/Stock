import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const OutletContext = createContext(null);

export function OutletProvider({ children }) {
  const { user } = useAuth();
  const [selectedOutlet, setSelectedOutletState] = useState(null);

  // On user change, initialize selectedOutlet
  useEffect(() => {
    if (!user) {
      setSelectedOutletState(null);
      return;
    }
    if (user.role === "admin") {
      // Restore last selection for admin, or null (will be set by Layout selector)
      const saved = localStorage.getItem("admin_selected_outlet");
      if (saved) {
        try {
          setSelectedOutletState(JSON.parse(saved));
        } catch {
          setSelectedOutletState(null);
        }
      }
    } else {
      // Non-admin: locked to their own outlet
      setSelectedOutletState(
        user.outlet_id ? { id: user.outlet_id } : null
      );
    }
  }, [user]);

  const setSelectedOutlet = (outlet) => {
    setSelectedOutletState(outlet);
    if (user?.role === "admin") {
      if (outlet) {
        localStorage.setItem("admin_selected_outlet", JSON.stringify(outlet));
      } else {
        localStorage.removeItem("admin_selected_outlet");
      }
    }
  };

  // The outlet id to pass to API calls (null = no override, backend uses user.outlet)
  const outletId =
    user?.role === "admin" ? selectedOutlet?.id ?? null : null;

  return (
    <OutletContext.Provider value={{ selectedOutlet, setSelectedOutlet, outletId }}>
      {children}
    </OutletContext.Provider>
  );
}

export const useOutlet = () => useContext(OutletContext);
