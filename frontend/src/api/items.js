import api from "./client";

export const getPendingItems = () => api.get("/items/pending/");

export const assignBarcode = (pendingId, barcode, category = "") =>
  api.post(`/items/pending/${pendingId}/assign-barcode/`, { barcode, category });

export const acceptChange = (pendingId) =>
  api.post(`/items/pending/${pendingId}/accept-change/`);

export const rejectChange = (pendingId) =>
  api.post(`/items/pending/${pendingId}/reject-change/`);

export const getItemDetail = (id) => api.get(`/items/${id}/`);
