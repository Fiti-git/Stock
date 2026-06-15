import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { availableSystems, ACTIVE_SYSTEM_STORAGE_KEY } from "../routes/config";

const SystemContext = createContext(null);

function loadStored(systems) {
  try {
    const saved = localStorage.getItem(ACTIVE_SYSTEM_STORAGE_KEY);
    if (saved && systems.includes(saved)) return saved;
  } catch { /* ignore */ }
  return systems[0] || null;
}

export function SystemProvider({ children }) {
  const { user } = useAuth();
  const systems = useMemo(() => availableSystems(user), [user]);
  const [activeSystem, setActiveSystemState] = useState(() => loadStored(systems));

  useEffect(() => {
    if (systems.length === 0) {
      setActiveSystemState(null);
      return;
    }
    if (!activeSystem || !systems.includes(activeSystem)) {
      setActiveSystemState(loadStored(systems));
    }
  }, [systems]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveSystem = useCallback((sys) => {
    if (!systems.includes(sys)) return;
    try { localStorage.setItem(ACTIVE_SYSTEM_STORAGE_KEY, sys); } catch { /* ignore */ }
    setActiveSystemState(sys);
  }, [systems]);

  const value = useMemo(
    () => ({ activeSystem, setActiveSystem, systems }),
    [activeSystem, setActiveSystem, systems],
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export const useSystem = () => useContext(SystemContext);
