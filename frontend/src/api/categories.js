import api from "./client";

export const getCategories = ({ q, active, page, pageSize } = {}) =>
  api.get("/items/categories/", {
    params: {
      ...(q ? { q } : {}),
      ...(active != null ? { active: active ? "1" : "0" } : {}),
      ...(page ? { page } : {}),
      ...(pageSize ? { page_size: pageSize } : {}),
    },
  });

export const getCategoryOptions = () => api.get("/items/categories/options/");

export const createCategory = (data) => api.post("/items/categories/", data);
export const updateCategory = (id, data) => api.patch(`/items/categories/${id}/`, data);
export const deleteCategory = (id) => api.delete(`/items/categories/${id}/`);

export const assignItemsToCategory = (id, itemIds, updateString = true) =>
  api.post(`/items/categories/${id}/assign-items/`, {
    item_ids: itemIds,
    update_category_string: updateString,
  });
