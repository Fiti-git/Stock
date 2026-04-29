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

// Batches / expiry
export const getItemBatches = (itemId) => api.get(`/pos/items/${itemId}/batches/`);
export const getNearExpiry = (params = {}) =>
  api.get("/pos/reports/near-expiry/", { params });
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

// Units of measure (multi-unit / weighed)
export const listUnits = () => api.get("/pos/units/");

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

// Coupons (Phase 2 Agent 7)
export const listCoupons = (params = {}) => api.get("/pos/coupons/", { params });
export const createCoupon = (payload) => api.post("/pos/coupons/", payload);
export const patchCoupon = (id, payload) => api.patch(`/pos/coupons/${id}/`, payload);
export const deleteCoupon = (id) => api.delete(`/pos/coupons/${id}/`);
export const redeemCouponCheck = ({ code, customer_id, bill_subtotal }) =>
  api.post("/pos/coupons/redeem/", {
    code,
    ...(customer_id ? { customer_id } : {}),
    bill_subtotal: String(bill_subtotal),
  });

// Tax Components (Phase 3 Agent 8)
export const listTaxComponents = (params = {}) => api.get("/pos/tax-components/", { params });
export const createTaxComponent = (payload) => api.post("/pos/tax-components/", payload);
export const patchTaxComponent = (id, payload) => api.patch(`/pos/tax-components/${id}/`, payload);
export const deleteTaxComponent = (id) => api.delete(`/pos/tax-components/${id}/`);

// GL Export + Cash Handover (Phase 3 Agent 9)
export const listGLAccounts = (params = {}) => api.get("/pos/gl-accounts/", { params });
export const createGLAccount = (payload) => api.post("/pos/gl-accounts/", payload);
export const patchGLAccount = (id, payload) => api.patch(`/pos/gl-accounts/${id}/`, payload);

export const generateGLExport = (payload) => api.post("/pos/gl-export/", payload);
export const listGLExports = (params = {}) => api.get("/pos/gl-exports/", { params });
export const getGLExport = (id) => api.get(`/pos/gl-exports/${id}/`);
export const downloadGLExport = (id) =>
  api.get(`/pos/gl-exports/${id}/download/`, { responseType: "blob" });

export const createCashHandover = (payload) => api.post("/pos/cash-handover/", payload);
export const listCashHandovers = (params = {}) => api.get("/pos/cash-handovers/", { params });

// Sales Rep + Commission (Phase 3 Agent 10)
export const listSalesReps = (params = {}) => api.get("/pos/sales-reps/", { params });
export const listCommissionRules = (params = {}) => api.get("/pos/commission-rules/", { params });
export const createCommissionRule = (payload) => api.post("/pos/commission-rules/", payload);
export const patchCommissionRule = (id, payload) => api.patch(`/pos/commission-rules/${id}/`, payload);
export const deleteCommissionRule = (id) => api.delete(`/pos/commission-rules/${id}/`);
export const getCommissionReport = (params = {}) => api.get("/pos/commission-report/", { params });

// Purchase Orders (Phase 4 Agent 12)
export const listPurchaseOrders = (params = {}) => api.get("/pos/purchase-orders/", { params });
export const getPurchaseOrder = (id) => api.get(`/pos/purchase-orders/${id}/`);
export const createPurchaseOrder = (payload) => api.post("/pos/purchase-orders/", payload);
export const patchPurchaseOrder = (id, payload) => api.patch(`/pos/purchase-orders/${id}/`, payload);
export const submitPurchaseOrder = (id) => api.post(`/pos/purchase-orders/${id}/submit/`, {});
export const cancelPurchaseOrder = (id, reason = "") => api.post(`/pos/purchase-orders/${id}/cancel/`, { reason });
export const closePurchaseOrder = (id) => api.post(`/pos/purchase-orders/${id}/close/`, {});
export const getPoOutstandingLines = (id) => api.get(`/pos/purchase-orders/${id}/lines/`, { params: { status: "outstanding" } });

// Gift cards (Phase 2 Agent 7)
export const listGiftCards = (params = {}) => api.get("/pos/gift-cards/", { params });
export const issueGiftCard = (payload) => api.post("/pos/gift-cards/", payload);
export const getGiftCard = (serial) => api.get(`/pos/gift-cards/${serial}/`);
export const adjustGiftCard = (serial, amount, note = "") =>
  api.post(`/pos/gift-cards/${serial}/adjust/`, { amount: String(amount), note });
export const voidGiftCard = (serial) => api.post(`/pos/gift-cards/${serial}/void/`, {});

// Phase 4 Agent 13 — Payment gateways + SMS receipts
export const listPaymentGateways = (params = {}) =>
  api.get("/pos/payment-gateways/", { params });
export const createPaymentGateway = (payload) =>
  api.post("/pos/payment-gateways/", payload);
export const patchPaymentGateway = (id, payload) =>
  api.patch(`/pos/payment-gateways/${id}/`, payload);
export const deletePaymentGateway = (id) =>
  api.delete(`/pos/payment-gateways/${id}/`);
export const initiatePayment = (payload) =>
  api.post("/pos/initiate-payment/", payload);
export const getPaymentIntent = (id) =>
  api.get(`/pos/payment-intents/${id}/`);

export const listSmsConfigs = (params = {}) =>
  api.get("/pos/sms-configs/", { params });
export const createSmsConfig = (payload) =>
  api.post("/pos/sms-configs/", payload);
export const patchSmsConfig = (id, payload) =>
  api.patch(`/pos/sms-configs/${id}/`, payload);
export const deleteSmsConfig = (id) =>
  api.delete(`/pos/sms-configs/${id}/`);
