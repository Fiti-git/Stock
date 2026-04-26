import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import { login as apiLogin } from "../api/auth";
import api from "../api/client";

const AuthContext = createContext(null);

async function fetchMe() {
  // Pull the authoritative `permissions` list from the backend. The JWT only
  // carries role/outlet; permissions can be edited at runtime by the Super
  // Admin, so we always fetch the current effective list after login and on
  // page load rather than trusting stale token claims.
  try {
    const { data } = await api.get("/auth/me/");
    return data;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrateFromToken = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const decoded = jwtDecode(token);
      if (decoded.exp * 1000 < Date.now()) {
        localStorage.clear();
        setUser(null);
        setLoading(false);
        return;
      }
      const base = {
        username: decoded.username,
        role: decoded.role,
        outlet_id: decoded.outlet_id,
        outlet_name: decoded.outlet_name ?? null,
        permissions: [],
      };
      setUser(base);
      const me = await fetchMe();
      if (me) {
        setUser({
          username: me.username,
          role: me.role,
          outlet_id: me.outlet_id,
          outlet_name: me.outlet_name ?? null,
          permissions: me.permissions || [],
          systems: me.systems || [],
        });
      }
    } catch {
      localStorage.clear();
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    hydrateFromToken();
  }, [hydrateFromToken]);

  const login = async (username, password) => {
    const { data } = await apiLogin(username, password);
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    const decoded = jwtDecode(data.access);
    let u = {
      username: decoded.username,
      role: decoded.role,
      outlet_id: decoded.outlet_id,
      outlet_name: decoded.outlet_name ?? null,
      permissions: [],
      systems: [],
    };
    const me = await fetchMe();
    if (me) {
      u = {
        username: me.username,
        role: me.role,
        outlet_id: me.outlet_id,
        outlet_name: me.outlet_name ?? null,
        permissions: me.permissions || [],
        systems: me.systems || [],
      };
    }
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const hasPermission = useCallback(
    (code) => {
      if (!user) return false;
      return (user.permissions || []).includes(code);
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
