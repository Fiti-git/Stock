import api from "./client";

export const validateUpload = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/uploads/validate/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const confirmUpload = (file, overwrite = false) => {
  const form = new FormData();
  form.append("file", file);
  form.append("overwrite", String(overwrite));
  return api.post("/uploads/confirm/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getUploadHistory = (outletId) =>
  api.get("/uploads/history/", outletId ? { params: { outlet: outletId } } : undefined);

export const deleteUpload = (logId) => api.delete(`/uploads/${logId}/delete/`);

export const getPendingApprovals = () => api.get("/uploads/pending-approvals/");

export const approveUpload = (logId) => api.post(`/uploads/${logId}/approve/`);

export const rejectUpload = (logId) => api.post(`/uploads/${logId}/reject/`);
