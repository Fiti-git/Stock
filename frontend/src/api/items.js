import api from "./client";

export const getPendingItems = (page = 1, outlet = null, q = "") =>
  api.get("/items/pending/", {
    params: { page, page_size: 10, ...(outlet ? { outlet } : {}), ...(q ? { q } : {}) },
  });

export const assignBarcode = (pendingId, barcode, category = "", rack_number = "", shelf = "") =>
  api.post(`/items/pending/${pendingId}/assign-barcode/`, { barcode, category, rack_number, shelf });

export const acceptChange = (pendingId) =>
  api.post(`/items/pending/${pendingId}/accept-change/`);

export const rejectChange = (pendingId) =>
  api.post(`/items/pending/${pendingId}/reject-change/`);

export const markPendingNbci = (pendingId) =>
  api.post(`/items/pending/${pendingId}/mark-nbci/`);

export const getItemDetail = (id) => api.get(`/items/${id}/`);

export const getItemPosHistory = (itemId, page = 1, pageSize = 60) =>
  api.get(`/items/${itemId}/price-history/`, { params: { page, page_size: pageSize } });

export const searchCatalog = (q, outletId) =>
  api.get("/items/catalog/", { params: { q, outlet: outletId, page_size: 20 } });

export const updateItem = (itemId, data) =>
  api.patch(`/items/${itemId}/update/`, data);

export const listItemBarcodes = (itemId) =>
  api.get(`/items/${itemId}/barcodes/`);

export const addItemBarcode = (itemId, barcode) =>
  api.post(`/items/${itemId}/barcodes/`, { barcode });

export const deleteItemBarcode = (itemId, barcodeId) =>
  api.delete(`/items/${itemId}/barcodes/${barcodeId}/`);

export const setPrimaryBarcode = (itemId, barcodeId) =>
  api.post(`/items/${itemId}/barcodes/${barcodeId}/`);

export const getNegativePosReport = (date, outletId = null) =>
  api.get("/items/negative-pos/", {
    params: { date, ...(outletId ? { outlet: outletId } : {}) },
  });

export const getItemHistory = (itemId) =>
  api.get(`/items/${itemId}/history/`);

export const listOutletBarcodes = (outletId, { q = "", isPrimary = null, page = 1, pageSize = 50 } = {}) =>
  api.get(`/outlets/${outletId}/barcodes/`, {
    params: {
      page,
      page_size: pageSize,
      ...(q ? { q } : {}),
      ...(isPrimary === null ? {} : { is_primary: isPrimary ? "true" : "false" }),
    },
  });

export const createOutletBarcode = (outletId, payload) =>
  api.post(`/outlets/${outletId}/barcodes/`, payload);
