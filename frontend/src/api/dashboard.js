import api from "./client";

const outletParam = (outletId) =>
  outletId ? { params: { outlet: outletId } } : undefined;

export const getCountProgress = (outletId) =>
  api.get("/dashboard/count-progress/", outletParam(outletId));
export const getVariances = (outletId) =>
  api.get("/dashboard/variances/", outletParam(outletId));
export const getAlerts = (outletId) =>
  api.get("/dashboard/alerts/", outletParam(outletId));
export const getCountItems = (outletId, countDate) => {
  const config = outletParam(outletId) || { params: {} };
  if (countDate) config.params = { ...config.params, count_date: countDate };
  return api.get("/dashboard/count-items/", config);
};
export const submitCount = (itemId, actualQty, locationTag = "", isMonthEnd = false, countDate = null) =>
  api.post("/dashboard/counts/", {
    item_id: itemId,
    actual_qty: actualQty,
    location_tag: locationTag,
    is_month_end: isMonthEnd,
    ...(countDate ? { count_date: countDate } : {}),
  });
