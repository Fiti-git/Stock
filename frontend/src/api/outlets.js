import api from "./client";

export const getOutlets = () => api.get("/outlets/");
export const createOutlet = (data) => api.post("/outlets/", data);
export const updateOutlet = (id, data) => api.patch(`/outlets/${id}/`, data);
export const deleteOutlet = (id) => api.delete(`/outlets/${id}/`);
