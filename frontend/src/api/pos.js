import api from "./client";

// Shifts
export const getMyOpenShift = () => api.get("/pos/shifts/my-open/");
export const openShift = (openingCash = 0) =>
  api.post("/pos/shifts/open/", { opening_cash: openingCash });
export const closeShift = (shiftId, countedCash, closingNote = "") =>
  api.post(`/pos/shifts/${shiftId}/close/`, { counted_cash: countedCash, closing_note: closingNote });
export const listShifts = (params = {}) => api.get("/pos/shifts/", { params });

// Products
export const searchProducts = (q) => api.get("/pos/products/search/", { params: { q } });
export const productByBarcode = (barcode) =>
  api.get("/pos/products/by-barcode/", { params: { barcode } });
export const quickProducts = (limit = 12) => api.get("/pos/products/quick/", { params: { limit } });

// Bills
export const createBill = (payload) => api.post("/pos/bills/create/", payload);
export const voidBill = (billId, reason) =>
  api.post(`/pos/bills/${billId}/void/`, { reason });
export const getBill = (billId) => api.get(`/pos/bills/${billId}/`);
export const listBills = (params = {}) => api.get("/pos/bills/", { params });

// Customers
export const searchCustomers = (q) => api.get("/pos/customers/search/", { params: { q } });
export const listCustomers = (params = {}) => api.get("/pos/customers/", { params });
export const createCustomer = (payload) => api.post("/pos/customers/", payload);
export const updateCustomer = (id, payload) => api.patch(`/pos/customers/${id}/`, payload);
export const deactivateCustomer = (id) => api.delete(`/pos/customers/${id}/`);

// Stock
export const listStockMovements = (params = {}) =>
  api.get("/pos/stock/movements/", { params });
export const adjustStock = (itemId, qtyChange, note = "") =>
  api.post("/pos/stock/adjust/", { item_id: itemId, qty_change: qtyChange, note });

// Outlet settings
export const getOutletSettings = (outletId) =>
  api.get(`/pos/outlets/${outletId}/settings/`);
export const updateOutletSettings = (outletId, payload) => {
  // Handle FormData for file uploads
  const isForm = payload instanceof FormData;
  return api.patch(`/pos/outlets/${outletId}/settings/`, payload, isForm ? {
    headers: { "Content-Type": "multipart/form-data" },
  } : undefined);
};

// GRN + pricing
export const submitGrnEntry = (payload) => api.post("/pos/grn/", payload);
export const bulkPriceUpdate = (updates, note = "") =>
  api.post("/pos/prices/bulk-update/", { updates, note });
export const getPriceHistory = (params = {}) =>
  api.get("/pos/prices/history/", { params });

// Customer credit
export const adjustCustomerCredit = (customerId, amount, kind = "topup", note = "") =>
  api.post(`/pos/customers/${customerId}/credit/`, { amount, kind, note });
export const getCustomerCreditHistory = (customerId) =>
  api.get(`/pos/customers/${customerId}/credit/history/`);

// Suppliers (autocomplete)
export const searchSuppliers = (q) => api.get("/pos/suppliers/search/", { params: { q } });

// Promotions
export const listPromotions = (params = {}) => api.get("/pos/promotions/", { params });
export const createPromotion = (payload) => api.post("/pos/promotions/", payload);
export const updatePromotion = (id, payload) => api.patch(`/pos/promotions/${id}/`, payload);
export const deletePromotion = (id) => api.delete(`/pos/promotions/${id}/`);
export const getActivePromotions = (itemIds = []) =>
  api.get("/pos/promotions/active/", { params: itemIds.length ? { item_ids: itemIds.join(",") } : {} });

// Products (SME mode)
export const listProducts = (params = {}) => api.get("/pos/products/", { params });
export const createProduct = (payload) => api.post("/pos/products/", payload);
export const updateProduct = (id, payload) => api.patch(`/pos/products/${id}/`, payload);
export const deleteProduct = (id) => api.delete(`/pos/products/${id}/`);
export const importProductsCsv = (file) => {
  const fd = new FormData(); fd.append("file", file);
  return api.post("/pos/products/import/", fd, { headers: { "Content-Type": "multipart/form-data" } });
};

// Reports
export const getLowStock = () => api.get("/pos/reports/low-stock/");
export const getTopSelling = (params = {}) => api.get("/pos/reports/top-selling/", { params });
export const getProfitReport = (params = {}) => api.get("/pos/reports/profit/", { params });
export const getTaxSummary = (params = {}) => api.get("/pos/reports/tax-summary/", { params });
export const getShiftZReport = (shiftId) => api.get(`/pos/shifts/${shiftId}/z-report/`);

// Expenses
export const listExpenses = (params = {}) => api.get("/pos/expenses/", { params });
export const createExpense = (payload) => api.post("/pos/expenses/", payload);

// Purchase Returns (RTS)
export const listPurchaseReturns = (params = {}) => api.get("/pos/purchase-returns/", { params });
export const createPurchaseReturn = (payload) => api.post("/pos/purchase-returns/create/", payload);

// Supplier payables
export const getSupplierPayables = () => api.get("/pos/suppliers/payables/");
export const createSupplierPayment = (payload) => api.post("/pos/suppliers/payments/", payload);
export const getSupplierLedger = (supplierId) => api.get(`/pos/suppliers/${supplierId}/ledger/`);

// Reports
export const getDailyPosSales = (params = {}) =>
  api.get("/pos/reports/daily-sales/", { params });
