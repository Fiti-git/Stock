import api from "./client";

export const getPendingItems = (page = 1, outlet = null) =>
  api.get("/items/pending/", { params: { page, page_size: 10, ...(outlet ? { outlet } : {}) } });

export const assignBarcode = (pendingId, barcode, category = "") =>
  api.post(`/items/pending/${pendingId}/assign-barcode/`, { barcode, category });

export const acceptChange = (pendingId) =>
  api.post(`/items/pending/${pendingId}/accept-change/`);

export const rejectChange = (pendingId) =>
  api.post(`/items/pending/${pendingId}/reject-change/`);

export const getItemDetail = (id) => api.get(`/items/${id}/`);

export const getItemPosHistory = (itemId, page = 1, pageSize = 60) =>
  api.get(`/items/${itemId}/price-history/`, { params: { page, page_size: pageSize } });

export const searchCatalog = (q, outletId) =>
  api.get("/items/catalog/", { params: { q, outlet: outletId, page_size: 20 } });
