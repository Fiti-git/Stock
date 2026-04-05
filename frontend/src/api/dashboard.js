import api from "./client";

const outletParam = (outletId) =>
  outletId ? { params: { outlet: outletId } } : undefined;

export const getCountProgress = (outletId) =>
  api.get("/dashboard/count-progress/", outletParam(outletId));
export const getVariances = (outletId) =>
  api.get("/dashboard/variances/", outletParam(outletId));
export const getAlerts = (outletId) =>
  api.get("/dashboard/alerts/", outletParam(outletId));
export const getCountItems = (outletId) =>
  api.get("/dashboard/count-items/", outletParam(outletId));
export const submitCount = (itemId, actualQty, locationTag = "") =>
  api.post("/dashboard/counts/", { item_id: itemId, actual_qty: actualQty, location_tag: locationTag });
