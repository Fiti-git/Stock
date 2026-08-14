import api from "./client";

const outletParam = (outletId) =>
  outletId ? { params: { outlet: outletId } } : undefined;

export const getCountProgress = (outletId) =>
  api.get("/dashboard/count-progress/", outletParam(outletId));

export const getCoverageByDay = (outletId, fromDate, toDate) =>
  api.get("/dashboard/coverage-by-day/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    },
  });
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

export const getDailyCounts = ({ outletId, dateFrom, dateTo, search, approvalStatus, sessionId, page = 1, pageSize = 20 } = {}) =>
  api.get("/dashboard/daily-counts/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(search ? { search } : {}),
      ...(approvalStatus ? { approval_status: approvalStatus } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
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
export const getCountSession = (sessionId) =>
  api.get(`/dashboard/count-sessions/${sessionId}/`);
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

export const getManagerSummary = ({ outletId } = {}) =>
  api.get("/dashboard/manager-summary/", { params: outletId ? { outlet: outletId } : {} });

export const getSalesShrinkageTrend = ({ outletId, from, to } = {}) =>
  api.get("/dashboard/sales-shrinkage-trend/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
  });

export const getCategoryPerformance = ({ outletId, from, to } = {}) =>
  api.get("/dashboard/category-performance/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
  });

export const getCountsGrouped = ({
  outletId, date, page = 1, pageSize = 25, q = "",
  sortBy, order, varFilter, statusFilter,
} = {}) =>
  api.get("/dashboard/counts-grouped/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(date ? { date } : {}),
      page, page_size: pageSize,
      ...(q ? { q } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
      ...(varFilter && varFilter !== "all" ? { var_filter: varFilter } : {}),
      ...(statusFilter ? { status_filter: statusFilter } : {}),
    },
  });

// CSV download for counted modal — axios blob so JWT auth stays intact.
// Caller is responsible for turning the blob into a download.
export const downloadCountsGroupedCsv = ({
  outletId, date, q, sortBy, order, varFilter, statusFilter,
} = {}) =>
  api.get("/dashboard/counts-grouped/", {
    params: {
      export: "csv",
      ...(outletId ? { outlet: outletId } : {}),
      ...(date ? { date } : {}),
      ...(q ? { q } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
      ...(varFilter && varFilter !== "all" ? { var_filter: varFilter } : {}),
      ...(statusFilter ? { status_filter: statusFilter } : {}),
    },
    responseType: "blob",
  });

export const getCountProgress2 = ({ outletId, date } = {}) =>
  api.get("/dashboard/count-progress/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(date ? { date } : {}),
    },
  });

export const getDailyCountItems = ({
  outletId, date, q, bucket, sortBy, order, page = 1, pageSize = 25,
} = {}) =>
  api.get("/dashboard/daily-count-items/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(date ? { date } : {}),
      ...(q ? { q } : {}),
      ...(bucket && bucket !== "all" ? { bucket } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
      page, page_size: pageSize,
    },
  });

export const downloadDailyCountItemsCsv = ({
  outletId, date, q, bucket, sortBy, order,
} = {}) =>
  api.get("/dashboard/daily-count-items/", {
    params: {
      export: "csv",
      ...(outletId ? { outlet: outletId } : {}),
      ...(date ? { date } : {}),
      ...(q ? { q } : {}),
      ...(bucket && bucket !== "all" ? { bucket } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
    },
    responseType: "blob",
  });

export const getItemCoverageRange = ({
  outletId, from, to, q, bucket, sortBy, order, page = 1, pageSize = 25,
} = {}) =>
  api.get("/dashboard/item-coverage-range/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(bucket && bucket !== "all" ? { bucket } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
      page, page_size: pageSize,
    },
  });

