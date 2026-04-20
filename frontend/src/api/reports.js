import api from "./client";

export const getDailySalesReport = ({ fromDate, toDate, outletId } = {}) =>
  api.get("/uploads/reports/daily-sales/", {
    params: {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
      ...(outletId ? { outlet_id: outletId } : {}),
    },
  });

export const getItemRankingsReport = ({
  fromDate, toDate, outletId, order = "top", metric = "revenue", mode = "sold", limit = 50,
} = {}) =>
  api.get("/uploads/reports/item-rankings/", {
    params: {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
      ...(outletId ? { outlet_id: outletId } : {}),
      order, metric, mode, limit,
    },
  });

export const getWastageReport = ({ fromDate, toDate, outletId } = {}) =>
  api.get("/uploads/reports/wastage/", {
    params: {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
      ...(outletId ? { outlet_id: outletId } : {}),
    },
  });
