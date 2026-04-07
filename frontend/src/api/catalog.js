import api from "./client";

export const getCatalog = (params) => api.get("/items/catalog/", { params });

export const getItemPriceHistory = (itemId) => api.get(`/items/${itemId}/price-history/`);
