// Offline sync worker for POS bills.
// Pairs with backend's Idempotency-Key support on POST /api/pos/bills/create/.

import {
  enqueueBill,
  listPendingBills,
  markSyncing,
  markDone,
  markFailed,
  markQueued,
  removeDone,
} from "./offlineQueue";

const CREATE_BILL_URL = "/pos/bills/create/";
const SYNC_INTERVAL_MS = 30000;
const SYNCING_STALE_MS = 30000;

const NETWORK_ERROR_CODES = new Set(["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"]);
const RETRY_HTTP_STATUS = new Set([408, 425, 429]);

const listeners = new Set();

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function subscribeQueueChanges(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (very rough): timestamp + random.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function isNetworkError(err) {
  if (!err) return false;
  if (err.message === "Network Error") return true;
  if (err.code && NETWORK_ERROR_CODES.has(err.code)) return true;
  // Axios sets err.response only on HTTP errors. If no response, it's a network/transport error.
  if (!err.response) return true;
  return false;
}

async function postBill(apiClient, payload, idempotencyKey) {
  return apiClient.post(CREATE_BILL_URL, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function submitBill(apiClient, payload, idempotencyKey) {
  const key = idempotencyKey || newIdempotencyKey();

  // If we already know we're offline, skip the network call.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const id = await enqueueBill(payload, key);
    notifyListeners();
    return { queued: true, id, idempotencyKey: key };
  }

  try {
    const res = await postBill(apiClient, payload, key);
    return res;
  } catch (err) {
    if (isNetworkError(err)) {
      const id = await enqueueBill(payload, key);
      notifyListeners();
      return { queued: true, id, idempotencyKey: key };
    }
    // Non-network error (4xx/5xx with response) — bubble up to caller.
    throw err;
  }
}

let _draining = false;

export async function drainQueue(apiClient) {
  if (_draining) return;
  _draining = true;
  try {
    const rows = await listPendingBills();
    for (const row of rows) {
      if (row.status === "done" || row.status === "failed") continue;
      if (row.status === "syncing") {
        // Skip rows currently mid-flight unless stale.
        if (row.lastAttemptAt && Date.now() - row.lastAttemptAt < SYNCING_STALE_MS) {
          continue;
        }
      }
      // Skip if we're offline now.
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;

      try {
        await markSyncing(row.id);
        notifyListeners();
        const res = await postBill(apiClient, row.payload, row.idempotencyKey);
        await markDone(row.id, {
          status: res.status,
          data: res.data,
        });
        notifyListeners();
      } catch (err) {
        if (isNetworkError(err)) {
          await markQueued(row.id, err);
          notifyListeners();
          // Stop draining; we'll retry next tick.
          break;
        }
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500 && !RETRY_HTTP_STATUS.has(status)) {
          await markFailed(row.id, err?.response?.data || err);
          notifyListeners();
          continue;
        }
        // 5xx or 408/425/429 — leave queued for retry.
        await markQueued(row.id, err);
        notifyListeners();
      }
    }
    // Best-effort cleanup of long-completed rows.
    try { await removeDone(); } catch { /* ignore */ }
  } finally {
    _draining = false;
  }
}

export function startOfflineSync(apiClient) {
  const onOnline = () => { drainQueue(apiClient); };
  const onTick = () => { drainQueue(apiClient); };

  window.addEventListener("online", onOnline);
  const intervalId = window.setInterval(onTick, SYNC_INTERVAL_MS);

  // Kick off an initial drain in case there are leftovers from a previous session.
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    drainQueue(apiClient);
  }

  return function stop() {
    window.removeEventListener("online", onOnline);
    window.clearInterval(intervalId);
  };
}
