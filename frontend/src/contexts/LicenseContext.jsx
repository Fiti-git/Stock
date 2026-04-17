import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getLicenseStatus } from "../api/license";

const LicenseContext = createContext(null);

export function LicenseProvider({ children }) {
  const [license, setLicense] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("license") || "{}");
    } catch {
      return {};
    }
  });

  const fetchLicense = useCallback(async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      const { data } = await getLicenseStatus();
      setLicense(data);
      localStorage.setItem("license", JSON.stringify(data));
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    fetchLicense();
  }, [fetchLicense]);

  const hasFeature = (code) => license.features?.includes(code) ?? true;
  const licenseState = license.state || "active";
  const isReadOnly = licenseState === "readonly";
  const isServiceProvider = () => {
    const token = localStorage.getItem("access_token");
    if (!token) return false;
    try {
      const decoded = JSON.parse(atob(token.split(".")[1]));
      return decoded.role === "ServiceProvider";
    } catch {
      return false;
    }
  };

  return (
    <LicenseContext.Provider
      value={{ license, hasFeature, licenseState, isReadOnly, isServiceProvider, fetchLicense }}
    >
      {children}
    </LicenseContext.Provider>
  );
}

export const useLicense = () => useContext(LicenseContext);
