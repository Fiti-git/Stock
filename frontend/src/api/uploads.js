import api from "./client";

export const validateUpload = (file, uploadDate, outletId) => {
  const form = new FormData();
  form.append("file", file);
  if (uploadDate) form.append("upload_date", uploadDate);
  if (outletId) form.append("outlet_id", outletId);
  return api.post("/uploads/validate/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const confirmUpload = (file, overwrite = false, uploadDate, outletId, overrideOutletMismatch = false) => {
  const form = new FormData();
  form.append("file", file);
  form.append("overwrite", String(overwrite));
  if (uploadDate) form.append("upload_date", uploadDate);
  if (outletId) form.append("outlet_id", outletId);
  if (overrideOutletMismatch) form.append("override_outlet_mismatch", "true");
  return api.post("/uploads/confirm/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getUploadHistory = (outletId) =>
  api.get("/uploads/history/", outletId ? { params: { outlet: outletId } } : undefined);

export const deleteUpload = (logId) => api.delete(`/uploads/${logId}/delete/`);

export const getDeletionPreview = (logId) => api.get(`/uploads/${logId}/deletion-preview/`);

export const getPendingApprovals = () => api.get("/uploads/pending-approvals/");

export const approveUpload = (logId) => api.post(`/uploads/${logId}/approve/`);

export const rejectUpload = (logId) => api.post(`/uploads/${logId}/reject/`);

export const getAllOutletsOverview = (date) =>
  api.get("/uploads/overview/", date ? { params: { date } } : undefined);

export const getAuditLog = (params) => api.get("/uploads/audit-log/", { params });

export const getUploadDiff = (logId) => api.get(`/uploads/${logId}/diff/`);
