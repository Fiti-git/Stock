import api from "./client";

// ----- Orders (admin) -----
export const listEcomOrders = (params = {}) =>
  api.get("/ecom/admin/orders/", { params });
export const getEcomOrder = (number) =>
  api.get(`/ecom/orders/${number}/`);
export const confirmEcomPayment = (number, payment_intent_ref = "") =>
  api.post(`/ecom/orders/${number}/confirm-payment/`, { payment_intent_ref });
export const cancelEcomOrder = (number, reason = "") =>
  api.post(`/ecom/orders/${number}/cancel/`, { reason });

// ----- Product enrichment -----
export const listEcomProducts = (params = {}) =>
  api.get("/ecom/admin/products/", { params });
export const getEcomProduct = (itemId) =>
  api.get(`/ecom/admin/products/${itemId}/`);
export const upsertEcomDescription = (itemId, payload) =>
  api.put(`/ecom/admin/products/${itemId}/description/`, payload);
export const uploadEcomImage = (itemId, file, { alt_text = "", sort_order = 0 } = {}) => {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("alt_text", alt_text);
  fd.append("sort_order", String(sort_order));
  return api.post(`/ecom/admin/products/${itemId}/images/`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const deleteEcomImage = (itemId, imageId) =>
  api.delete(`/ecom/admin/products/${itemId}/images/${imageId}/`);

// ----- Price lists -----
export const listPriceLists = () =>
  api.get("/ecom/admin/price-lists/");
export const createPriceList = (payload) =>
  api.post("/ecom/admin/price-lists/", payload);
export const getPriceList = (id) =>
  api.get(`/ecom/admin/price-lists/${id}/`);
export const updatePriceList = (id, payload) =>
  api.patch(`/ecom/admin/price-lists/${id}/`, payload);
export const deletePriceList = (id) =>
  api.delete(`/ecom/admin/price-lists/${id}/`);
export const setPriceListItem = (id, payload) =>
  api.post(`/ecom/admin/price-lists/${id}/items/`, payload);
export const deletePriceListItem = (id, itemId) =>
  api.delete(`/ecom/admin/price-lists/${id}/items/${itemId}/`);
