import api from "./client";

// Inter-outlet stock transfer API.
// Backend routes are under /api/transfers/ (Django DRF).

export const listTransfers = (params = {}) =>
  api.get("/transfers/", { params });

export const getTransfer = (id) =>
  api.get(`/transfers/${id}/`);

export const createTransferDraft = (payload) =>
  api.post("/transfers/", payload);

export const patchTransfer = (id, payload) =>
  api.patch(`/transfers/${id}/`, payload);

export const requestTransfer = (id, note = "") =>
  api.post(`/transfers/${id}/request/`, { note });

export const dispatchTransfer = (id, lines = [], note = "") =>
  api.post(`/transfers/${id}/dispatch/`, { lines, note });

export const receiveTransfer = (id, lines = [], note = "") =>
  api.post(`/transfers/${id}/receive/`, { lines, note });

export const closeTransfer = (id, varianceNote = "") =>
  api.post(`/transfers/${id}/close/`, { variance_note: varianceNote });

export const cancelTransfer = (id, reason = "") =>
  api.post(`/transfers/${id}/cancel/`, { reason });
