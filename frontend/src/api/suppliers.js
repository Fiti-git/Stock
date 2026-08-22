import api from "./client";

export const getSupplier = (id) => api.get(`/uploads/suppliers/${id}/`);

export const getSuppliers = ({ q, active, page, pageSize } = {}) =>
  api.get("/uploads/suppliers/", {
    params: {
      ...(q ? { q } : {}),
      ...(active != null ? { active: active ? "1" : "0" } : {}),
      ...(page ? { page } : {}),
      ...(pageSize ? { page_size: pageSize } : {}),
    },
  });

export const createSupplier = (data) => api.post("/uploads/suppliers/", data);
export const updateSupplier = (id, data) => api.patch(`/uploads/suppliers/${id}/`, data);
export const deleteSupplier = (id) => api.delete(`/uploads/suppliers/${id}/`);

export const getSupplierScorecard = ({ fromDate, toDate, outletId } = {}) =>
  api.get("/uploads/suppliers/scorecard/", {
    params: {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
      ...(outletId ? { outlet_id: outletId } : {}),
    },
  });

export const getSupplierDetailScorecard = (code, { fromDate, toDate } = {}) =>
  api.get(`/uploads/suppliers/${encodeURIComponent(code)}/scorecard/`, {
    params: {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    },
  });
