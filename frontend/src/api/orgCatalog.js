import api from "./client";

export const getMasterProducts = ({ q, active, categoryId, supplierId, page, pageSize } = {}) =>
  api.get("/org/master-products/", {
    params: {
      ...(q ? { q } : {}),
      ...(active != null ? { active: active ? "1" : "0" } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(page ? { page } : {}),
      ...(pageSize ? { page_size: pageSize } : {}),
    },
  });

export const getMasterProductOptions = () => api.get("/org/master-products/options/");

export const createMasterProduct = (data) => api.post("/org/master-products/", data);
export const updateMasterProduct = (id, data) => api.patch(`/org/master-products/${id}/`, data);
export const deleteMasterProduct = (id) => api.delete(`/org/master-products/${id}/`);

// --- Mapping ---
export const getUnmappedItems = ({ q, outletId, page, pageSize } = {}) =>
  api.get("/org/item-links/unmapped/", {
    params: {
      ...(q ? { q } : {}),
      ...(outletId ? { outlet_id: outletId } : {}),
      ...(page ? { page } : {}),
      ...(pageSize ? { page_size: pageSize } : {}),
    },
  });

export const getMappingStats = () => api.get("/org/item-links/stats/");

export const suggestMasters = (itemId, limit = 5) =>
  api.get("/org/master-products/suggest/", { params: { item_id: itemId, limit } });

export const createItemLink = (data) => api.post("/org/item-links/", data);
export const bulkCreateItemLinks = (links) =>
  api.post("/org/item-links/bulk/", { links });
export const deleteItemLink = (id) => api.delete(`/org/item-links/${id}/`);

export const getItemLinks = ({ masterId } = {}) =>
  api.get("/org/item-links/", {
    params: { ...(masterId ? { master_id: masterId } : {}) },
  });

// --- Demand ---
export const getDemand = ({ q, outletId, categoryId, supplierId, page, pageSize } = {}) =>
  api.get("/org/demand/", {
    params: {
      ...(q ? { q } : {}),
      ...(outletId ? { outlet_id: outletId } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(page ? { page } : {}),
      ...(pageSize ? { page_size: pageSize } : {}),
    },
  });
export const getDemandSummary = () => api.get("/org/demand/summary/");

// --- Purchase Plans ---
export const getPurchasePlans = () => api.get("/org/purchase-plans/");
export const getPurchasePlan = (id) => api.get(`/org/purchase-plans/${id}/`);
export const createPurchasePlan = (data) => api.post("/org/purchase-plans/", data);
export const updatePurchasePlan = (id, data) => api.patch(`/org/purchase-plans/${id}/`, data);
export const deletePurchasePlan = (id) => api.delete(`/org/purchase-plans/${id}/`);
export const approvePurchasePlan = (id) => api.post(`/org/purchase-plans/${id}/approve/`);
export const updatePlanLine = (planId, lineId, data) =>
  api.patch(`/org/purchase-plans/${planId}/lines/${lineId}/`, data);
export const deletePlanLine = (planId, lineId) =>
  api.delete(`/org/purchase-plans/${planId}/lines/${lineId}/`);
export const planExportUrl = (id) => `/org/purchase-plans/${id}/export/`;
