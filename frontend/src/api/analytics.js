import api from "./client";

export const getShrinkage = ({ outletId, period = "weekly", from, to, category } = {}) => {
  const params = {};
  if (outletId) params.outlet = outletId;
  if (period) params.period = period;
  if (from) params.from = from;
  if (to) params.to = to;
  if (category) params.category = category;
  return api.get("/dashboard/shrinkage/", { params });
};
