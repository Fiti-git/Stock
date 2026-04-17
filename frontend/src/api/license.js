import api from "./client";

export const getLicenseConfig = () => api.get("/license/config/");
export const saveLicenseConfig = (data) => api.put("/license/config/", data);
export const testLicenseConnection = (data) => api.post("/license/config/test/", data);
export const getLicenseAudit = () => api.get("/license/config/audit/");
export const getLicenseStatus = () => api.get("/license/status/");
export const refreshLicense = () => api.post("/license/refresh/");
