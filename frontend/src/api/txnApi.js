/**
 * Factory that returns the full set of API bindings for a transaction-upload
 * type. Each type lives under `/uploads/<typePath>/...` on the backend, so we
 * only need to vary the URL prefix to get a complete API module.
 *
 *    // damage.js
 *    import { makeTxnApi } from "./txnApi";
 *    export default makeTxnApi("damage");
 */
import api from "./client";

export function makeTxnApi(typePath) {
  const base = `/uploads/${typePath}`;

  const validate = (file, { outletId, dateFrom, dateTo } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (outletId) form.append("outlet_id", outletId);
    if (dateFrom) form.append("date_from", dateFrom);
    if (dateTo) form.append("date_to", dateTo);
    return api.post(`${base}/validate/`, form, { headers: { "Content-Type": "multipart/form-data" } });
  };

  const confirm = (file, { outletId, dateFrom, dateTo, replaceOverlapping } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (outletId) form.append("outlet_id", outletId);
    if (dateFrom) form.append("date_from", dateFrom);
    if (dateTo) form.append("date_to", dateTo);
    if (replaceOverlapping) form.append("replace_overlapping", "true");
    return api.post(`${base}/confirm/`, form, { headers: { "Content-Type": "multipart/form-data" } });
  };

  const listBatches = ({ outletId, approvalStatus, includeDeleted, page, pageSize } = {}) =>
    api.get(`${base}/batches/`, {
      params: {
        ...(outletId ? { outlet_id: outletId } : {}),
        ...(approvalStatus ? { approval_status: approvalStatus } : {}),
        ...(includeDeleted ? { include_deleted: 1 } : {}),
        ...(page ? { page } : {}),
        ...(pageSize ? { page_size: pageSize } : {}),
      },
    });

  const getStats = ({ outletId } = {}) =>
    api.get(`${base}/stats/`, {
      params: { ...(outletId ? { outlet_id: outletId } : {}) },
    });

  const getBatchDetail = (id, { page, pageSize } = {}) =>
    api.get(`${base}/batches/${id}/`, {
      params: {
        ...(page ? { page } : {}),
        ...(pageSize ? { page_size: pageSize } : {}),
      },
    });
  const getDeletionPreview = (id) => api.get(`${base}/batches/${id}/deletion-preview/`);
  const deleteBatch = (id) => api.delete(`${base}/batches/${id}/delete/`);
  const approveBatch = (id) => api.post(`${base}/batches/${id}/approve/`);
  const rejectBatch = (id, reason = "") => api.post(`${base}/batches/${id}/reject/`, { reason });
  const overview = ({ fromDate, toDate } = {}) =>
    api.get(`${base}/overview/`, {
      params: {
        ...(fromDate ? { from_date: fromDate } : {}),
        ...(toDate ? { to_date: toDate } : {}),
      },
    });

  return {
    validate, confirm, listBatches, getStats, getBatchDetail, getDeletionPreview,
    deleteBatch, approveBatch, rejectBatch, overview,
  };
}
