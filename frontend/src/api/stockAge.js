import api from "./client";

export const getStockAge = ({ q, outletId, categoryId, bucket, minAgeDays, page, pageSize } = {}) =>
  api.get("/org/stock-age/", {
    params: {
      ...(q ? { q } : {}),
      ...(outletId ? { outlet_id: outletId } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(bucket ? { bucket } : {}),
      ...(minAgeDays ? { min_age_days: minAgeDays } : {}),
      ...(page ? { page } : {}),
      ...(pageSize ? { page_size: pageSize } : {}),
    },
  });

export const getStockAgeSummary = ({ outletId, categoryId } = {}) =>
  api.get("/org/stock-age/summary/", {
    params: {
      ...(outletId ? { outlet_id: outletId } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
    },
  });

export const stockAgeExportUrl = ({ outletId, bucket } = {}) => {
  const p = new URLSearchParams();
  if (outletId) p.set("outlet_id", outletId);
  if (bucket) p.set("bucket", bucket);
  const qs = p.toString();
  return `/org/stock-age/export/${qs ? `?${qs}` : ""}`;
};

export const recomputeStockAge = ({ outletId, itemCode } = {}) =>
  api.post("/org/stock-age/recompute/", {
    ...(outletId ? { outlet_id: outletId } : {}),
    ...(itemCode ? { item_code: itemCode } : {}),
  });
