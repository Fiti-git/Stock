import api from "./client";

export const getDbStatus = () => api.get("/db/status/");
export const listBackups = () => api.get("/db/backups/");
export const createBackup = () => api.post("/db/backup/");
export const restoreBackup = (filename) => api.post("/db/restore/", { filename });
export const deleteBackup = (filename) => api.delete(`/db/backups/${encodeURIComponent(filename)}/`);
export const downloadBackupUrl = (filename) => `/api/db/backups/${encodeURIComponent(filename)}/download/`;
