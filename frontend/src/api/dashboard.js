import api from "./client";

const outletParam = (outletId) =>
  outletId ? { params: { outlet: outletId } } : undefined;

export const getCountProgress = (outletId) =>
  api.get("/dashboard/count-progress/", outletParam(outletId));
export const getVariances = (outletId, page = 1, pageSize = 50) =>
  api.get("/dashboard/variances/", {
    params: { ...(outletId ? { outlet: outletId } : {}), page, page_size: pageSize },
  });

export const getAdminSummary = () =>
  api.get("/dashboard/admin-summary/");
export const getAlerts = (outletId) =>
  api.get("/dashboard/alerts/", outletParam(outletId));
export const getCountItems = (outletId, countDate, page = 1) => {
  const config = outletParam(outletId) || { params: {} };
  if (countDate) config.params = { ...config.params, count_date: countDate };
  config.params = { ...config.params, page };
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

export const getDailyCounts = ({ outletId, dateFrom, dateTo, search, approvalStatus, page = 1, pageSize = 20 } = {}) =>
  api.get("/dashboard/daily-counts/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(search ? { search } : {}),
      ...(approvalStatus ? { approval_status: approvalStatus } : {}),
      page,
      page_size: pageSize,
    },
  });

export const approveCount = (countId) =>
  api.post(`/dashboard/counts/${countId}/approve/`);
export const rejectCount = (countId, reason) =>
  api.post(`/dashboard/counts/${countId}/reject/`, { reason });
export const bulkApproveCounts = (ids) =>
  api.post(`/dashboard/counts/bulk-approve/`, { ids });

export const listCountSessions = (params = {}) =>
  api.get("/dashboard/count-sessions/", { params });
export const closeCountSession = (sessionId) =>
  api.post(`/dashboard/count-sessions/${sessionId}/close/`);

export const listVarianceRecords = (params = {}) =>
  api.get("/dashboard/variance-records/", { params });
export const resolveVarianceRecord = (recordId, { status, note, adjustment_qty } = {}) =>
  api.post(`/dashboard/variance-records/${recordId}/resolve/`, {
    status, note, adjustment_qty,
  });
export const bulkResolveVariance = (ids, { status, note } = {}) =>
  api.post(`/dashboard/variance-records/bulk-resolve/`, { ids, status, note });

export const getMobileDevices = ({ q = "", outletId = null } = {}) =>
  api.get("/dashboard/mobile-devices/", {
    params: {
      ...(q ? { q } : {}),
      ...(outletId ? { outlet: outletId } : {}),
    },
  });

export const getDailyUploadReport = ({ fromDate, toDate, outletId } = {}) =>
  api.get("/dashboard/daily-upload-report/", {
    params: {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
      ...(outletId ? { outlet: outletId } : {}),
    },
  });

export const getDailyUploadNewItems = ({ outletId, date } = {}) =>
  api.get("/dashboard/daily-upload-report/new-items/", {
    params: { outlet: outletId, date },
  });

export const getStockVarianceReport = ({ outletId, date } = {}) =>
  api.get("/dashboard/stock-variance-report/", {
    params: { outlet: outletId, date },
  });

export const getCountedItemsReport = ({ outletId, fromDate, toDate } = {}) =>
  api.get("/dashboard/counted-items-report/", {
    params: {
      outlet: outletId,
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    },
  });