export const downloadItemCoverageCsv = ({
  outletId, from, to, q, bucket, sortBy, order,
} = {}) =>
  api.get("/dashboard/item-coverage-range/", {
    params: {
      export: "csv",
      ...(outletId ? { outlet: outletId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(bucket && bucket !== "all" ? { bucket } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
    },
    responseType: "blob",
  });

export const getCountHistoryDetail = ({
  outletId, from, to, q, user, onlyVariance, sortBy, order, page = 1, pageSize = 50,
} = {}) =>
  api.get("/dashboard/count-history-detail/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(user ? { user } : {}),
      ...(onlyVariance ? { only_variance: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
      page, page_size: pageSize,
    },
  });

export const downloadCountHistoryDetailCsv = ({
  outletId, from, to, q, user, onlyVariance, sortBy, order,
} = {}) =>
  api.get("/dashboard/count-history-detail/", {
    params: {
      export: "csv",
      ...(outletId ? { outlet: outletId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(user ? { user } : {}),
      ...(onlyVariance ? { only_variance: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
    },
    responseType: "blob",
  });

export const getRealLoss = ({
  outletId, allOutlets, from, to, q, onlyVariance, sortBy, order, page = 1, pageSize = 25,
} = {}) =>
  api.get("/dashboard/real-loss/", {
    params: {
      ...(allOutlets ? { outlet: "all" } : (outletId ? { outlet: outletId } : {})),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(onlyVariance ? { only_variance: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
      page, page_size: pageSize,
    },
  });

export const downloadRealLossCsv = ({
  outletId, allOutlets, from, to, q, onlyVariance, sortBy, order,
} = {}) =>
  api.get("/dashboard/real-loss/", {
    params: {
      export: "csv",
      ...(allOutlets ? { outlet: "all" } : (outletId ? { outlet: outletId } : {})),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(onlyVariance ? { only_variance: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
    },
    responseType: "blob",
  });

export const getItemCountHistory = ({
  outletId, allOutlets, from, to, q, onlyVariance, sortBy, order, page = 1, pageSize = 25,
} = {}) =>
  api.get("/dashboard/item-count-history/", {
    params: {
      ...(allOutlets ? { outlet: "all" } : (outletId ? { outlet: outletId } : {})),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(onlyVariance ? { only_variance: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
      page, page_size: pageSize,
    },
  });

export const downloadItemCountHistoryCsv = ({
  outletId, allOutlets, from, to, q, onlyVariance, sortBy, order,
} = {}) =>
  api.get("/dashboard/item-count-history/", {
    params: {
      export: "csv",
      ...(allOutlets ? { outlet: "all" } : (outletId ? { outlet: outletId } : {})),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(onlyVariance ? { only_variance: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
    },
    responseType: "blob",
  });

export const getUncounted = ({
  outletId, date, page = 1, pageSize = 25, q = "",
  dailyOnly = false, recountOnly = false, sortBy, order,
} = {}) =>
  api.get("/dashboard/uncounted/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(date ? { date } : {}),
      page,
      page_size: pageSize,
      ...(q ? { q } : {}),
      ...(dailyOnly ? { daily_only: 1 } : {}),
      ...(recountOnly ? { recount_only: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
    },
  });

export const downloadUncountedCsv = ({
  outletId, date, q, dailyOnly, recountOnly, sortBy, order,
} = {}) =>
  api.get("/dashboard/uncounted/", {
    params: {
      export: "csv",
      ...(outletId ? { outlet: outletId } : {}),
      ...(date ? { date } : {}),
      ...(q ? { q } : {}),
      ...(dailyOnly ? { daily_only: 1 } : {}),
      ...(recountOnly ? { recount_only: 1 } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(order ? { order } : {}),
    },
    responseType: "blob",
  });

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

export const getCountCoverageReport = ({ outletId, dateFrom, dateTo } = {}) =>
  api.get("/dashboard/count-coverage-report/", {
    params: {
      outlet: outletId,
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
    },
  });

export const getCountedItemsReport = ({ outletId, fromDate, toDate } = {}) =>
  api.get("/dashboard/counted-items-report/", {
    params: {
      outlet: outletId,
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    },
  });

export const getCounterPerformance = ({ outletId, dateFrom, dateTo } = {}) =>
  api.get("/dashboard/counter-performance/", {
    params: {
      ...(outletId ? { outlet: outletId } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
    },
  });
