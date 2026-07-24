import api from "./client";

export const getLocations = ({ activeOnly } = {}) =>
  api.get("/locations/", {
    params: activeOnly ? { is_active: "true" } : {},
  });

export const createLocation = (data) => api.post("/locations/", data);
export const updateLocation = (id, data) => api.patch(`/locations/${id}/`, data);
export const deleteLocation = (id) => api.delete(`/locations/${id}/`);
