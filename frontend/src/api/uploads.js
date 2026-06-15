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

export const listOrphans = ({ outletId, fromDate, toDate, type = "both" } = {}) =>
  api.get("/uploads/orphans/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
      type,
    },
  });

export const purgeOrphans = ({ itemIds = [], pendingIds = [] } = {}) =>
  api.post("/uploads/orphans/purge/", { item_ids: itemIds, pending_ids: pendingIds });

export const purgeAllOrphans = ({ outletId, fromDate, toDate } = {}) =>
  api.post("/uploads/orphans/purge-all/", {
    outlet: outletId,
    ...(fromDate ? { from_date: fromDate } : {}),
    ...(toDate ? { to_date: toDate } : {}),
  });

export const getPendingApprovals = () => api.get("/uploads/pending-approvals/");

export const approveUpload = (logId) => api.post(`/uploads/${logId}/approve/`);

export const rejectUpload = (logId) => api.post(`/uploads/${logId}/reject/`);

export const getAllOutletsOverview = (date) =>
  api.get("/uploads/overview/", date ? { params: { date } } : undefined);

export const getAuditLog = (params) => api.get("/uploads/audit-log/", { params });

export const getUploadDiff = (logId) => api.get(`/uploads/${logId}/diff/`);

export const getUploadedSheets = (params) =>
  api.get("/uploads/all-uploads/", { params });

export const getUploadedSheetsCoverage = (params) =>
  api.get("/uploads/all-uploads/coverage/", { params });

export const getUploadedSheetDetail = (sheetId, params = {}) =>
  api.get(`/uploads/all-uploads/${sheetId}/`, { params });

export const deleteUploadedSheet = (sheetId) =>
  api.delete(`/uploads/all-uploads/${sheetId}/delete/`);

export const bulkDeleteUploadedSheets = (sheetIds) =>
  api.post("/uploads/all-uploads/bulk-delete/", { sheet_ids: sheetIds });
