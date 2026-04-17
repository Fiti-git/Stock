import api from "./client";

export const getDbStatus = () => api.get("/db/status/");
export const listBackups = () => api.get("/db/backups/");
export const createBackup = () => api.post("/db/backup/");
export const uploadBackup = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/db/backups/upload/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const restoreBackup = (filename) => api.post("/db/restore/", { filename });
export const deleteBackup = (filename) => api.delete(`/db/backups/${encodeURIComponent(filename)}/`);
export const downloadBackup = (filename) =>
  api.get(`/db/backups/${encodeURIComponent(filename)}/download/`, { responseType: "blob" });
