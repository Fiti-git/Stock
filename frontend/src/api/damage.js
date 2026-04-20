import api from "./client";

export const validateDamage = (file, { outletId, dateFrom, dateTo } = {}) => {
  const form = new FormData();
  form.append("file", file);
  if (outletId) form.append("outlet_id", outletId);
  if (dateFrom) form.append("date_from", dateFrom);
  if (dateTo) form.append("date_to", dateTo);
  return api.post("/uploads/damage/validate/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const confirmDamage = (file, { outletId, dateFrom, dateTo } = {}) => {
  const form = new FormData();
  form.append("file", file);
  if (outletId) form.append("outlet_id", outletId);
  if (dateFrom) form.append("date_from", dateFrom);
  if (dateTo) form.append("date_to", dateTo);
  return api.post("/uploads/damage/confirm/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getDamageBatches = ({ outletId, approvalStatus, includeDeleted } = {}) =>
  api.get("/uploads/damage/batches/", {
    params: {
      ...(outletId ? { outlet_id: outletId } : {}),
      ...(approvalStatus ? { approval_status: approvalStatus } : {}),
      ...(includeDeleted ? { include_deleted: 1 } : {}),
    },
  });

export const getDamageBatchDetail = (batchId) =>
  api.get(`/uploads/damage/batches/${batchId}/`);

export const getDamageDeletionPreview = (batchId) =>
  api.get(`/uploads/damage/batches/${batchId}/deletion-preview/`);

export const deleteDamageBatch = (batchId) =>
  api.delete(`/uploads/damage/batches/${batchId}/delete/`);

export const approveDamageBatch = (batchId) =>
  api.post(`/uploads/damage/batches/${batchId}/approve/`);

export const rejectDamageBatch = (batchId, reason = "") =>
  api.post(`/uploads/damage/batches/${batchId}/reject/`, { reason });

export const getDamageOverview = ({ fromDate, toDate } = {}) =>
  api.get("/uploads/damage/overview/", {
    params: {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    },
  });
